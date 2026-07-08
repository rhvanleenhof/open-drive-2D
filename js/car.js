import { T_GRASS, LAND_MIN, LAND_MAX } from "./world.js";

export const PX_PER_M = 12;

const ENGINE_ACCEL = 620;
const BRAKE_ACCEL = 1250;
const REVERSE_ACCEL = 380;
const MAX_SPEED = 680;
const MAX_REVERSE = 210;
const DRAG = 0.55; // per-second proportional drag
const ROLL_RESIST = 26; // constant px/s^2
const GRIP = 8.5; // lateral velocity damping per second
const GRIP_HANDBRAKE = 1.9;
const TURN_RATE = 3.1;
const SKID_LAT_THRESHOLD = 150;
const RESTITUTION = 0.35;
const DAMAGE_THRESHOLD = 240; // impact speed (px/s) below which crashes are free

const NO_INPUT = { up: false, down: false, left: false, right: false, handbrake: false };

export class SkidMarks {
  constructor(max = 2500) {
    this.segs = [];
    this.idx = 0;
    this.max = max;
  }

  add(x1, y1, x2, y2) {
    const seg = { x1, y1, x2, y2 };
    if (this.segs.length < this.max) {
      this.segs.push(seg);
    } else {
      this.segs[this.idx] = seg;
      this.idx = (this.idx + 1) % this.max;
    }
  }

  draw(ctx, view) {
    if (this.segs.length === 0) return;
    ctx.strokeStyle = "rgba(25,25,28,0.4)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const s of this.segs) {
      if (
        Math.max(s.x1, s.x2) < view.x ||
        Math.min(s.x1, s.x2) > view.x + view.w ||
        Math.max(s.y1, s.y2) < view.y ||
        Math.min(s.y1, s.y2) > view.y + view.h
      ) continue;
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();
  }
}

export class Car {
  constructor(x, y, heading, tune = {}) {
    this.x = x;
    this.y = y;
    this.heading = heading;
    this.vx = 0;
    this.vy = 0;
    this.steerVisual = 0;
    this.radius = 16;
    this.prevRL = null;
    this.prevRR = null;
    this.topSpeed = tune.topSpeed ?? MAX_SPEED;
    this.engineAccel = tune.accel ?? ENGINE_ACCEL;
    this.maxHealth = tune.health ?? 100;
    this.health = this.maxHealth;
    this.wrecked = false;
    this.smoke = [];
    this.smokeTimer = 0;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  get speedKmh() {
    return (this.speed / PX_PER_M) * 3.6;
  }

  update(dt, input, world, skids) {
    if (this.wrecked) input = NO_INPUT;
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    // Right vector is (-fy, fx).
    let vFwd = this.vx * fx + this.vy * fy;
    let vLat = this.vx * -fy + this.vy * fx;

    // Throttle / brake / reverse.
    if (input.up) {
      vFwd += this.engineAccel * dt;
    }
    if (input.down) {
      if (vFwd > 5) {
        vFwd -= BRAKE_ACCEL * dt;
      } else {
        vFwd -= REVERSE_ACCEL * dt;
      }
    }
    vFwd = Math.max(-MAX_REVERSE, Math.min(this.topSpeed, vFwd));

    // Drag and rolling resistance.
    let drag = DRAG;
    if (world.groundAt(this.x, this.y) === T_GRASS) drag += 2.1;
    if (input.handbrake) drag += 0.5;
    if (this.wrecked) drag += 2.5;
    vFwd *= Math.exp(-drag * dt);
    if (Math.abs(vFwd) < ROLL_RESIST * dt) vFwd = 0;
    else vFwd -= Math.sign(vFwd) * ROLL_RESIST * dt;

    // Lateral grip (reduced while sliding on the handbrake).
    const grip = input.handbrake ? GRIP_HANDBRAKE : GRIP;
    vLat *= Math.exp(-grip * dt);

    // Steering: no effect at standstill, softened at high speed.
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const speed = Math.hypot(vFwd, vLat);
    const speedT = Math.min(speed / 110, 1);
    const highSpeedDamp = 1 / (1 + speed / 750);
    const dir = vFwd < -5 ? -1 : 1;
    this.heading += steer * TURN_RATE * speedT * highSpeedDamp * dir * dt;
    this.steerVisual += (steer * 0.45 - this.steerVisual) * Math.min(1, dt * 12);

    // Recompose velocity along the (possibly rotated) heading.
    const nfx = Math.cos(this.heading);
    const nfy = Math.sin(this.heading);
    this.vx = vFwd * nfx + vLat * -nfy;
    this.vy = vFwd * nfy + vLat * nfx;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.resolveCollisions(world);
    this.updateSkids(vLat, skids);
    this.updateSmoke(dt);
  }

  damage(amount) {
    if (this.wrecked) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health === 0) this.wrecked = true;
  }

  repair() {
    this.health = this.maxHealth;
    this.wrecked = false;
  }

  updateSmoke(dt) {
    const distress = 1 - this.health / this.maxHealth;
    if (distress > 0.55) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = this.wrecked
          ? 0.05
          : Math.max(0.04, 0.16 - (distress - 0.55) * 0.25);
        const fx = Math.cos(this.heading);
        const fy = Math.sin(this.heading);
        this.smoke.push({
          x: this.x + fx * 16 + (Math.random() - 0.5) * 8,
          y: this.y + fy * 16 + (Math.random() - 0.5) * 8,
          vx: this.vx * 0.25 + (Math.random() - 0.5) * 30,
          vy: this.vy * 0.25 + (Math.random() - 0.5) * 30,
          age: 0,
          life: 0.7 + Math.random() * 0.7,
        });
      }
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const p = this.smoke[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.smoke.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-1.5 * dt);
      p.vy *= Math.exp(-1.5 * dt);
    }
  }

  drawSmoke(ctx) {
    for (const p of this.smoke) {
      const t = p.age / p.life;
      const shade = this.wrecked ? 45 : 110;
      ctx.fillStyle = `rgba(${shade},${shade},${shade},${(1 - t) * 0.45})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4 + t * 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  updateSkids(vLat, skids) {
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    const rl = {
      x: this.x - fx * 16 - -fy * 9,
      y: this.y - fy * 16 - fx * 9,
    };
    const rr = {
      x: this.x - fx * 16 + -fy * 9,
      y: this.y - fy * 16 + fx * 9,
    };
    const skidding = Math.abs(vLat) > SKID_LAT_THRESHOLD && this.speed > 90;
    if (skidding && this.prevRL && this.prevRR) {
      skids.add(this.prevRL.x, this.prevRL.y, rl.x, rl.y);
      skids.add(this.prevRR.x, this.prevRR.y, rr.x, rr.y);
    }
    this.prevRL = rl;
    this.prevRR = rr;
  }

  resolveCollisions(world) {
    const r = this.radius;

    for (const c of world.collidersNear(this.x, this.y, r + 8)) {
      if (c.kind === "rect") {
        const cx = Math.max(c.x, Math.min(this.x, c.x + c.w));
        const cy = Math.max(c.y, Math.min(this.y, c.y + c.h));
        let dx = this.x - cx;
        let dy = this.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 === 0) {
          // Center inside the rect: push out along the shallowest axis.
          const left = this.x - c.x, right = c.x + c.w - this.x;
          const top = this.y - c.y, bottom = c.y + c.h - this.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) { dx = -1; dy = 0; }
          else if (m === right) { dx = 1; dy = 0; }
          else if (m === top) { dx = 0; dy = -1; }
          else { dx = 0; dy = 1; }
          this.x = cx + dx * r;
          this.y = cy + dy * r;
          this.bounce(dx, dy);
        } else {
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d;
          this.x = cx + nx * r;
          this.y = cy + ny * r;
          this.bounce(nx, ny);
        }
      } else {
        const dx = this.x - c.x;
        const dy = this.y - c.y;
        const d2 = dx * dx + dy * dy;
        const minD = r + c.r;
        if (d2 >= minD * minD || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        this.x = c.x + nx * minD;
        this.y = c.y + ny * minD;
        this.bounce(nx, ny);
      }
    }

    // Shoreline bounds.
    if (this.x < LAND_MIN + r) { this.x = LAND_MIN + r; this.bounce(1, 0); }
    if (this.x > LAND_MAX - r) { this.x = LAND_MAX - r; this.bounce(-1, 0); }
    if (this.y < LAND_MIN + r) { this.y = LAND_MIN + r; this.bounce(0, 1); }
    if (this.y > LAND_MAX - r) { this.y = LAND_MAX - r; this.bounce(0, -1); }
  }

  // hardness scales crash damage; 0 means the impact is handled elsewhere.
  bounce(nx, ny, hardness = 1) {
    const vn = this.vx * nx + this.vy * ny;
    if (vn >= 0) return;
    this.vx -= (1 + RESTITUTION) * vn * nx;
    this.vy -= (1 + RESTITUTION) * vn * ny;
    this.vx *= 0.92;
    this.vy *= 0.92;
    const impact = -vn;
    if (hardness > 0 && impact > DAMAGE_THRESHOLD) {
      this.damage((impact - DAMAGE_THRESHOLD) * 0.055 * hardness);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.heading);

    // Shadow.
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.roundRect(-21, -9, 46, 24, 7);
    ctx.fill();

    // Wheels.
    ctx.fillStyle = "#1c1c20";
    const wheel = (wx, wy, angle) => {
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.roundRect(-6, -3.5, 12, 7, 2);
      ctx.fill();
      ctx.restore();
    };
    wheel(14, -11, this.steerVisual);
    wheel(14, 11, this.steerVisual);
    wheel(-15, -11, 0);
    wheel(-15, 11, 0);

    // Body.
    ctx.fillStyle = this.wrecked ? "#6e3a32" : "#d84f3f";
    ctx.beginPath();
    ctx.roundRect(-23, -12, 46, 24, 8);
    ctx.fill();
    ctx.strokeStyle = this.wrecked ? "#3f211c" : "#a33325";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Windshield and rear window.
    ctx.fillStyle = "rgba(25,32,45,0.75)";
    ctx.beginPath();
    ctx.roundRect(2, -9, 9, 18, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-15, -8.5, 7, 17, 3);
    ctx.fill();

    // Roof.
    ctx.fillStyle = this.wrecked ? "#7a4a42" : "#e46a5b";
    ctx.beginPath();
    ctx.roundRect(-8, -9.5, 10, 19, 4);
    ctx.fill();

    // Headlights.
    ctx.fillStyle = "#ffe9a8";
    ctx.fillRect(20, -10, 3, 5);
    ctx.fillRect(20, 5, 3, 5);

    ctx.restore();
  }
}

import { TILE, GRID, T_SIDEWALK, T_ROAD } from "./world.js";

const DIRS = {
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
};
const OPP = { E: "W", W: "E", N: "S", S: "N" };
const DIR_KEYS = ["E", "W", "N", "S"];

const LANE = 34; // lane center offset from road centerline (right-hand traffic)
const NODE_APPROACH = 52; // waypoint distance from intersection center
const CAR_R = 17;
const PED_R = 7;
const PLAYER_R = 16;
const KNOCK_SPEED = 60; // min player speed to knock a pedestrian down

const NPC_CAR_COLORS = [
  "#4a6fa5", "#c8b552", "#a35b5b", "#5f8a6a", "#8a6a9d",
  "#c4c4bc", "#5d5d66", "#b07040", "#6a9fb5", "#96595f",
];
const SHIRT_COLORS = [
  "#c95d4c", "#4c7fc9", "#57a05f", "#c9a04c", "#8a5fc9",
  "#4cb5b0", "#c94c8a", "#7a8a99", "#3f5f4a", "#b0764c",
];
const SKIN_COLORS = ["#e8b88a", "#c68e5f", "#8d5f3f", "#f0c9a0"];

function laneRight(d) {
  const v = DIRS[d];
  return { x: -v.y, y: v.x };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------- traffic car

class TrafficCar {
  constructor(mgr) {
    this.mgr = mgr;
    this.color = pick(NPC_CAR_COLORS);
    this.crashed = false;
    this.respawn();
  }

  respawn(avoid) {
    const mgr = this.mgr;
    for (let attempt = 0; attempt < 12; attempt++) {
      const i = Math.floor(Math.random() * mgr.cols.length);
      const j = Math.floor(Math.random() * mgr.rows.length);
      const dir = mgr.chooseDir(i, j, null);
      const next = mgr.step(i, j, dir);
      const a = mgr.nodeCenter(i, j);
      const b = mgr.nodeCenter(next.i, next.j);
      const d = DIRS[dir];
      const r = laneRight(dir);
      const t = 0.25 + Math.random() * 0.5;
      const x = a.x + (b.x - a.x) * t + r.x * LANE;
      const y = a.y + (b.y - a.y) * t + r.y * LANE;
      if (avoid && Math.hypot(x - avoid.x, y - avoid.y) < 700 && attempt < 11) continue;

      this.x = x;
      this.y = y;
      this.hx = d.x;
      this.hy = d.y;
      this.angle = Math.atan2(d.y, d.x);
      this.speed = 0;
      this.cruise = 170 + Math.random() * 90;
      this.crashed = false;
      this.crashTimer = 0;
      this.cvx = 0;
      this.cvy = 0;
      this.spin = 0;
      this.wps = [mgr.entryWp(next.i, next.j, dir)];
      return;
    }
  }

  get vx() {
    return this.crashed ? this.cvx : this.hx * this.speed;
  }

  get vy() {
    return this.crashed ? this.cvy : this.hy * this.speed;
  }

  crash(ivx, ivy) {
    if (!this.crashed) {
      this.crashed = true;
      this.spin = (Math.random() - 0.5) * 7;
    }
    this.crashTimer = 0;
    this.cvx = ivx;
    this.cvy = ivy;
  }

  update(dt, player) {
    if (this.crashed) {
      this.x += this.cvx * dt;
      this.y += this.cvy * dt;
      const k = Math.exp(-2.6 * dt);
      this.cvx *= k;
      this.cvy *= k;
      this.angle += this.spin * dt;
      this.spin *= Math.exp(-1.8 * dt);
      this.crashTimer += dt;
      if (
        this.crashTimer > 7 &&
        Math.hypot(player.x - this.x, player.y - this.y) > 1300
      ) {
        this.respawn(player);
      }
      return;
    }

    const wp = this.wps[0];
    let dx = wp.x - this.x;
    let dy = wp.y - this.y;
    let dist = Math.hypot(dx, dy);
    if (dist < Math.max(10, this.speed * dt * 2)) {
      this.mgr.advanceWp(this);
      const w2 = this.wps[0];
      dx = w2.x - this.x;
      dy = w2.y - this.y;
      dist = Math.hypot(dx, dy) || 1;
    }

    // Smoothly steer toward the current waypoint.
    const tx = dx / dist;
    const ty = dy / dist;
    const s = Math.min(1, 9 * dt);
    this.hx += (tx - this.hx) * s;
    this.hy += (ty - this.hy) * s;
    const hl = Math.hypot(this.hx, this.hy) || 1;
    this.hx /= hl;
    this.hy /= hl;
    this.angle = Math.atan2(this.hy, this.hx);

    // Target speed: slow into turns, brake for cars and the player ahead.
    let target = this.cruise;
    const front = this.wps[0];
    if (front.entry && front.nextDir !== front.dir && dist < 180) {
      target = Math.min(target, 105);
    }
    target = Math.min(target, this.obstacleSpeed(player));

    const rate = target < this.speed ? 6.5 : 1.6;
    this.speed += (target - this.speed) * Math.min(1, rate * dt);

    this.x += this.hx * this.speed * dt;
    this.y += this.hy * this.speed * dt;
  }

  obstacleSpeed(player) {
    const look = 75 + this.speed * 0.4;
    let allowed = Infinity;

    const check = (ox, oy, ospeed, width) => {
      const rx = ox - this.x;
      const ry = oy - this.y;
      const fwd = rx * this.hx + ry * this.hy;
      if (fwd < 8 || fwd > look) return;
      const lat = Math.abs(rx * -this.hy + ry * this.hx);
      if (lat > width) return;
      allowed = Math.min(allowed, fwd < 55 ? 0 : Math.max(ospeed * 0.85, 30));
    };

    for (const o of this.mgr.cars) {
      if (o === this) continue;
      if (Math.abs(o.x - this.x) > 220 || Math.abs(o.y - this.y) > 220) continue;
      check(o.x, o.y, o.crashed ? 0 : o.speed, 27);
    }
    for (const o of this.mgr.extra) {
      if (Math.abs(o.x - this.x) > 220 || Math.abs(o.y - this.y) > 220) continue;
      check(o.x, o.y, 0, 28);
    }
    check(player.x, player.y, 0, 31);
    return allowed;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.roundRect(-20, -8, 44, 21, 6);
    ctx.fill();

    ctx.fillStyle = "#1c1c20";
    ctx.fillRect(10, -11, 9, 22);
    ctx.fillRect(-17, -11, 9, 22);

    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.roundRect(-22, -10, 44, 20, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "rgba(25,32,45,0.7)";
    ctx.beginPath();
    ctx.roundRect(1, -7.5, 8, 15, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-13, -7, 6, 14, 3);
    ctx.fill();

    ctx.fillStyle = "#ffe9a8";
    ctx.fillRect(19.5, -8, 2.5, 4);
    ctx.fillRect(19.5, 4, 2.5, 4);
    ctx.fillStyle = "#d04030";
    ctx.fillRect(-22, -8, 2, 4);
    ctx.fillRect(-22, 4, 2, 4);

    ctx.restore();
  }
}

// ---------------------------------------------------------------- pedestrian

class Pedestrian {
  constructor(mgr) {
    this.mgr = mgr;
    this.shirt = pick(SHIRT_COLORS);
    this.skin = pick(SKIN_COLORS);
    this.walkSpeed = 32 + Math.random() * 26;
    this.down = false;
    this.downTimer = 0;
    this.kvx = 0;
    this.kvy = 0;
    this.spin = 0;
    this.angle = Math.random() * Math.PI * 2;

    const tile = pick(mgr.sidewalks);
    this.x = (tile.tx + 0.2 + Math.random() * 0.6) * TILE;
    this.y = (tile.ty + 0.2 + Math.random() * 0.6) * TILE;
    this.pickTarget();
  }

  pickTarget() {
    const world = this.mgr.world;
    const tx = Math.floor(this.x / TILE);
    const ty = Math.floor(this.y / TILE);
    const options = [];
    for (const k of DIR_KEYS) {
      const d = DIRS[k];
      const t1 = world.tileAt(tx + d.x, ty + d.y);
      if (t1 === T_SIDEWALK) {
        options.push({ tx: tx + d.x, ty: ty + d.y });
      } else if (
        t1 === T_ROAD &&
        world.tileAt(tx + d.x * 2, ty + d.y * 2) === T_SIDEWALK &&
        Math.random() < 0.35
      ) {
        // Cross the road to the sidewalk on the far side.
        options.push({ tx: tx + d.x * 2, ty: ty + d.y * 2 });
      }
    }
    const t = options.length ? pick(options) : { tx, ty };
    this.targetX = (t.tx + 0.25 + Math.random() * 0.5) * TILE;
    this.targetY = (t.ty + 0.25 + Math.random() * 0.5) * TILE;
  }

  knock(ivx, ivy, nx, ny) {
    this.down = true;
    this.downTimer = 3 + Math.random() * 2.5;
    this.kvx = ivx * 0.7 + nx * 70;
    this.kvy = ivy * 0.7 + ny * 70;
    this.spin = (Math.random() - 0.5) * 12;
  }

  update(dt, player) {
    if (this.down) {
      this.x += this.kvx * dt;
      this.y += this.kvy * dt;
      const k = Math.exp(-2.4 * dt);
      this.kvx *= k;
      this.kvy *= k;
      this.angle += this.spin * dt;
      this.spin *= Math.exp(-1.6 * dt);
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        this.down = false;
        this.pickTarget();
      }
    } else {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 6) {
        this.pickTarget();
      } else {
        const want = Math.atan2(dy, dx);
        let diff = want - this.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.angle += diff * Math.min(1, 8 * dt);
        this.x += Math.cos(this.angle) * this.walkSpeed * dt;
        this.y += Math.sin(this.angle) * this.walkSpeed * dt;
      }
    }

    // Hit by the player.
    const pdx = this.x - player.x;
    const pdy = this.y - player.y;
    const pd = Math.hypot(pdx, pdy);
    const pSpeed = Math.hypot(player.vx, player.vy);
    if (pd < PLAYER_R + PED_R && pSpeed > KNOCK_SPEED) {
      const nx = pd > 0.01 ? pdx / pd : 1;
      const ny = pd > 0.01 ? pdy / pd : 0;
      this.knock(player.vx, player.vy, nx, ny);
      player.vx *= 0.985;
      player.vy *= 0.985;
    }

    // Hit by traffic or other vehicles (e.g. police).
    this.knockedByVehicles(this.mgr.cars);
    this.knockedByVehicles(this.mgr.extra);
  }

  knockedByVehicles(list) {
    for (const c of list) {
      if (Math.abs(c.x - this.x) > 34 || Math.abs(c.y - this.y) > 34) continue;
      const cvx = c.vx, cvy = c.vy;
      const cSpeed = Math.hypot(cvx, cvy);
      if (cSpeed < 45) continue;
      const dx = this.x - c.x;
      const dy = this.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d < CAR_R + PED_R) {
        const nx = d > 0.01 ? dx / d : 1;
        const ny = d > 0.01 ? dy / d : 0;
        this.knock(cvx, cvy, nx, ny);
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(1.5, 2, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.down) {
      // Sprawled on the ground: limbs out, head away from the torso.
      ctx.strokeStyle = this.shirt;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-2, -4); ctx.lineTo(-6, -8);
      ctx.moveTo(-2, 4); ctx.lineTo(-6, 8);
      ctx.moveTo(2, -4); ctx.lineTo(6, -7);
      ctx.moveTo(2, 4); ctx.lineTo(6, 7);
      ctx.stroke();
      ctx.fillStyle = this.shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.skin;
      ctx.beginPath();
      ctx.arc(7.5, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = this.shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.skin;
      ctx.beginPath();
      ctx.arc(1.2, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ------------------------------------------------------------------- manager

export class Traffic {
  constructor(world, carCount = 26, pedCount = 80) {
    this.world = world;
    this.cols = world.cols;
    this.rows = world.rows;

    this.sidewalks = [];
    this.collectSidewalks();
    // Extra vehicles (e.g. police) that traffic and pedestrians react to.
    this.extra = [];

    this.cars = [];
    for (let i = 0; i < carCount; i++) this.cars.push(new TrafficCar(this));
    this.peds = [];
    for (let i = 0; i < pedCount; i++) this.peds.push(new Pedestrian(this));
  }

  collectSidewalks() {
    const world = this.world;
    for (let ty = 0; ty < GRID; ty++) {
      for (let tx = 0; tx < GRID; tx++) {
        if (world.tileAt(tx, ty) === T_SIDEWALK) {
          this.sidewalks.push({ tx, ty });
        }
      }
    }
  }

  nodeCenter(i, j) {
    return {
      x: (this.cols[i] + 0.5) * TILE,
      y: (this.rows[j] + 0.5) * TILE,
    };
  }

  step(i, j, dir) {
    const d = DIRS[dir];
    return { i: i + d.x, j: j + d.y };
  }

  valid(i, j) {
    return i >= 0 && i < this.cols.length && j >= 0 && j < this.rows.length;
  }

  chooseDir(i, j, fromDir) {
    const options = [];
    for (const k of DIR_KEYS) {
      if (fromDir && k === OPP[fromDir]) continue;
      const n = this.step(i, j, k);
      if (this.valid(n.i, n.j)) options.push(k);
    }
    if (options.length === 0) return OPP[fromDir];
    // Prefer going straight.
    if (fromDir && options.includes(fromDir) && Math.random() < 0.55) {
      return fromDir;
    }
    return pick(options);
  }

  entryWp(i, j, dir) {
    const c = this.nodeCenter(i, j);
    const d = DIRS[dir];
    const r = laneRight(dir);
    return {
      x: c.x - d.x * NODE_APPROACH + r.x * LANE,
      y: c.y - d.y * NODE_APPROACH + r.y * LANE,
      entry: true,
      i, j, dir,
      nextDir: this.chooseDir(i, j, dir),
    };
  }

  exitWp(i, j, dir) {
    const c = this.nodeCenter(i, j);
    const d = DIRS[dir];
    const r = laneRight(dir);
    return {
      x: c.x + d.x * NODE_APPROACH + r.x * LANE,
      y: c.y + d.y * NODE_APPROACH + r.y * LANE,
      entry: false,
    };
  }

  advanceWp(car) {
    const wp = car.wps.shift();
    if (wp.entry) {
      const d2 = wp.nextDir;
      const next = this.step(wp.i, wp.j, d2);
      car.wps.push(this.exitWp(wp.i, wp.j, d2));
      car.wps.push(this.entryWp(next.i, next.j, d2));
    }
    if (car.wps.length === 0) {
      car.respawn();
    }
  }

  update(dt, player) {
    for (const c of this.cars) c.update(dt, player);
    this.collideVehicle(player);
    for (const p of this.peds) p.update(dt, player);
  }

  // Collide a player-like vehicle (player or police) against traffic cars.
  collideVehicle(v) {
    const minD = (v.radius ?? PLAYER_R) + CAR_R;
    for (const c of this.cars) {
      const dx = v.x - c.x;
      const dy = v.y - c.y;
      if (Math.abs(dx) > minD || Math.abs(dy) > minD) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const overlap = minD - d;

      // Relative approach speed along the normal, before the bounce.
      const rvn = (v.vx - c.vx) * nx + (v.vy - c.vy) * ny;

      v.x += nx * overlap * 0.6;
      v.y += ny * overlap * 0.6;
      c.x -= nx * overlap * 0.4;
      c.y -= ny * overlap * 0.4;

      const impulseX = v.vx * 0.55 + c.vx * 0.3 - nx * 70;
      const impulseY = v.vy * 0.55 + c.vy * 0.3 - ny * 70;
      v.bounce(nx, ny, 0);
      c.crash(impulseX, impulseY);

      const impact = -rvn;
      if (impact > 200 && v.damage) v.damage((impact - 200) * 0.03);
    }
  }

  drawCars(ctx, view) {
    for (const c of this.cars) {
      if (
        c.x + 30 < view.x || c.x - 30 > view.x + view.w ||
        c.y + 30 < view.y || c.y - 30 > view.y + view.h
      ) continue;
      c.draw(ctx);
    }
  }

  drawPeds(ctx, view) {
    for (const p of this.peds) {
      if (
        p.x + 14 < view.x || p.x - 14 > view.x + view.w ||
        p.y + 14 < view.y || p.y - 14 > view.y + view.h
      ) continue;
      p.draw(ctx);
    }
  }
}

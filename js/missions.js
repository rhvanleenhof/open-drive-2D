import { TILE, LAND_MIN, LAND_MAX, T_ROAD } from "./world.js";
import { Car } from "./car.js";

const NAMES = [
  'Sal "The Eel" Moretti',
  'Nina "Wires" Kovac',
  "Big Tony Fratelli",
  'Lou "Two-Face" Callahan',
  "Mad Maggie Doyle",
  'Frankie "The Ghost" Romero',
  'Vic "Snake Eyes" Delgado',
  'Pearl "Six Toes" Lombardi',
];

const COP_COUNT = 2;
const FOOT_COP_COUNT = 3;
const PIN_DIST = 72; // cop this close while you're slow = getting pinned
const PIN_MAX_SPEED = 75;
const BUSTED_TIME = 2.5;
const STOP_DIST = 85; // how close (and slow) you must be at a marker
const STOP_SPEED = 45;
const PED_R = 7;
const KNOCK_SPEED = 60;

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ------------------------------------------------------------------ cop car

class Cop extends Car {
  constructor(x, y, heading) {
    super(x, y, heading, { topSpeed: 615, accel: 560, health: 70 });
    this.ai = { up: false, down: false, left: false, right: false, handbrake: false };
    this.stuckT = 0;
    this.reverseT = 0;
    this.lightPhase = Math.random() * 10;
    this.leaving = false;
    this.leaveT = 0;
    this.leaveTarget = null;
  }

  drive(dt, target, world, skids) {
    if (!this.wrecked) {
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      let diff = Math.atan2(dy, dx) - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      const ai = this.ai;
      if (this.reverseT > 0) {
        // Back out of whatever we're stuck on.
        this.reverseT -= dt;
        ai.up = false;
        ai.down = true;
        ai.left = diff > 0;
        ai.right = diff < 0;
        ai.handbrake = false;
      } else {
        ai.up = true;
        ai.down = false;
        ai.left = diff < -0.06;
        ai.right = diff > 0.06;
        ai.handbrake = Math.abs(diff) > 1.5 && this.speed > 260;
        if (this.speed < 25) {
          this.stuckT += dt;
          if (this.stuckT > 1.4) {
            this.reverseT = 0.9;
            this.stuckT = 0;
          }
        } else {
          this.stuckT = 0;
        }
      }
    }
    this.update(dt, this.ai, world, skids);
  }

  draw(ctx, t) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.heading);

    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.roundRect(-21, -9, 46, 24, 7);
    ctx.fill();

    ctx.fillStyle = "#1c1c20";
    ctx.fillRect(9, -12, 10, 24);
    ctx.fillRect(-18, -12, 10, 24);

    const body = this.wrecked ? "#6a6a6e" : "#ececf0";
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(-23, -12, 46, 24, 8);
    ctx.fill();
    ctx.strokeStyle = this.wrecked ? "#3a3a3e" : "#9a9aa2";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Black hood and trunk panels.
    ctx.fillStyle = this.wrecked ? "#45454a" : "#26262c";
    ctx.beginPath();
    ctx.roundRect(13, -10, 9, 20, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-22, -10, 8, 20, 4);
    ctx.fill();

    ctx.fillStyle = "rgba(25,32,45,0.75)";
    ctx.beginPath();
    ctx.roundRect(2, -9, 9, 18, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-14, -8.5, 7, 17, 3);
    ctx.fill();

    // Light bar: alternate red/blue while active.
    const phase = Math.floor((t * 5 + this.lightPhase) % 2);
    if (this.wrecked) {
      ctx.fillStyle = "#55555a";
      ctx.fillRect(-5, -8, 5, 16);
    } else {
      ctx.fillStyle = phase === 0 ? "#ff3b30" : "#2b6bff";
      ctx.fillRect(-5, -8, 5, 7);
      ctx.fillStyle = phase === 0 ? "#2b6bff" : "#ff3b30";
      ctx.fillRect(-5, 1, 5, 7);
    }

    ctx.fillStyle = "#ffe9a8";
    ctx.fillRect(20, -10, 3, 5);
    ctx.fillRect(20, 5, 3, 5);

    ctx.restore();
  }
}

// ---------------------------------------------------------------- spike strip

class SpikeStrip {
  constructor(x, y, heading) {
    this.x = x;
    this.y = y;
    this.heading = heading;
    this.length = 96;
    this.width = 14;
    this.life = 50;
    this.triggered = false;
  }

  contains(px, py, pr) {
    const dx = px - this.x;
    const dy = py - this.y;
    const cos = Math.cos(-this.heading);
    const sin = Math.sin(-this.heading);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    return (
      Math.abs(lx) < this.length * 0.5 + pr &&
      Math.abs(ly) < this.width * 0.5 + pr
    );
  }

  update(dt) {
    this.life -= dt;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.heading);

    ctx.fillStyle = "rgba(20,20,24,0.82)";
    ctx.fillRect(-this.length * 0.5, -this.width * 0.5, this.length, this.width);

    ctx.fillStyle = "#f0a020";
    for (let i = -this.length * 0.42; i <= this.length * 0.42; i += 10) {
      ctx.beginPath();
      ctx.moveTo(i - 3, this.width * 0.5);
      ctx.lineTo(i, -this.width * 0.55);
      ctx.lineTo(i + 3, this.width * 0.5);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(255,220,80,0.55)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-this.length * 0.5, -this.width * 0.5, this.length, this.width);

    ctx.restore();
  }
}

// ---------------------------------------------------------------- foot cop

class FootCop {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.angle = Math.random() * Math.PI * 2;
    this.walkSpeed = 74 + Math.random() * 18;
    this.down = false;
    this.downTimer = 0;
    this.kvx = 0;
    this.kvy = 0;
    this.spin = 0;
    this.deployCooldown = 1.5 + Math.random() * 2.5;
    this.leaving = false;
    this.leaveT = 0;
  }

  knock(ivx, ivy, nx, ny) {
    this.down = true;
    this.downTimer = 3.5 + Math.random() * 2.5;
    this.kvx = ivx * 0.7 + nx * 75;
    this.kvy = ivy * 0.7 + ny * 75;
    this.spin = (Math.random() - 0.5) * 12;
  }

  tryDeploy(spikes, player, world) {
    const speed = player.speed;
    if (speed < 70) return false;

    const nx = player.vx / speed;
    const ny = player.vy / speed;
    const ahead = 160 + speed * 0.38;
    let px = player.x + nx * ahead;
    let py = player.y + ny * ahead;

    let tx = Math.floor(px / TILE);
    let ty = Math.floor(py / TILE);
    if (world.tileAt(tx, ty) !== T_ROAD) {
      for (let k = 0; k < 6; k++) {
        tx = Math.floor((player.x + nx * (ahead - k * 28)) / TILE);
        ty = Math.floor((player.y + ny * (ahead - k * 28)) / TILE);
        if (world.tileAt(tx, ty) === T_ROAD) {
          px = (tx + 0.5) * TILE;
          py = (ty + 0.5) * TILE;
          break;
        }
      }
      if (world.tileAt(tx, ty) !== T_ROAD) return false;
    }

    const heading = Math.atan2(ny, nx) + Math.PI / 2;
    spikes.push(new SpikeStrip(px, py, heading));
    return true;
  }

  update(dt, player, spikes, world) {
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
        this.deployCooldown = 4 + Math.random() * 3;
      }
      return;
    }

    let tx;
    let ty;
    if (this.leaving) {
      this.leaveT += dt;
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      tx = this.x - (dx / d) * 220;
      ty = this.y - (dy / d) * 220;
    } else {
      const lead = 1.1 + Math.min(player.speed / 420, 0.8);
      tx = player.x + player.vx * lead;
      ty = player.y + player.vy * lead;
    }

    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 8) {
      const want = Math.atan2(dy, dx);
      let diff = want - this.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.angle += diff * Math.min(1, 9 * dt);
      this.x += Math.cos(this.angle) * this.walkSpeed * dt;
      this.y += Math.sin(this.angle) * this.walkSpeed * dt;
    }

    if (!this.leaving) {
      this.deployCooldown -= dt;
      const toPlayer = Math.hypot(player.x - this.x, player.y - this.y);
      if (
        this.deployCooldown <= 0 &&
        toPlayer > 220 &&
        toPlayer < 720 &&
        player.speed > 80
      ) {
        if (this.tryDeploy(spikes, player, world)) {
          this.deployCooldown = 9 + Math.random() * 7;
        } else {
          this.deployCooldown = 2.5;
        }
      }
    }
  }

  hitByPlayer(player) {
    const dx = this.x - player.x;
    const dy = this.y - player.y;
    const d = Math.hypot(dx, dy);
    const pSpeed = player.speed;
    if (d < player.radius + PED_R && pSpeed > KNOCK_SPEED) {
      const nx = d > 0.01 ? dx / d : 1;
      const ny = d > 0.01 ? dy / d : 0;
      this.knock(player.vx, player.vy, nx, ny);
      player.vx *= 0.985;
      player.vy *= 0.985;
      return true;
    }
    return false;
  }

  hitByVehicle(v) {
    if (Math.abs(v.x - this.x) > 34 || Math.abs(v.y - this.y) > 34) return;
    const cvx = v.vx;
    const cvy = v.vy;
    const cSpeed = Math.hypot(cvx, cvy);
    if (cSpeed < 45) return;
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    const d = Math.hypot(dx, dy);
    if (d < (v.radius ?? 16) + PED_R) {
      const nx = d > 0.01 ? dx / d : 1;
      const ny = d > 0.01 ? dy / d : 0;
      this.knock(cvx, cvy, nx, ny);
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
      ctx.strokeStyle = "#1e3a7a";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-2, -4); ctx.lineTo(-6, -8);
      ctx.moveTo(-2, 4); ctx.lineTo(-6, 8);
      ctx.moveTo(2, -4); ctx.lineTo(6, -7);
      ctx.moveTo(2, 4); ctx.lineTo(6, 7);
      ctx.stroke();
      ctx.fillStyle = "#1e3a7a";
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8b88a";
      ctx.beginPath();
      ctx.arc(7.5, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#ffd84a";
      ctx.beginPath();
      ctx.arc(1, -4.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1e3a7a";
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8b88a";
      ctx.beginPath();
      ctx.arc(1.2, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ------------------------------------------------------------------ manager

export class Missions {
  constructor(world, traffic, player, hud, skids) {
    this.world = world;
    this.traffic = traffic;
    this.player = player;
    this.hud = hud;
    this.skids = skids;

    this.cops = [];
    this.footCops = [];
    this.spikes = [];
    traffic.extra = this.cops;

    this.state = "idle";
    this.timer = 1.5;
    this.t = 0;
    this.jobs = 0;
    this.bustedT = 0;
    this.name = "";
    this.pickup = null;
    this.dropoff = null;
    this.objective = null;
  }

  randomPoint(constraints) {
    const walks = this.traffic.sidewalks;
    let best = null;
    for (let k = 0; k < 80; k++) {
      const s = pick(walks);
      const p = { x: (s.tx + 0.5) * TILE, y: (s.ty + 0.5) * TILE };
      best = p;
      if (constraints.every((c) => Math.hypot(p.x - c.from.x, p.y - c.from.y) >= c.min)) {
        return p;
      }
    }
    return best;
  }

  startPickup() {
    if (this.player.wrecked) this.player.repair();
    this.name = pick(NAMES);
    this.pickup = this.randomPoint([{ from: this.player, min: 1100 }]);
    this.objective = this.pickup;
    this.state = "pickup";
    this.hud.setBanner(
      `Pick up ${this.name}`,
      "Stop beside them. They're wanted — expect heat once they're in the car.",
      "active"
    );
  }

  startDeliver() {
    this.dropoff = this.randomPoint([
      { from: this.pickup, min: 2200 },
      { from: this.player, min: 900 },
    ]);
    this.objective = this.dropoff;
    this.state = "deliver";
    this.bustedT = 0;
    this.spawnCops(COP_COUNT);
    this.spawnFootCops(FOOT_COP_COUNT);
    this.hud.setBanner(
      `Deliver ${this.name}`,
      "Get to the drop-off. Car cops chase you — foot cops lay spike strips!",
      "hot"
    );
  }

  spawnCops(n) {
    for (let k = 0; k < n; k++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 850 + Math.random() * 300;
      const x = Math.min(LAND_MAX - 60, Math.max(LAND_MIN + 60, this.player.x + Math.cos(angle) * dist));
      const y = Math.min(LAND_MAX - 60, Math.max(LAND_MIN + 60, this.player.y + Math.sin(angle) * dist));
      this.cops.push(new Cop(x, y, angle + Math.PI));
    }
  }

  spawnFootCops(n) {
    const walks = this.traffic.sidewalks;
    for (let k = 0; k < n; k++) {
      let x = this.player.x;
      let y = this.player.y;
      for (let attempt = 0; attempt < 20; attempt++) {
        const s = pick(walks);
        x = (s.tx + 0.2 + Math.random() * 0.6) * TILE;
        y = (s.ty + 0.2 + Math.random() * 0.6) * TILE;
        const d = Math.hypot(x - this.player.x, y - this.player.y);
        if (d > 500 && d < 1400) break;
      }
      this.footCops.push(new FootCop(x, y));
    }
  }

  dismissCops() {
    const mid = (LAND_MIN + LAND_MAX) / 2;
    for (const c of this.cops) {
      c.leaving = true;
      c.leaveT = 0;
      c.leaveTarget = {
        x: this.player.x < mid ? LAND_MAX - 160 : LAND_MIN + 160,
        y: this.player.y < mid ? LAND_MAX - 160 : LAND_MIN + 160,
      };
    }
    for (const f of this.footCops) {
      f.leaving = true;
      f.leaveT = 0;
    }
    this.spikes = [];
  }

  complete() {
    this.jobs++;
    this.state = "complete";
    this.timer = 4;
    this.objective = null;
    this.player.repair();
    this.dismissCops();
    this.hud.setJobs(this.jobs);
    this.hud.setBanner("DELIVERED", `${this.name} paid up. +1 job — car repaired.`, "good");
  }

  fail(reason) {
    this.state = "failed";
    this.timer = 5;
    this.objective = null;
    this.dismissCops();
    if (reason === "busted") {
      this.hud.setBanner("BUSTED", "The cops pinned you and pinched your fare.", "bad");
    } else {
      this.hud.setBanner("WRECKED", "Your ride is toast. The fare bailed. Tow's on the way...", "bad");
    }
  }

  update(dt) {
    this.t += dt;
    const p = this.player;

    // Drive the cops.
    for (const c of this.cops) {
      const target = c.leaving
        ? c.leaveTarget
        : { x: p.x + p.vx * 0.45, y: p.y + p.vy * 0.45 };
      c.drive(dt, target, this.world, this.skids);
      if (c.leaving) c.leaveT += dt;
      this.traffic.collideVehicle(c);
    }
    this.copCollisions();
    this.updateFootCops(dt);
    this.updateSpikes(dt);
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const c = this.cops[i];
      if (c.leaving && (c.leaveT > 10 || Math.hypot(c.x - p.x, c.y - p.y) > 1400)) {
        this.cops.splice(i, 1);
      }
    }

    switch (this.state) {
      case "idle":
        this.timer -= dt;
        if (this.timer <= 0) this.startPickup();
        break;

      case "pickup":
        if (p.wrecked) {
          this.fail("wrecked");
        } else if (
          Math.hypot(p.x - this.pickup.x, p.y - this.pickup.y) < STOP_DIST &&
          p.speed < STOP_SPEED
        ) {
          this.startDeliver();
        }
        break;

      case "deliver": {
        if (p.wrecked) {
          this.fail("wrecked");
          break;
        }
        let pinned = false;
        for (const c of this.cops) {
          if (c.wrecked || c.leaving) continue;
          if (
            Math.hypot(c.x - p.x, c.y - p.y) < PIN_DIST &&
            p.speed < PIN_MAX_SPEED
          ) {
            pinned = true;
            break;
          }
        }
        if (!pinned) {
          for (const f of this.footCops) {
            if (f.down || f.leaving) continue;
            if (
              Math.hypot(f.x - p.x, f.y - p.y) < PIN_DIST &&
              p.speed < PIN_MAX_SPEED
            ) {
              pinned = true;
              break;
            }
          }
        }
        this.bustedT = Math.max(
          0,
          Math.min(BUSTED_TIME, this.bustedT + (pinned ? dt : -1.4 * dt))
        );
        if (this.bustedT >= BUSTED_TIME) {
          this.fail("busted");
        } else if (
          Math.hypot(p.x - this.dropoff.x, p.y - this.dropoff.y) < STOP_DIST &&
          p.speed < STOP_SPEED
        ) {
          this.complete();
        }
        break;
      }

      case "complete":
      case "failed":
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = "idle";
          this.timer = 1;
          this.cops = [];
          this.footCops = [];
          this.spikes = [];
        }
        break;
    }

    this.hud.setBusted(this.state === "deliver" ? this.bustedT / BUSTED_TIME : 0);
  }

  updateFootCops(dt) {
    if (this.state !== "deliver" && this.state !== "complete" && this.state !== "failed") {
      return;
    }
    const p = this.player;
    for (const f of this.footCops) {
      f.update(dt, p, this.spikes, this.world);
      f.hitByPlayer(p);
      f.hitByVehicle(p);
      for (const c of this.cops) f.hitByVehicle(c);
    }
    for (let i = this.footCops.length - 1; i >= 0; i--) {
      const f = this.footCops[i];
      if (f.leaving && (f.leaveT > 8 || Math.hypot(f.x - p.x, f.y - p.y) > 1200)) {
        this.footCops.splice(i, 1);
      }
    }
  }

  updateSpikes(dt) {
    const p = this.player;
    for (const s of this.spikes) {
      s.update(dt);
      if (!s.triggered && s.contains(p.x, p.y, p.radius) && p.speed > 35) {
        s.triggered = true;
        p.popTires();
      }
    }
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      if (this.spikes[i].life <= 0) this.spikes.splice(i, 1);
    }
  }

  copCollisions() {
    const p = this.player;
    for (const c of this.cops) {
      const minD = p.radius + c.radius;
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      if (Math.abs(dx) > minD || Math.abs(dy) > minD) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const overlap = minD - d;
      const rvn = (p.vx - c.vx) * nx + (p.vy - c.vy) * ny;

      p.x += nx * overlap * 0.5;
      p.y += ny * overlap * 0.5;
      c.x -= nx * overlap * 0.5;
      c.y -= ny * overlap * 0.5;
      p.bounce(nx, ny, 0);
      c.bounce(-nx, -ny, 0);

      const impact = -rvn;
      if (impact > 170) {
        p.damage((impact - 170) * 0.04);
        c.damage((impact - 170) * 0.05);
      }
    }

    // Keep cops from stacking on each other.
    for (let i = 0; i < this.cops.length; i++) {
      for (let j = i + 1; j < this.cops.length; j++) {
        const a = this.cops[i], b = this.cops[j];
        const minD = a.radius + b.radius;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (minD - d) / 2;
        a.x += (dx / d) * push;
        a.y += (dy / d) * push;
        b.x -= (dx / d) * push;
        b.y -= (dy / d) * push;
      }
    }
  }

  // ------------------------------------------------------------- rendering

  drawMarker(ctx, x, y, color) {
    const pulse = 40 + Math.sin(this.t * 3.5) * 9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(x, y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawWorld(ctx, view) {
    if (this.state === "pickup") {
      const { x, y } = this.pickup;
      this.drawMarker(ctx, x, y, "#ffcc44");
      // The waiting fare.
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(x + 1.5, y + 2, 6, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2c2c34";
      ctx.beginPath();
      ctx.ellipse(x, y, 4.5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8b88a";
      ctx.beginPath();
      ctx.arc(x + 1.2, y, 3, 0, Math.PI * 2);
      ctx.fill();
      // Bobbing exclamation mark.
      const bob = Math.sin(this.t * 4) * 4;
      ctx.font = "bold 26px system-ui";
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.strokeText("!", x, y - 22 + bob);
      ctx.fillStyle = "#ffcc44";
      ctx.fillText("!", x, y - 22 + bob);
    } else if (this.state === "deliver") {
      this.drawMarker(ctx, this.dropoff.x, this.dropoff.y, "#55dd77");
    }

    for (const c of this.cops) {
      if (
        c.x + 40 < view.x || c.x - 40 > view.x + view.w ||
        c.y + 40 < view.y || c.y - 40 > view.y + view.h
      ) continue;
      c.draw(ctx, this.t);
      c.drawSmoke(ctx);
    }

    for (const s of this.spikes) {
      if (
        s.x + 60 < view.x || s.x - 60 > view.x + view.w ||
        s.y + 20 < view.y || s.y - 20 > view.y + view.h
      ) continue;
      s.draw(ctx);
    }

    for (const f of this.footCops) {
      if (
        f.x + 14 < view.x || f.x - 14 > view.x + view.w ||
        f.y + 14 < view.y || f.y - 14 > view.y + view.h
      ) continue;
      f.draw(ctx);
    }
  }

  // Screen-space arrow pointing at the objective.
  drawOverlay(ctx, w, h) {
    if (!this.objective) return;
    const p = this.player;
    const dx = this.objective.x - p.x;
    const dy = this.objective.y - p.y;
    if (Math.hypot(dx, dy) < 320) return;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    ctx.translate(120, 0);
    ctx.fillStyle = this.state === "pickup" ? "#ffcc44" : "#55dd77";
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-8, -10);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-8, 10);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }
}

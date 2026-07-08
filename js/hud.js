import { TILE, GRID, WORLD_SIZE } from "./world.js";

export class HUD {
  constructor(world) {
    this.speedEl = document.getElementById("speed-value");
    this.mini = document.getElementById("minimap");
    this.miniCtx = this.mini.getContext("2d");
    this.scale = this.mini.width / WORLD_SIZE;
    this.pre = this.prerenderMinimap(world);

    this.jobsEl = document.getElementById("jobs-count");
    this.bannerEl = document.getElementById("banner");
    this.bannerTitleEl = document.getElementById("banner-title");
    this.bannerSubEl = document.getElementById("banner-sub");
    this.damageFillEl = document.getElementById("damage-fill");
    this.bustedEl = document.getElementById("busted");
    this.bustedFillEl = document.getElementById("busted-fill");
  }

  setJobs(n) {
    this.jobsEl.textContent = n;
  }

  setBanner(title, sub, tone) {
    this.bannerTitleEl.textContent = title;
    this.bannerSubEl.textContent = sub;
    this.bannerEl.className = `show ${tone}`;
  }

  setBusted(frac) {
    this.bustedEl.classList.toggle("show", frac > 0.05);
    this.bustedFillEl.style.width = `${Math.round(frac * 100)}%`;
  }

  prerenderMinimap(world) {
    const c = document.createElement("canvas");
    c.width = this.mini.width;
    c.height = this.mini.height;
    const ctx = c.getContext("2d");
    const s = this.scale;

    ctx.fillStyle = "#2e6fae";
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.fillStyle = "#5e9c4f";
    ctx.fillRect(
      2 * TILE * s,
      2 * TILE * s,
      (GRID - 4) * TILE * s,
      (GRID - 4) * TILE * s
    );

    ctx.fillStyle = "#6f6f74";
    for (const b of world.buildings) {
      ctx.fillRect(b.x * s, b.y * s, Math.max(1, b.w * s), Math.max(1, b.h * s));
    }

    const roadW = Math.max(2, TILE * s);
    ctx.fillStyle = "#3c3c42";
    for (const r of world.rows) {
      ctx.fillRect(2 * TILE * s, r * TILE * s, (GRID - 4) * TILE * s, roadW);
    }
    for (const col of world.cols) {
      ctx.fillRect(col * TILE * s, 2 * TILE * s, roadW, (GRID - 4) * TILE * s);
    }

    return c;
  }

  update(car, missions) {
    this.speedEl.textContent = Math.round(car.speedKmh);

    const healthFrac = car.health / car.maxHealth;
    this.damageFillEl.style.width = `${Math.round(healthFrac * 100)}%`;
    this.damageFillEl.style.backgroundColor =
      healthFrac > 0.5 ? "#55dd77" : healthFrac > 0.25 ? "#ffcc44" : "#ff4444";

    const ctx = this.miniCtx;
    ctx.clearRect(0, 0, this.mini.width, this.mini.height);
    ctx.drawImage(this.pre, 0, 0);

    if (missions) {
      const t = performance.now() / 1000;
      if (missions.objective) {
        const color = missions.state === "pickup" ? "#ffcc44" : "#55dd77";
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(
          missions.objective.x * this.scale,
          missions.objective.y * this.scale,
          3.2 + Math.sin(t * 5) * 1.4,
          0, Math.PI * 2
        );
        ctx.fill();
      }
      ctx.fillStyle = "#4488ff";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      for (const c of missions.cops) {
        if (c.wrecked) continue;
        ctx.beginPath();
        ctx.arc(c.x * this.scale, c.y * this.scale, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    const x = car.x * this.scale;
    const y = car.y * this.scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(car.heading);
    ctx.fillStyle = "#ff5a3c";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(-4, -3.5);
    ctx.lineTo(-4, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

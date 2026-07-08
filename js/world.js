export const TILE = 128;
export const GRID = 44;
export const WORLD_SIZE = TILE * GRID;

// Land occupies tiles [2, GRID-3]; the outer two rings are water.
export const LAND_MIN = 2 * TILE;
export const LAND_MAX = (GRID - 2) * TILE;

export const T_WATER = 0;
export const T_GRASS = 1;
export const T_SIDEWALK = 2;
export const T_ROAD = 3;
export const T_PLAZA = 4;

const BUCKET = 256;

const BUILDING_COLORS = [
  "#8f6f5a", "#7b7f8a", "#9a8f7f", "#6f7f6f",
  "#a09080", "#736a75", "#87707a", "#94847d",
];
const CAR_COLORS = [
  "#4a6fa5", "#7d8a93", "#a35b5b", "#5f8a6a",
  "#b0a374", "#5d5d66", "#c4c4bc", "#8a6a9d",
];
const TREE_COLORS = ["#3e7a34", "#46853a", "#38702f"];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

export class World {
  constructor(seed) {
    this.rand = mulberry32(seed);
    this.tiles = new Uint8Array(GRID * GRID).fill(T_WATER);
    this.roadRows = new Set();
    this.roadCols = new Set();
    this.buildings = [];
    this.trees = [];
    this.parkedCars = [];
    this.buckets = new Map();
    this.generate();
  }

  // ---------------------------------------------------------------- geometry

  tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= GRID || ty >= GRID) return T_WATER;
    return this.tiles[ty * GRID + tx];
  }

  groundAt(x, y) {
    return this.tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  addCollider(c) {
    let minX, minY, maxX, maxY;
    if (c.kind === "rect") {
      minX = c.x; minY = c.y; maxX = c.x + c.w; maxY = c.y + c.h;
    } else {
      minX = c.x - c.r; minY = c.y - c.r; maxX = c.x + c.r; maxY = c.y + c.r;
    }
    const bx0 = Math.floor(minX / BUCKET);
    const by0 = Math.floor(minY / BUCKET);
    const bx1 = Math.floor(maxX / BUCKET);
    const by1 = Math.floor(maxY / BUCKET);
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const key = bx + "," + by;
        let bucket = this.buckets.get(key);
        if (!bucket) {
          bucket = [];
          this.buckets.set(key, bucket);
        }
        bucket.push(c);
      }
    }
  }

  collidersNear(x, y, r) {
    const out = [];
    const bx0 = Math.floor((x - r) / BUCKET);
    const by0 = Math.floor((y - r) / BUCKET);
    const bx1 = Math.floor((x + r) / BUCKET);
    const by1 = Math.floor((y + r) / BUCKET);
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const bucket = this.buckets.get(bx + "," + by);
        if (!bucket) continue;
        for (const c of bucket) {
          if (!out.includes(c)) out.push(c);
        }
      }
    }
    return out;
  }

  // -------------------------------------------------------------- generation

  generate() {
    const rd = this.rand;

    const genLines = () => {
      const lines = [];
      let p = 3 + Math.floor(rd() * 3);
      while (p <= GRID - 5) {
        lines.push(p);
        p += 4 + Math.floor(rd() * 4);
      }
      return lines;
    };
    this.cols = genLines();
    this.rows = genLines();
    for (const c of this.cols) this.roadCols.add(c);
    for (const r of this.rows) this.roadRows.add(r);

    // Base land + roads.
    for (let ty = 2; ty <= GRID - 3; ty++) {
      for (let tx = 2; tx <= GRID - 3; tx++) {
        const road = this.roadRows.has(ty) || this.roadCols.has(tx);
        this.tiles[ty * GRID + tx] = road ? T_ROAD : T_GRASS;
      }
    }

    // City blocks between road lines (bounds include the land edges).
    const bc = [1, ...this.cols, GRID - 2];
    const br = [1, ...this.rows, GRID - 2];
    for (let j = 0; j < br.length - 1; j++) {
      for (let i = 0; i < bc.length - 1; i++) {
        const c0 = Math.max(bc[i] + 1, 2);
        const c1 = Math.min(bc[i + 1] - 1, GRID - 3);
        const r0 = Math.max(br[j] + 1, 2);
        const r1 = Math.min(br[j + 1] - 1, GRID - 3);
        if (c0 > c1 || r0 > r1) continue;

        const edgeBlock =
          i === 0 || i === bc.length - 2 || j === 0 || j === br.length - 2;
        const isPark = edgeBlock || rd() < 0.3;

        if (isPark) {
          this.makePark(c0, r0, c1, r1);
        } else {
          this.makeBuildingBlock(c0, r0, c1, r1);
          this.placeParkedCars(bc, br, i, j, c0, r0, c1, r1);
        }
      }
    }

    // Sidewalks: land tiles adjacent to a road.
    for (let ty = 2; ty <= GRID - 3; ty++) {
      for (let tx = 2; tx <= GRID - 3; tx++) {
        const t = this.tiles[ty * GRID + tx];
        if (t === T_ROAD || t === T_WATER) continue;
        if (
          this.tileAt(tx - 1, ty) === T_ROAD ||
          this.tileAt(tx + 1, ty) === T_ROAD ||
          this.tileAt(tx, ty - 1) === T_ROAD ||
          this.tileAt(tx, ty + 1) === T_ROAD
        ) {
          this.tiles[ty * GRID + tx] = T_SIDEWALK;
        }
      }
    }
  }

  makePark(c0, r0, c1, r1) {
    const rd = this.rand;
    const x0 = c0 * TILE, y0 = r0 * TILE;
    const w = (c1 - c0 + 1) * TILE, h = (r1 - r0 + 1) * TILE;
    const count = Math.round((c1 - c0 + 1) * (r1 - r0 + 1) * 0.55) + 2;
    for (let k = 0; k < count; k++) {
      const tree = {
        x: x0 + 34 + rd() * (w - 68),
        y: y0 + 34 + rd() * (h - 68),
        r: 13 + rd() * 8,
        color: TREE_COLORS[Math.floor(rd() * TREE_COLORS.length)],
      };
      this.trees.push(tree);
      this.addCollider({ kind: "circle", x: tree.x, y: tree.y, r: 8 });
    }
  }

  makeBuildingBlock(c0, r0, c1, r1) {
    const rd = this.rand;
    for (let ty = r0; ty <= r1; ty++) {
      for (let tx = c0; tx <= c1; tx++) {
        this.tiles[ty * GRID + tx] = T_PLAZA;
      }
    }

    const x0 = c0 * TILE + 22, y0 = r0 * TILE + 22;
    const x1 = (c1 + 1) * TILE - 22, y1 = (r1 + 1) * TILE - 22;
    const bw = x1 - x0, bh = y1 - y0;
    const nx = Math.max(1, Math.min(3, Math.round(bw / 300)));
    const ny = Math.max(1, Math.min(3, Math.round(bh / 300)));
    const cw = bw / nx, ch = bh / ny;

    for (let gy = 0; gy < ny; gy++) {
      for (let gx = 0; gx < nx; gx++) {
        if (rd() < 0.12) continue;
        const mx = 10 + rd() * 26, my = 10 + rd() * 26;
        const b = {
          x: x0 + gx * cw + mx,
          y: y0 + gy * ch + my,
          w: cw - mx - (10 + rd() * 26),
          h: ch - my - (10 + rd() * 26),
          color: BUILDING_COLORS[Math.floor(rd() * BUILDING_COLORS.length)],
        };
        if (b.w < 50 || b.h < 50) continue;
        b.roof = shade(b.color, 18);
        b.edge = shade(b.color, -32);
        this.buildings.push(b);
        this.addCollider({ kind: "rect", x: b.x, y: b.y, w: b.w, h: b.h });
      }
    }
  }

  placeParkedCars(bc, br, i, j, c0, r0, c1, r1) {
    const rd = this.rand;
    const blockH = (r1 - r0 + 1) * TILE;
    const blockW = (c1 - c0 + 1) * TILE;

    const addCar = (x, y, vertical) => {
      const car = {
        x, y, vertical,
        color: CAR_COLORS[Math.floor(rd() * CAR_COLORS.length)],
      };
      this.parkedCars.push(car);
      const w = vertical ? 22 : 48;
      const h = vertical ? 48 : 22;
      this.addCollider({
        kind: "rect",
        x: x - w / 2,
        y: y - h / 2,
        w, h,
      });
    };

    const pickSlots = (length, n) => {
      const slots = Math.floor(length / 90);
      const chosen = new Set();
      while (chosen.size < Math.min(n, slots)) {
        chosen.add(Math.floor(rd() * slots));
      }
      return [...chosen].map((s) => (s + 0.5) * (length / slots));
    };

    // Vertical roads to the left/right of this block; cars hug the curb so
    // they stay clear of the traffic lanes.
    const sidesV = [];
    if (i > 0) sidesV.push((bc[i] + 1) * TILE - 5); // road on the left
    if (i < bc.length - 2) sidesV.push(bc[i + 1] * TILE + 5); // road on the right
    for (const x of sidesV) {
      if (rd() < 0.55) {
        for (const off of pickSlots(blockH, 1 + Math.floor(rd() * 2))) {
          addCar(x, r0 * TILE + off, true);
        }
      }
    }

    // Horizontal roads above/below this block.
    const sidesH = [];
    if (j > 0) sidesH.push((br[j] + 1) * TILE - 5);
    if (j < br.length - 2) sidesH.push(br[j + 1] * TILE + 5);
    for (const y of sidesH) {
      if (rd() < 0.55) {
        for (const off of pickSlots(blockW, 1 + Math.floor(rd() * 2))) {
          addCar(c0 * TILE + off, y, false);
        }
      }
    }
  }

  // --------------------------------------------------------------- rendering

  drawGround(ctx, view) {
    const tx0 = Math.max(0, Math.floor(view.x / TILE));
    const ty0 = Math.max(0, Math.floor(view.y / TILE));
    const tx1 = Math.min(GRID - 1, Math.floor((view.x + view.w) / TILE));
    const ty1 = Math.min(GRID - 1, Math.floor((view.y + view.h) / TILE));

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        this.drawTile(ctx, tx, ty);
      }
    }
  }

  drawTile(ctx, tx, ty) {
    const x = tx * TILE, y = ty * TILE;
    const t = this.tiles[ty * GRID + tx];

    switch (t) {
      case T_WATER: {
        ctx.fillStyle = "#2e6fae";
        ctx.fillRect(x, y, TILE, TILE);
        // Foam edge next to land.
        if (
          this.tileAt(tx - 1, ty) !== T_WATER ||
          this.tileAt(tx + 1, ty) !== T_WATER ||
          this.tileAt(tx, ty - 1) !== T_WATER ||
          this.tileAt(tx, ty + 1) !== T_WATER
        ) {
          ctx.fillStyle = "rgba(255,255,255,0.16)";
          ctx.fillRect(x, y, TILE, TILE);
        }
        return;
      }
      case T_GRASS: {
        const v = (tx * 31 + ty * 17) % 3;
        ctx.fillStyle = v === 0 ? "#5e9c4f" : v === 1 ? "#63a253" : "#589649";
        ctx.fillRect(x, y, TILE, TILE);
        return;
      }
      case T_SIDEWALK: {
        ctx.fillStyle = "#b6b4a8";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = "rgba(0,0,0,0.07)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
        return;
      }
      case T_PLAZA: {
        ctx.fillStyle = "#a8a69a";
        ctx.fillRect(x, y, TILE, TILE);
        return;
      }
      case T_ROAD: {
        ctx.fillStyle = "#3c3c42";
        ctx.fillRect(x, y, TILE, TILE);
        const isRow = this.roadRows.has(ty);
        const isCol = this.roadCols.has(tx);

        if (isRow && isCol) {
          this.drawCrosswalks(ctx, tx, ty);
        } else if (isRow) {
          ctx.fillStyle = "rgba(222,222,215,0.9)";
          ctx.fillRect(x, y + 6, TILE, 3);
          ctx.fillRect(x, y + TILE - 9, TILE, 3);
          ctx.fillStyle = "#d9c86a";
          for (let dx = 8; dx < TILE; dx += 32) {
            ctx.fillRect(x + dx, y + TILE / 2 - 2, 18, 4);
          }
        } else if (isCol) {
          ctx.fillStyle = "rgba(222,222,215,0.9)";
          ctx.fillRect(x + 6, y, 3, TILE);
          ctx.fillRect(x + TILE - 9, y, 3, TILE);
          ctx.fillStyle = "#d9c86a";
          for (let dy = 8; dy < TILE; dy += 32) {
            ctx.fillRect(x + TILE / 2 - 2, y + dy, 4, 18);
          }
        }
        return;
      }
    }
  }

  drawCrosswalks(ctx, tx, ty) {
    const x = tx * TILE, y = ty * TILE;
    ctx.fillStyle = "rgba(230,230,225,0.85)";
    // Bands sit on the edges leading to straight road segments.
    if (this.roadRows.has(ty) && !this.roadCols.has(tx - 1)) {
      for (let sy = 12; sy < TILE - 12; sy += 18) {
        ctx.fillRect(x + 6, y + sy, 14, 9);
      }
    }
    if (this.roadRows.has(ty) && !this.roadCols.has(tx + 1)) {
      for (let sy = 12; sy < TILE - 12; sy += 18) {
        ctx.fillRect(x + TILE - 20, y + sy, 14, 9);
      }
    }
    if (this.roadCols.has(tx) && !this.roadRows.has(ty - 1)) {
      for (let sx = 12; sx < TILE - 12; sx += 18) {
        ctx.fillRect(x + sx, y + 6, 9, 14);
      }
    }
    if (this.roadCols.has(tx) && !this.roadRows.has(ty + 1)) {
      for (let sx = 12; sx < TILE - 12; sx += 18) {
        ctx.fillRect(x + sx, y + TILE - 20, 9, 14);
      }
    }
  }

  drawParkedCars(ctx, view) {
    for (const c of this.parkedCars) {
      if (
        c.x + 30 < view.x || c.x - 30 > view.x + view.w ||
        c.y + 30 < view.y || c.y - 30 > view.y + view.h
      ) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      if (c.vertical) ctx.rotate(Math.PI / 2);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.roundRect(-21, -8, 46, 20, 6);
      ctx.fill();
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.roundRect(-23, -10, 46, 20, 6);
      ctx.fill();
      ctx.fillStyle = "rgba(20,25,35,0.55)";
      ctx.beginPath();
      ctx.roundRect(-10, -7, 16, 14, 3);
      ctx.fill();
      ctx.restore();
    }
  }

  drawPropsAbove(ctx, view) {
    for (const b of this.buildings) {
      if (
        b.x + b.w + 12 < view.x || b.x > view.x + view.w ||
        b.y + b.h + 14 < view.y || b.y > view.y + view.h
      ) continue;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = b.edge;
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
    }

    for (const t of this.trees) {
      if (
        t.x + t.r + 8 < view.x || t.x - t.r - 8 > view.x + view.w ||
        t.y + t.r + 8 < view.y || t.y - t.r - 8 > view.y + view.h
      ) continue;
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.arc(t.x + 4, t.y + 5, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.13)";
      ctx.beginPath();
      ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Spawn point: center of the first road intersection, facing east.
  spawnPoint() {
    const cx = this.cols[Math.floor(this.cols.length / 2)];
    const ry = this.rows[Math.floor(this.rows.length / 2)];
    return {
      x: (cx + 0.5) * TILE,
      y: (ry + 0.5) * TILE,
      heading: 0,
    };
  }
}

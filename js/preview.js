import { World, WORLD_SIZE } from "./world.js";
import { Traffic } from "./traffic.js";
import { Camera } from "./camera.js";

const canvas = document.getElementById("home-preview");
const ctx = canvas.getContext("2d");

const DUMMY_PLAYER = {
  x: -1e6,
  y: -1e6,
  vx: 0,
  vy: 0,
  radius: 16,
  bounce() {},
};

const DT = 1 / 60;
const PREVIEW_SEED = 424242;

let running = false;
let rafId = null;
let dpr = 1;
let last = 0;
let acc = 0;
let panT = 0;
let world, traffic, camera;

function resize() {
  if (!canvas) return;
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
}

function init() {
  world = new World(PREVIEW_SEED);
  traffic = new Traffic(world, 22, 65);
  const cx = WORLD_SIZE / 2;
  camera = new Camera(cx, cx);
  camera.zoom = 0.82;
  panT = 0;
}

function update(dt) {
  traffic.update(dt, DUMMY_PLAYER);
  panT += dt;
  const cx = WORLD_SIZE / 2;
  const cy = WORLD_SIZE / 2;
  camera.x = cx + Math.cos(panT * 0.11) * 1400;
  camera.y = cy + Math.sin(panT * 0.085) * 1050;
}

function render() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#2e6fae";
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  camera.apply(ctx, w, h);
  const view = camera.getView(w, h);

  world.drawGround(ctx, view);
  world.drawParkedCars(ctx, view);
  traffic.drawCars(ctx, view);
  traffic.drawPeds(ctx, view);
  world.drawPropsAbove(ctx, view);
  ctx.restore();
}

function frame(now) {
  if (!running) return;
  acc += Math.min((now - last) / 1000, 0.1);
  last = now;
  while (acc >= DT) {
    update(DT);
    acc -= DT;
  }
  render();
  rafId = requestAnimationFrame(frame);
}

export function startPreview() {
  if (running || !canvas) return;
  init();
  running = true;
  resize();
  last = performance.now();
  acc = 0;
  rafId = requestAnimationFrame(frame);
}

export function stopPreview() {
  running = false;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

window.addEventListener("resize", () => {
  if (running) resize();
});

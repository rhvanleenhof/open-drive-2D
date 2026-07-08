import { input } from "./input.js";
import { World } from "./world.js";
import { Car, SkidMarks } from "./car.js";
import { Camera } from "./camera.js";
import { HUD } from "./hud.js";
import { Traffic } from "./traffic.js";
import { Missions } from "./missions.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let dpr = 1;
function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
}
window.addEventListener("resize", resize);
resize();

const seed = (Math.random() * 1e9) >>> 0;
const world = new World(seed);
const spawn = world.spawnPoint();
const car = new Car(spawn.x, spawn.y, spawn.heading);
const camera = new Camera(spawn.x, spawn.y);
const skids = new SkidMarks();
const traffic = new Traffic(world);
const hud = new HUD(world);
const missions = new Missions(world, traffic, car, hud, skids);

const DT = 1 / 60;
let last = performance.now();
let acc = 0;

function update(dt) {
  car.update(dt, input, world, skids);
  traffic.update(dt, car);
  missions.update(dt);
  camera.update(dt, car);
}

function render() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#2e6fae";
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  camera.apply(ctx, w, h);
  const view = camera.getView(w, h);

  world.drawGround(ctx, view);
  skids.draw(ctx, view);
  world.drawParkedCars(ctx, view);
  traffic.drawCars(ctx, view);
  missions.drawWorld(ctx, view);
  car.draw(ctx);
  car.drawSmoke(ctx);
  traffic.drawPeds(ctx, view);
  world.drawPropsAbove(ctx, view);
  ctx.restore();

  missions.drawOverlay(ctx, w, h);
  hud.update(car, missions);
}

function frame(now) {
  acc += Math.min((now - last) / 1000, 0.1);
  last = now;
  while (acc >= DT) {
    update(DT);
    acc -= DT;
  }
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

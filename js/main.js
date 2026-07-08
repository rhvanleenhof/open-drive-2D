import { startPreview, stopPreview } from "./preview.js";
import { input } from "./input.js";
import { World } from "./world.js";
import { Car, SkidMarks } from "./car.js";
import { Camera } from "./camera.js";
import { HUD } from "./hud.js";
import { Traffic } from "./traffic.js";
import { Missions } from "./missions.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const hudEl = document.getElementById("hud");
const homeEl = document.getElementById("home");
const navHome = document.getElementById("nav-home");
const navPlay = document.getElementById("nav-play");
const homePlay = document.getElementById("home-play");

let dpr = 1;
function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
}
window.addEventListener("resize", resize);

const DT = 1 / 60;
let last = performance.now();
let acc = 0;
let rafId = null;
let playing = false;

let world, car, camera, skids, traffic, hud, missions;

function initGame() {
  const seed = (Math.random() * 1e9) >>> 0;
  world = new World(seed);
  const spawn = world.spawnPoint();
  car = new Car(spawn.x, spawn.y, spawn.heading);
  camera = new Camera(spawn.x, spawn.y);
  skids = new SkidMarks();
  traffic = new Traffic(world);
  hud = new HUD(world);
  missions = new Missions(world, traffic, car, hud, skids);
  last = performance.now();
  acc = 0;
  resize();
}

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
  if (!playing) return;
  acc += Math.min((now - last) / 1000, 0.1);
  last = now;
  while (acc >= DT) {
    update(DT);
    acc -= DT;
  }
  render();
  rafId = requestAnimationFrame(frame);
}

function setActiveNav(view) {
  navHome.classList.toggle("active", view === "home");
  navPlay.classList.toggle("active", view === "play");
}

function showHome(e) {
  e?.preventDefault();
  playing = false;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  document.body.classList.remove("view-play");
  document.body.classList.add("view-home");
  canvas.hidden = true;
  hudEl.hidden = true;
  homeEl.hidden = false;
  setActiveNav("home");
  startPreview();
}

function showPlay(e) {
  e?.preventDefault();
  if (playing) return;
  stopPreview();
  initGame();
  playing = true;
  document.body.classList.remove("view-home");
  document.body.classList.add("view-play");
  homeEl.hidden = true;
  canvas.hidden = false;
  hudEl.hidden = false;
  setActiveNav("play");
  rafId = requestAnimationFrame(frame);
}

navHome.addEventListener("click", showHome);
navPlay.addEventListener("click", showPlay);
homePlay.addEventListener("click", showPlay);

showHome();

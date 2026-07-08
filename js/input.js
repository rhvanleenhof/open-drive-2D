const ACTIONS = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  Space: "handbrake",
};

const pressed = new Set();

window.addEventListener("keydown", (e) => {
  const action = ACTIONS[e.code];
  if (action) {
    pressed.add(action);
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => {
  const action = ACTIONS[e.code];
  if (action) pressed.delete(action);
});

window.addEventListener("blur", () => pressed.clear());

export const input = {
  get up() {
    return pressed.has("up");
  },
  get down() {
    return pressed.has("down");
  },
  get left() {
    return pressed.has("left");
  },
  get right() {
    return pressed.has("right");
  },
  get handbrake() {
    return pressed.has("handbrake");
  },
};

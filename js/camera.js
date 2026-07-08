export class Camera {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.zoom = 1;
  }

  update(dt, car) {
    const speed = Math.hypot(car.vx, car.vy);

    // Look slightly ahead of the car along its velocity.
    let tx = car.x, ty = car.y;
    if (speed > 1) {
      const la = Math.min(speed * 0.4, 160);
      tx += (car.vx / speed) * la;
      ty += (car.vy / speed) * la;
    }

    const k = 1 - Math.exp(-4 * dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;

    // Zoom out a touch at high speed.
    const targetZoom = 1.05 - Math.min(speed / 680, 1) * 0.28;
    this.zoom += (targetZoom - this.zoom) * (1 - Math.exp(-2 * dt));
  }

  // Visible world-space rectangle for a given screen size (CSS pixels).
  getView(w, h) {
    const vw = w / this.zoom;
    const vh = h / this.zoom;
    return { x: this.x - vw / 2, y: this.y - vh / 2, w: vw, h: vh };
  }

  apply(ctx, w, h) {
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }
}

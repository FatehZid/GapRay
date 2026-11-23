// Closing section dot grid: springy dots the cursor flicks through, with click shockwaves.
// Plain JS, no dependencies.
(() => {
  const section = document.querySelector(".why");
  const canvas = document.querySelector(".why .dots canvas");
  if (!section || !canvas) return;

  // Look
  const GAP = 16; // grid spacing
  const DOT = 1.25; // dot radius
  const RGB = "11 87 208"; // brand blue
  const BASE_ALPHA = 0.35; // dots far from the cursor

  // Feel
  const PROXIMITY = 150; // cursor reach for glow and push
  const SPEED_TRIGGER = 1.5; // px per frame before the cursor pushes
  const PUSH = 2.5; // push away from the cursor
  const FLICK = 0.15; // how much cursor speed carries into the dots
  const SHOCK_RADIUS = 250; // click reach
  const SHOCK = 14; // click strength
  const STIFFNESS = 0.035; // pull back home
  const DAMPING = 0.1; // lower = more wobble
  const MAX_SPEED = 30; // cap per dot

  const ctx = canvas.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  let dots = [];
  let width = 0;
  let height = 0;
  let pointer = null;
  let frame = 0;
  let last = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dots = [];
    for (let y = GAP / 2; y < height; y += GAP) {
      for (let x = GAP / 2; x < width; x += GAP) {
        dots.push({ hx: x, hy: y, x: 0, y: 0, vx: 0, vy: 0 });
      }
    }
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = `rgb(${RGB})`;
    ctx.globalAlpha = BASE_ALPHA;
    ctx.beginPath();
    const near = [];
    for (const d of dots) {
      const px = d.hx + d.x;
      const py = d.hy + d.y;
      if (pointer) {
        const dist = Math.hypot(px - pointer.x, py - pointer.y);
        if (dist < PROXIMITY) {
          near.push(px, py, 1 - dist / PROXIMITY);
          continue;
        }
      }
      ctx.moveTo(px + DOT, py);
      ctx.arc(px, py, DOT, 0, Math.PI * 2);
    }
    ctx.fill();
    for (let i = 0; i < near.length; i += 3) {
      ctx.globalAlpha = BASE_ALPHA + (1 - BASE_ALPHA) * near[i + 2];
      ctx.beginPath();
      ctx.arc(near[i], near[i + 1], DOT, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function kick(d, ix, iy) {
    d.vx += ix;
    d.vy += iy;
    const speed = Math.hypot(d.vx, d.vy);
    if (speed > MAX_SPEED) {
      d.vx *= MAX_SPEED / speed;
      d.vy *= MAX_SPEED / speed;
    }
  }

  function step(now) {
    const f = Math.min((now - last) / 16.67 || 1, 2);
    last = now;
    let moving = false;
    for (const d of dots) {
      d.vx += (-STIFFNESS * d.x - DAMPING * d.vx) * f;
      d.vy += (-STIFFNESS * d.y - DAMPING * d.vy) * f;
      d.x += d.vx * f;
      d.y += d.vy * f;
      if (Math.abs(d.x) > 0.05 || Math.abs(d.y) > 0.05 || Math.abs(d.vx) > 0.05 || Math.abs(d.vy) > 0.05) {
        moving = true;
      } else {
        d.x = d.y = d.vx = d.vy = 0;
      }
    }
    draw();
    frame = moving ? requestAnimationFrame(step) : 0;
  }

  function start() {
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(step);
    }
  }

  function local(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  section.addEventListener("pointermove", (e) => {
    const p = local(e);
    const t = e.timeStamp;
    if (pointer && !still.matches) {
      const frames = Math.max((t - pointer.t) / 16.67, 0.5);
      const vx = (p.x - pointer.x) / frames;
      const vy = (p.y - pointer.y) / frames;
      if (Math.hypot(vx, vy) > SPEED_TRIGGER) {
        for (const d of dots) {
          const dx = d.hx + d.x - p.x;
          const dy = d.hy + d.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist === 0 || dist > PROXIMITY) continue;
          const fall = 1 - dist / PROXIMITY;
          kick(d, ((dx / dist) * PUSH + vx * FLICK) * fall, ((dy / dist) * PUSH + vy * FLICK) * fall);
        }
      }
    }
    pointer = { x: p.x, y: p.y, t };
    start();
  });

  section.addEventListener("pointerleave", () => {
    pointer = null;
    start();
  });

  section.addEventListener("click", (e) => {
    if (still.matches) return;
    const p = local(e);
    for (const d of dots) {
      const dx = d.hx + d.x - p.x;
      const dy = d.hy + d.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist === 0 || dist > SHOCK_RADIUS) continue;
      const fall = 1 - dist / SHOCK_RADIUS;
      kick(d, (dx / dist) * SHOCK * fall, (dy / dist) * SHOCK * fall);
    }
    start();
  });

  new ResizeObserver(resize).observe(canvas);
})();

(() => {
  // Injected again on each toggle: reuse the running instance.
  if (window.__gapray) {
    window.__gapray.toggle();
    return;
  }

  const DRAG_THRESHOLD = 4;
  const MAX_COLORS = 8;
  const MAX_COLOR_SCAN = 2000;
  const SCAN_WIDTH = 120;
  const SKIP = new Set([
    "HTML", "HEAD", "BODY", "SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "BR",
  ]);
  const CORNERS = [
    { key: "borderTopLeftRadius", name: "tl" },
    { key: "borderTopRightRadius", name: "tr" },
    { key: "borderBottomRightRadius", name: "br" },
    { key: "borderBottomLeftRadius", name: "bl" },
  ];
  const colorCtx = document.createElement("canvas").getContext("2d");

  let host = null;
  let layer = null;
  let hoverLayer = null;
  let results = null;
  let toast = null;
  let hovered = null;
  let selected = [];
  let down = null; // { x, y, dragging, candidates }
  let rafId = 0;
  let toastTimer = 0;
  let staggerIndex = 0;

  // ---------- lifecycle ----------

  function toggle() {
    host ? stop() : start();
  }

  function start() {
    // Shadow DOM keeps page CSS and overlay CSS apart.
    host = document.createElement("gapray-root");
    host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
    const root = host.attachShadow({ mode: "open" });

    const styles = ["overlay.css", "motion.css"].map((file) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL(file);
      return link;
    });

    layer = el("div", "layer");
    hoverLayer = el("div", "hover-layer");
    results = el("div", "results");
    toast = el("div", "toast");
    root.append(...styles, layer, hoverLayer, results, toast);
    document.documentElement.append(host);

    layer.addEventListener("mousedown", onDown);
    layer.addEventListener("mousemove", onHover);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", scheduleRender, true);
    window.addEventListener("resize", scheduleRender);
  }

  function stop() {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", scheduleRender, true);
    window.removeEventListener("resize", scheduleRender);
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", onUp);
    cancelAnimationFrame(rafId);
    clearTimeout(toastTimer);
    host.remove();
    host = layer = hoverLayer = results = toast = hovered = down = null;
    selected = [];
  }

  function onKey(e) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    stop();
  }

  // ---------- hover ----------

  function onHover(e) {
    if (down) return;
    const target = elementAt(e.clientX, e.clientY);
    if (target === hovered) return;
    hovered = target;
    drawHover();
  }

  function drawHover() {
    hoverLayer.textContent = "";
    if (!hovered || !hovered.isConnected || selected.includes(hovered)) return;
    const b = hovered.getBoundingClientRect();
    hoverLayer.append(place(el("div", "hover"), b));
    // With a selection on screen, a hover tag would collide with its labels.
    if (!selected.length) hoverLayer.append(sizeTag(b));
  }

  // ---------- click and drag ----------

  function onDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    down = { x: e.clientX, y: e.clientY, dragging: false, candidates: null };
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", onUp);
  }

  function onDrag(e) {
    if (!down.dragging) {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < DRAG_THRESHOLD) return;
      down.dragging = true;
      down.candidates = snapshot();
      hovered = null;
    }
    const r = rectBetween(down, e);
    selected = topLevelInside(down.candidates, r);
    render(r);
  }

  function onUp(e) {
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", onUp);
    if (!down.dragging) {
      const target = elementAt(e.clientX, e.clientY);
      selected = target ? [target] : [];
    }
    down = null;
    render(null, true);
  }

  // The page is still during a drag, so measure every element once.
  function snapshot() {
    const list = [];
    for (const node of document.querySelectorAll("body *")) {
      if (SKIP.has(node.tagName)) continue;
      const b = node.getBoundingClientRect();
      if (b.width >= 1 && b.height >= 1) list.push({ node, b });
    }
    return list;
  }

  // Elements fully inside the box that have no ancestor also inside it.
  function topLevelInside(candidates, r) {
    const inside = new Set();
    for (const { node, b } of candidates) {
      if (b.left >= r.left && b.top >= r.top && b.right <= r.right && b.bottom <= r.bottom) {
        inside.add(node);
      }
    }
    return [...inside].filter((node) => !hasAncestorIn(node, inside));
  }

  function hasAncestorIn(node, set) {
    for (let p = node.parentElement; p; p = p.parentElement) {
      if (set.has(p)) return true;
    }
    return false;
  }

  // ---------- drawing ----------

  function scheduleRender() {
    if (down) return;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => render());
  }

  // intro: play the entrance animation. Only on click or release,
  // never on drag or scroll, so it doesn't replay every frame.
  function render(selRect, intro = false) {
    if (!results) return;
    results.textContent = "";
    results.classList.toggle("intro", intro);
    staggerIndex = 0;
    selected = selected.filter((node) => node.isConnected);

    const lensRect = selRect || (selected.length ? unionRect(selected) : null);
    if (lensRect) drawLens(lensRect, intro);
    if (selRect) results.append(place(el("div", "sel"), selRect));

    if (selected.length === 1) {
      renderSingle(selected[0], !selRect);
    } else if (selected.length > 1) {
      for (const node of selected) {
        const b = node.getBoundingClientRect();
        const cs = getComputedStyle(node);
        results.append(place(el("div", "outline"), b));
        drawPadding(b, cs);
        drawRadius(b, cs);
        results.append(sizeTag(b));
      }
      drawSiblingGaps();
      if (!selRect) drawMultiCard();
    }
    drawHover();
  }

  // The blueprint area: tinted, desaturated, with a grid.
  function drawLens(r, intro) {
    const width = r.right - r.left;
    const lens = place(el("div", "lens"), {
      left: r.left,
      top: r.top,
      width,
      height: r.bottom - r.top,
    });
    if (intro) {
      lens.style.setProperty("--w", `${width + SCAN_WIDTH}px`);
      lens.append(el("div", "scan"));
    }
    results.append(lens);
  }

  function renderSingle(node, withCard) {
    const b = node.getBoundingClientRect();
    const cs = getComputedStyle(node);
    results.append(place(el("div", "outline"), b));
    drawPadding(b, cs);
    drawChildGaps(node, cs);
    drawRadius(b, cs);
    results.append(sizeTag(b));
    if (withCard) drawSingleCard(b, cs);
  }

  function drawPadding(b, cs) {
    const [bt, br, bb, bl] = sides(cs, "border", "Width");
    const [pt, pr, pb, pl] = sides(cs, "padding");
    const left = b.left + bl;
    const top = b.top + bt;
    const width = b.width - bl - br;
    const height = b.height - bt - bb;

    hatch("pad", "Padding top", pt, { left, top, width, height: pt });
    hatch("pad", "Padding bottom", pb, { left, top: top + height - pb, width, height: pb });
    hatch("pad", "Padding left", pl, { left, top: top + pt, width: pl, height: height - pt - pb });
    hatch("pad", "Padding right", pr, {
      left: left + width - pr,
      top: top + pt,
      width: pr,
      height: height - pt - pb,
    });
  }

  function drawChildGaps(node, cs) {
    const box = contentBox(node.getBoundingClientRect(), cs);
    const kids = [...node.children].filter(inFlow).map((kid) => kid.getBoundingClientRect());
    gapsBetween(kids, box);
  }

  // Gaps between selected items that share a parent.
  function drawSiblingGaps() {
    const groups = new Map();
    for (const node of selected) {
      const list = groups.get(node.parentElement) || [];
      list.push(node.getBoundingClientRect());
      groups.set(node.parentElement, list);
    }
    for (const rects of groups.values()) gapsBetween(rects);
  }

  // Hatches between neighbours, in DOM order.
  // With a box, a hatch spans the box. Without one, only where the two overlap.
  function gapsBetween(rects, box) {
    for (let i = 1; i < rects.length; i++) {
      const a = rects[i - 1];
      const b = rects[i];
      const overlapTop = Math.max(a.top, b.top);
      const overlapBottom = Math.min(a.bottom, b.bottom);
      const overlapLeft = Math.max(a.left, b.left);
      const overlapRight = Math.min(a.right, b.right);

      if (overlapBottom > overlapTop && b.left - a.right >= 1) {
        hatch("gap", "Gap", b.left - a.right, {
          left: a.right,
          top: box ? box.top : overlapTop,
          width: b.left - a.right,
          height: box ? box.height : overlapBottom - overlapTop,
        });
      } else if (b.top - a.bottom >= 1) {
        hatch("gap", "Gap", b.top - a.bottom, {
          left: box ? box.left : overlapLeft,
          top: a.bottom,
          width: box ? box.width : overlapRight - overlapLeft,
          height: b.top - a.bottom,
        });
      }
    }
  }

  // A hatched area that names itself on hover and copies its value on click.
  function hatch(kind, name, size, rect) {
    if (size < 1 || rect.width <= 0 || rect.height <= 0) return;
    const value = `${fmt(size)}px`;
    const label = el("div", `tag ${kind}-tag`, fmt(size));
    const area = stagger(place(el("div", `hatch ${kind}`), rect));
    area.append(label);
    area.addEventListener("mouseenter", () => (label.textContent = `${name} · ${value}`));
    area.addEventListener("mouseleave", () => (label.textContent = fmt(size)));
    area.addEventListener("click", () => copy(value));
    results.append(area);
  }

  // Dashed arc on each rounded corner. One tag when all corners match.
  function drawRadius(b, cs) {
    const radii = CORNERS.map((c) => radiusOf(cs[c.key], b));
    const uniform = radii.every((r) => r === radii[0]);

    radii.forEach((r, i) => {
      if (r < 1) return;
      const { name } = CORNERS[i];
      const isTop = name[0] === "t";
      const isLeft = name[1] === "l";

      const arc = place(el("div", `arc arc-${name}`), {
        left: isLeft ? b.left : b.right - r,
        top: isTop ? b.top : b.bottom - r,
        width: r,
        height: r,
      });
      arc.style.setProperty("--r", `${r}px`);
      results.append(stagger(arc));

      if (uniform && name !== "br") return;
      const tag = el("div", `tag radius-tag hit tag-${name}`, `r ${fmt(r)}`);
      tag.addEventListener("click", () => copy(`${fmt(r)}px`));
      results.append(
        stagger(place(tag, { left: isLeft ? b.left : b.right, top: isTop ? b.top : b.bottom }))
      );
    });
  }

  // The visible radius: percentages resolved, capped at half the shorter side.
  function radiusOf(value, b) {
    const first = value.split(" ")[0];
    const max = Math.min(b.width, b.height) / 2;
    const r = first.endsWith("%") ? (px(first) / 100) * Math.min(b.width, b.height) : px(first);
    return Math.min(r, max);
  }

  // ---------- cards ----------

  function drawSingleCard(b, cs) {
    const font = cs.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    const pad = sides(cs, "padding");
    const radius = radiusOf(cs.borderTopLeftRadius, b);

    drawCard(null, [
      {
        label: "Size",
        value: `${fmt(b.width)} × ${fmt(b.height)}`,
        copy: `${fmt(b.width)}px × ${fmt(b.height)}px`,
      },
      { label: "Font", value: font },
      { label: "Font size", value: cs.fontSize },
      { label: "Weight", value: cs.fontWeight },
      { label: "Line height", value: cs.lineHeight },
      { label: "Color", value: toHex(cs.color), swatch: cs.color },
      {
        label: "Padding",
        value: pad.map(fmt).join(" "),
        copy: pad.map((v) => `${fmt(v)}px`).join(" "),
      },
      { label: "Radius", value: fmt(radius), copy: `${fmt(radius)}px` },
    ], b);
  }

  function drawMultiCard() {
    const colors = new Map(); // hex -> CSS color, for the swatch
    let scanned = 0;

    for (const node of selected) {
      for (const n of [node, ...node.querySelectorAll("*")]) {
        if (++scanned > MAX_COLOR_SCAN) break;
        const s = getComputedStyle(n);
        for (const c of [s.color, s.backgroundColor]) {
          if (alphaOf(c) > 0) colors.set(toHex(c), c);
        }
      }
    }

    const list = [...colors];
    const rows = list
      .slice(0, MAX_COLORS)
      .map(([hex, css]) => ({ label: "Color", value: hex, swatch: css }));
    drawCard(`${selected.length} selected`, rows, unionRect(selected), list.length - MAX_COLORS);
  }

  function drawCard(title, rows, anchor, more = 0) {
    const card = el("div", "card");
    if (title) card.append(el("div", "card-title", title));

    for (const row of rows) {
      const button = el("button", "row");
      const value = el("span", "value", row.value);
      if (row.swatch) {
        const swatch = el("span", "swatch");
        swatch.style.background = row.swatch;
        value.prepend(swatch);
      }
      button.append(el("span", "label", row.label), value);
      const text = row.copy || row.value;
      button.addEventListener("click", () => copy(text));
      card.append(button);
    }
    if (more > 0) card.append(el("div", "more", `+${more} more`));
    results.append(card);

    // Below the anchor, or above if there is no room. Kept inside the viewport.
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    let top = anchor.bottom + 28;
    if (top + h > innerHeight) top = Math.max(8, anchor.top - h - 8);
    const left = Math.min(Math.max(8, anchor.left), innerWidth - w - 8);
    place(card, { left, top });
  }

  // ---------- copy ----------

  function copy(text) {
    // navigator.clipboard is missing on plain http:// pages, so this can fail.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(
        () => showToast(`Copied ${text}`),
        () => showToast("Couldn't copy on this page")
      );
  }

  function showToast(text) {
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast && toast.classList.remove("show"), 1500);
  }

  // ---------- helpers ----------

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function place(node, r) {
    node.style.left = `${r.left}px`;
    node.style.top = `${r.top}px`;
    if (r.width != null) node.style.width = `${r.width}px`;
    if (r.height != null) node.style.height = `${r.height}px`;
    return node;
  }

  // Each element starts its intro a little after the previous one (max 400ms).
  function stagger(node) {
    node.style.setProperty("--d", `${Math.min(staggerIndex++ * 25, 400)}ms`);
    return node;
  }

  function sizeTag(b) {
    const tag = el("div", "tag float", `${fmt(b.width)} × ${fmt(b.height)}`);
    const top = b.bottom + 22 > innerHeight ? b.bottom - 20 : b.bottom + 4;
    return stagger(place(tag, { left: b.left + b.width / 2, top }));
  }

  function elementAt(x, y) {
    return (
      document
        .elementsFromPoint(x, y)
        .find((node) => node !== host && !SKIP.has(node.tagName)) || null
    );
  }

  function rectBetween(a, e) {
    const left = Math.min(a.x, e.clientX);
    const top = Math.min(a.y, e.clientY);
    const right = Math.max(a.x, e.clientX);
    const bottom = Math.max(a.y, e.clientY);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function unionRect(nodes) {
    const rects = nodes.map((n) => n.getBoundingClientRect());
    return {
      left: Math.min(...rects.map((r) => r.left)),
      top: Math.min(...rects.map((r) => r.top)),
      right: Math.max(...rects.map((r) => r.right)),
      bottom: Math.max(...rects.map((r) => r.bottom)),
    };
  }

  function contentBox(b, cs) {
    const [bt, br, bb, bl] = sides(cs, "border", "Width");
    const [pt, pr, pb, pl] = sides(cs, "padding");
    return {
      left: b.left + bl + pl,
      top: b.top + bt + pt,
      width: b.width - bl - br - pl - pr,
      height: b.height - bt - bb - pt - pb,
    };
  }

  function inFlow(node) {
    if (SKIP.has(node.tagName)) return false;
    const s = getComputedStyle(node);
    if (s.display === "none" || s.position === "absolute" || s.position === "fixed") return false;
    const b = node.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  }

  function sides(cs, prefix, suffix = "") {
    return ["Top", "Right", "Bottom", "Left"].map((side) => px(cs[`${prefix}${side}${suffix}`]));
  }

  function px(value) {
    return parseFloat(value) || 0;
  }

  function fmt(n) {
    return String(Math.round(n * 100) / 100);
  }

  // The canvas turns any CSS color (oklch, color(), names) into #hex or rgba().
  function normalize(color) {
    colorCtx.fillStyle = "#000";
    colorCtx.fillStyle = color;
    return colorCtx.fillStyle;
  }

  function rgba(color) {
    if (!/^rgba?\(/.test(color)) return null;
    const [r, g, b, a = 1] = color.match(/[\d.]+/g).map(Number);
    return { r, g, b, a };
  }

  function alphaOf(color) {
    const c = rgba(normalize(color));
    return c ? c.a : 1;
  }

  function toHex(color) {
    const n = normalize(color);
    if (n.startsWith("#")) return n.toUpperCase();
    const c = rgba(n);
    if (!c) return color;
    const hex =
      "#" +
      [c.r, c.g, c.b]
        .map((v) => Math.round(v).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
    return c.a < 1 ? `${hex} ${Math.round(c.a * 100)}%` : hex;
  }

  window.__gapray = { toggle };
  start();
})();

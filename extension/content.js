(() => {
  // Injected again on each toggle: reuse the running instance.
  if (window.__gapray) {
    window.__gapray.toggle();
    return;
  }

  const DRAG_THRESHOLD = 4;
  const MAX_COLORS = 8;
  const MAX_COLOR_SCAN = 2000;
  const SCAN_WIDTH = 320;
  const SKIP = new Set([
    "HTML",
    "HEAD",
    "BODY",
    "SCRIPT",
    "STYLE",
    "LINK",
    "META",
    "NOSCRIPT",
    "BR",
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
  let alt = false; // Alt (Option) held: measure mode
  // Keys of what is already on screen, so each item animates in only once.
  let shown = new Set();
  let nextShown = new Set();

  // ---------- lifecycle ----------

  function toggle() {
    host ? stop() : start();
  }

  function start() {
    // Shadow DOM keeps page CSS and overlay CSS apart.
    host = document.createElement("gapray-root");
    host.style.cssText =
      "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
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
    root.append(...styles, layer, results, hoverLayer, toast);
    document.documentElement.append(host);

    layer.addEventListener("mousedown", onDown);
    layer.addEventListener("mousemove", onHover);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("scroll", scheduleRender, true);
    window.addEventListener("resize", scheduleRender);
  }

  function stop() {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("scroll", scheduleRender, true);
    window.removeEventListener("resize", scheduleRender);
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", onUp);
    cancelAnimationFrame(rafId);
    clearTimeout(toastTimer);
    host.remove();
    host = layer = hoverLayer = results = toast = hovered = down = null;
    selected = [];
    shown = new Set();
    alt = false;
  }

  // Measure mode on or off. Redraws only when it changes.
  function setAlt(on) {
    if (alt === on) return;
    alt = on;
    drawHover();
  }

  function onKeyUp(e) {
    if (e.key === "Alt") setAlt(false);
  }

  // Alt released in another window never sends keyup here.
  function onBlur() {
    setAlt(false);
  }

  function onKey(e) {
    if (e.key === "Alt") {
      setAlt(true);
      return;
    }
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

  // Distances from the selected element (a) to the hovered one (b).
  function drawMeasure(a, b) {
    hoverLayer.append(place(el("div", "m-box"), b));
    const inside = (o, i) =>
      i.left >= o.left &&
      i.right <= o.right &&
      i.top >= o.top &&
      i.bottom <= o.bottom;

    // One inside the other: four lines to the outer box's inner edges.
    if (inside(b, a) || inside(a, b)) {
      const [o, i] = inside(b, a) ? [b, a] : [a, b];
      const cx = i.left + i.width / 2;
      const cy = i.top + i.height / 2;
      mLine(cx, o.top, cx, i.top);
      mLine(cx, i.bottom, cx, o.bottom);
      mLine(o.left, cy, i.left, cy);
      mLine(i.right, cy, o.right, cy);
      return;
    }

    // Apart: one line per axis, in the middle of the overlap or from a's center.
    const oTop = Math.max(a.top, b.top);
    const oBottom = Math.min(a.bottom, b.bottom);
    const y = oBottom > oTop ? (oTop + oBottom) / 2 : a.top + a.height / 2;
    if (b.left >= a.right) {
      mLine(a.right, y, b.left, y);
      guide(b.left, y, b);
    } else if (a.left >= b.right) {
      mLine(b.right, y, a.left, y);
      guide(b.right, y, b);
    }

    const oLeft = Math.max(a.left, b.left);
    const oRight = Math.min(a.right, b.right);
    const x = oRight > oLeft ? (oLeft + oRight) / 2 : a.left + a.width / 2;
    if (b.top >= a.bottom) {
      mLine(x, a.bottom, x, b.top);
      guide(x, b.top, b);
    } else if (a.top >= b.bottom) {
      mLine(x, b.bottom, x, a.top);
      guide(x, b.bottom, b);
    }
  }

  // Dashed guide from a line's end to the hovered box, when the line misses it.
  function guide(x, y, b) {
    if (y < b.top) mLine(x, y, x, b.top, true);
    else if (y > b.bottom) mLine(x, b.bottom, x, y, true);
    else if (x < b.left) mLine(x, y, b.left, y, true);
    else if (x > b.right) mLine(b.right, y, x, y, true);
  }

  // A straight line with its length in a tag. Guides get no tag.
  function mLine(x1, y1, x2, y2, dashed = false) {
    const len = Math.abs(x2 - x1) + Math.abs(y2 - y1);
    if (len < 1) return;
    const flat = y1 === y2;
    const kind = dashed ? `m-guide ${flat ? "h" : "v"}` : "m-line";
    hoverLayer.append(
      place(el("div", kind), {
        left: Math.min(x1, x2),
        top: Math.min(y1, y2),
        width: flat ? len : 1,
        height: flat ? 1 : len,
      }),
    );
    if (dashed) return;
    const tag = el("div", "tag m-tag", fmt(len));
    hoverLayer.append(place(tag, { left: (x1 + x2) / 2, top: (y1 + y2) / 2 }));
  }

  function drawHover() {
    hoverLayer.textContent = "";
    if (!hovered || !hovered.isConnected) return;
    const anchor = selected.length === 1 ? selected[0] : null;
    if (alt && anchor && hovered !== anchor) {
      drawMeasure(
        anchor.getBoundingClientRect(),
        hovered.getBoundingClientRect(),
      );
      return;
    }
    if (selected.includes(hovered)) return;
    const b = hovered.getBoundingClientRect();
    hoverLayer.append(place(el("div", "hover"), b));
    // With a selection on screen, a hover tag would collide with its labels.
    if (!selected.length) hoverLayer.append(sizeTag(b, false));
  }

  // ---------- click and drag ----------

  function onDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    shown = new Set(); // a new selection animates in fresh
    down = { x: e.clientX, y: e.clientY, dragging: false, candidates: null };
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", onUp);
  }

  function onDrag(e) {
    if (!down.dragging) {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < DRAG_THRESHOLD)
        return;
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
      if (
        b.left >= r.left &&
        b.top >= r.top &&
        b.right <= r.right &&
        b.bottom <= r.bottom
      ) {
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

  // sweep: play the scan line. Only on click or release.
  function render(selRect, sweep = false) {
    if (!results) return;
    results.textContent = "";
    staggerIndex = 0;
    nextShown = new Set();
    selected = selected.filter((node) => node.isConnected);
    if (selected[0])
      results.classList.toggle("light", isLightBehind(selected[0]));

    const lensRect = selRect || (selected.length ? unionRect(selected) : null);
    if (lensRect) drawLens(lensRect, sweep);
    if (selRect) results.append(place(el("div", "sel"), selRect));

    if (selected.length === 1) {
      renderSingle(selected[0], !selRect);
    } else if (selected.length > 1) {
      for (const node of selected) {
        const b = node.getBoundingClientRect();
        const cs = getComputedStyle(node);
        results.append(
          enter(place(el("div", "outline"), b), keyOf("outline", b)),
        );
        drawPadding(b, cs);
        drawRadius(b, cs);
        results.append(sizeTag(b));
      }
      drawSiblingGaps();
      if (!selRect) drawMultiCard();
    }
    drawHover();
    shown = nextShown;
  }

  // The blueprint area: tinted and desaturated.
  function drawLens(r, sweep) {
    const width = r.right - r.left;
    const lens = place(el("div", "lens"), {
      left: r.left,
      top: r.top,
      width,
      height: r.bottom - r.top,
    });
    if (sweep) {
      lens.style.setProperty("--w", `${width + SCAN_WIDTH}px`);
      lens.append(el("div", "scan"));
    }
    results.append(enter(lens, "lens"));
  }

  function renderSingle(node, withCard) {
    const b = node.getBoundingClientRect();
    const cs = getComputedStyle(node);
    results.append(enter(place(el("div", "outline"), b), keyOf("outline", b)));
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
    hatch("pad", "Padding bottom", pb, {
      left,
      top: top + height - pb,
      width,
      height: pb,
    });
    hatch("pad", "Padding left", pl, {
      left,
      top: top + pt,
      width: pl,
      height: height - pt - pb,
    });
    hatch("pad", "Padding right", pr, {
      left: left + width - pr,
      top: top + pt,
      width: pr,
      height: height - pt - pb,
    });
  }

  function drawChildGaps(node, cs) {
    const box = contentBox(node.getBoundingClientRect(), cs);
    const kids = [...node.children]
      .filter(inFlow)
      .map((kid) => kid.getBoundingClientRect());
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
    const area = enter(
      place(el("div", `hatch ${kind}`), rect),
      keyOf(name, rect),
    );
    area.append(label);
    area.addEventListener(
      "mouseenter",
      () => (label.textContent = `${name} · ${value}`),
    );
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
      results.append(enter(arc, keyOf(`arc-${name}`, b)));

      if (uniform && name !== "br") return;
      const tag = el("div", `tag radius-tag hit tag-${name}`, `r ${fmt(r)}`);
      tag.addEventListener("click", () => copy(`${fmt(r)}px`));
      const at = {
        left: isLeft ? b.left : b.right,
        top: isTop ? b.top : b.bottom,
      };
      results.append(enter(place(tag, at), keyOf(`radius-${name}`, b)));
    });
  }

  // The visible radius: percentages resolved, capped at half the shorter side.
  function radiusOf(value, b) {
    const first = value.split(" ")[0];
    const max = Math.min(b.width, b.height) / 2;
    const r = first.endsWith("%")
      ? (px(first) / 100) * Math.min(b.width, b.height)
      : px(first);
    return Math.min(r, max);
  }

  // ---------- cards ----------

  function drawSingleCard(b, cs) {
    const font = cs.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    const pad = sides(cs, "padding");
    const radius = radiusOf(cs.borderTopLeftRadius, b);

    drawCard(
      null,
      [
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
      ],
      b,
    );
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
    drawCard(
      `${selected.length} selected`,
      rows,
      unionRect(selected),
      list.length - MAX_COLORS,
    );
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
    results.append(enter(card, "card"));

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
        () => showToast("Couldn't copy on this page"),
      );
  }

  function showToast(text) {
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(
      () => toast && toast.classList.remove("show"),
      1500,
    );
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

  // Marks an element to animate in, only the first time it appears,
  // each a little after the previous one (max 250ms).
  function enter(node, key) {
    nextShown.add(key);
    if (!shown.has(key)) {
      node.classList.add("enter");
      node.style.setProperty("--d", `${Math.min(staggerIndex++ * 15, 250)}ms`);
    }
    return node;
  }

  // Page position, so scrolling the window doesn't count as new.
  function keyOf(kind, r) {
    return [kind, r.left + scrollX, r.top + scrollY, r.width, r.height]
      .map((v) => (typeof v === "number" ? Math.round(v) : v))
      .join(":");
  }

  function sizeTag(b, animate = true) {
    const tag = el("div", "tag float", `${fmt(b.width)} × ${fmt(b.height)}`);
    const top = b.bottom + 22 > innerHeight ? b.bottom - 20 : b.bottom + 4;
    place(tag, { left: b.left + b.width / 2, top });
    return animate ? enter(tag, keyOf("size", b)) : tag;
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
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    };
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
    if (
      s.display === "none" ||
      s.position === "absolute" ||
      s.position === "fixed"
    )
      return false;
    const b = node.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  }

  function sides(cs, prefix, suffix = "") {
    return ["Top", "Right", "Bottom", "Left"].map((side) =>
      px(cs[`${prefix}${side}${suffix}`]),
    );
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

  // Light or dark: the first solid background behind the element. Pages default to white.
  function isLightBehind(node) {
    for (let n = node; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (alphaOf(bg) > 0.5) return luminance(bg) > 0.5;
    }
    return true;
  }

  function luminance(color) {
    const n = normalize(color);
    const [r, g, b] = n.startsWith("#")
      ? [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16))
      : (n.match(/[\d.]+/g) || [0, 0, 0]).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  window.__gapray = { toggle };
  start();
})();

// Small dependency-free SVG line chart with a crosshair tooltip.
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (s) => { const [y, m, d] = s.split("-"); return `${MONTHS[+m - 1]} ${+d}, ${y}`; };

/**
 * opts: {dates, series: [{name, values, cls, dash?, width?}], band?: {lo, hi, cls, name},
 *        points?: {values, outside: bool[], name}, yFmt, yLabel, height}
 */
export function lineChart(container, opts) {
  const draw = () => {
    container.innerHTML = "";
    const W = Math.max(300, container.clientWidth), H = opts.height || 280;
    const m = { t: 12, r: 12, b: 28, l: 46 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b, n = opts.dates.length;
    const all = [];
    opts.series.forEach((s) => all.push(...s.values));
    if (opts.band) all.push(...opts.band.lo, ...opts.band.hi);
    if (opts.points) all.push(...opts.points.values);
    let lo = Math.min(...all), hi = Math.max(...all);
    if (opts.zero) lo = Math.min(0, lo);
    const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
    const ticks = niceTicks(lo, hi);
    const x = (i) => m.l + (i / (n - 1)) * iw, y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": opts.label || "" }, container);
    const g = el("g", { class: "axis" }, svg);
    ticks.forEach((t) => {
      el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: "grid" }, g);
      el("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, g).textContent = opts.yFmt ? opts.yFmt(t) : t;
    });
    let lastYear = null;
    opts.dates.forEach((d, i) => {
      const yr = d.slice(0, 4), mo = d.slice(5, 7);
      if (yr !== lastYear || (iw > 560 && mo === "07" && opts.dates[i - 1]?.slice(5, 7) !== "07")) {
        const label = yr !== lastYear ? yr : "Jul";
        el("text", { x: x(i), y: H - 8, "text-anchor": i === 0 ? "start" : "middle" }, g).textContent = label;
        lastYear = yr;
      }
    });
    const path = (vals) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    if (opts.band) {
      const b = opts.band, top = b.hi.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
      const bot = b.lo.map((v, i) => `L${x(n - 1 - i).toFixed(1)},${y(b.lo[n - 1 - i]).toFixed(1)}`).join("");
      el("path", { d: top + bot + "Z", class: `band ${b.cls}` }, svg);
    }
    if (opts.points) {
      const p = opts.points;
      p.values.forEach((v, i) => el("circle", { cx: x(i), cy: y(v), r: p.outside[i] ? 2.6 : 1.6, class: p.outside[i] ? "pt-out" : "pt-in" }, svg));
    }
    opts.series.forEach((s) => el("path", { d: path(s.values), class: `line ${s.cls}`, "stroke-dasharray": s.dash || "", "stroke-width": s.width || 2 }, svg));

    // hover layer
    const cross = el("line", { y1: m.t, y2: m.t + ih, class: "cross", visibility: "hidden" }, svg);
    const dots = opts.series.map((s) => el("circle", { r: 4, class: `hdot ${s.cls}`, visibility: "hidden" }, svg));
    const tip = document.createElement("div");
    tip.className = "tip"; tip.hidden = true; container.appendChild(tip);
    const hit = el("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" }, svg);
    const move = (ev) => {
      const r = svg.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      opts.series.forEach((s, k) => { dots[k].setAttribute("cx", x(i)); dots[k].setAttribute("cy", y(s.values[i])); dots[k].setAttribute("visibility", "visible"); });
      const f = opts.yFmt || ((v) => v);
      let rows = opts.series.map((s) => `<div class="row"><span class="sw ${s.cls}"></span>${s.name}<b>${f(s.values[i])}</b></div>`);
      if (opts.band) rows.push(`<div class="row"><span class="sw band-sw ${opts.band.cls}"></span>${opts.band.name}<b>${f(opts.band.lo[i])} to ${f(opts.band.hi[i])}</b></div>`);
      if (opts.points) rows.push(`<div class="row"><span class="sw pt-sw"></span>${opts.points.name}<b>${f(opts.points.values[i])}${opts.points.outside[i] ? " · outside" : ""}</b></div>`);
      tip.innerHTML = `<div class="tdate">${fmtDate(opts.dates[i])}</div>${rows.join("")}`;
      tip.hidden = false;
      const left = (x(i) / W) * r.width;
      tip.style.left = `${Math.min(left + 12, r.width - tip.offsetWidth - 4)}px`;
      if (left + 12 + tip.offsetWidth > r.width) tip.style.left = `${Math.max(4, left - tip.offsetWidth - 12)}px`;
      tip.style.top = `${m.t}px`;
    };
    const leave = () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); dots.forEach((d) => d.setAttribute("visibility", "hidden")); };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", leave);
  };
  draw();
  container._redraw = draw;
}

let rt;
window.addEventListener("resize", () => {
  clearTimeout(rt);
  rt = setTimeout(() => document.querySelectorAll(".chart").forEach((c) => c._redraw && c._redraw()), 120);
});

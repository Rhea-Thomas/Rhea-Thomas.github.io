// RiskFormer results explorer: out-of-sample forecasts, Jan 2023 – Dec 2025.
import { lineChart } from "./charts.js";

const MODELS = [
  { key: "RiskFormer", cls: "s1", on: true, fixed: true },
  { key: "GARCH(1,1)", cls: "s2", on: true },
  { key: "EWMA", cls: "s3", on: false },
  { key: "HAR", cls: "s4", on: false },
  { key: "20-day rolling", cls: "s5", on: false },
];
const EQUITY = [
  { key: "Buy & hold", cls: "s0", dash: "5 4", label: "Just buy and hold" },
  { key: "Vol-target (RiskFormer)", cls: "s1", label: "Cautious strategy, using RiskFormer" },
  { key: "Vol-target (GARCH(1,1))", cls: "s2", label: "Cautious strategy, using GARCH" },
  { key: "Vol-target (EWMA)", cls: "s3", label: "Cautious strategy, using EWMA" },
];

const corr = (a, b) => {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  return sab / Math.sqrt(saa * sbb);
};

export async function initRiskFormer(root) {
  const data = await (await fetch("data/riskformer.json")).json();
  let asset = data.assets[0];

  const assetBtns = root.querySelector("#rf-assets");
  data.assets.forEach((a) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = a; b.setAttribute("aria-pressed", a === asset);
    b.onclick = () => { asset = a; assetBtns.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); render(); };
    assetBtns.appendChild(b);
  });

  const modelBox = root.querySelector("#rf-models");
  MODELS.forEach((m) => {
    const l = document.createElement("label");
    l.className = "chip";
    l.innerHTML = `<input type="checkbox" ${m.on ? "checked" : ""} ${m.fixed ? "disabled" : ""}><span class="sw ${m.cls}"></span>${m.key}`;
    l.querySelector("input").onchange = (e) => { m.on = e.target.checked; render(); };
    modelBox.appendChild(l);
  });

  const legend = root.querySelector("#rf-eq-legend");
  legend.innerHTML = EQUITY.map((e) => `<span class="key"><span class="sw ${e.cls}${e.dash ? " dashed" : ""}"></span>${e.label}</span>`).join("");

  function render() {
    const A = data.per_asset[asset];
    const pct = (v) => `${v.toFixed(0)}%`;
    root.querySelector("#rf-vol-legend").innerHTML =
      `<span class="key"><span class="sw s0"></span>What actually happened</span>` +
      MODELS.filter((m) => m.on).map((m) => `<span class="key"><span class="sw ${m.cls}"></span>${m.key}</span>`).join("");
    lineChart(root.querySelector("#rf-vol"), {
      dates: data.dates, label: `${asset} volatility forecasts vs realized`,
      series: [
        { name: "What actually happened", values: A.realized, cls: "s0", width: 1.25 },
        ...MODELS.filter((m) => m.on).map((m) => ({ name: m.key, values: A.sigma[m.key], cls: m.cls })),
      ],
      yFmt: pct, zero: true,
    });

    const outside = A.ret.map((r, i) => r < A.q05[i] || r > A.q95[i]);
    const cover = 1 - outside.filter(Boolean).length / outside.length;
    lineChart(root.querySelector("#rf-int"), {
      dates: data.dates, label: `${asset} daily returns and RiskFormer 90% interval`,
      series: [],
      band: { lo: A.q05, hi: A.q95, cls: "s1", name: "90% range" },
      points: { values: A.ret, outside, name: "Actual price change" },
      yFmt: (v) => `${v.toFixed(1)}%`, height: 240,
    });

    lineChart(root.querySelector("#rf-eq"), {
      dates: data.dates, label: "Backtest equity curves",
      series: EQUITY.map((e) => ({ name: e.label, values: data.equity[e.key], cls: e.cls, dash: e.dash })),
      yFmt: (v) => v.toFixed(0), height: 260,
    });

    const c = (k) => corr(A.sigma[k], A.realized);
    const best = MODELS.map((m) => [m.key, c(m.key)]).sort((a, b) => b[1] - a[1])[0];
    root.querySelector("#rf-stats").innerHTML = `
      <div class="stat"><div class="k">How closely RiskFormer's predictions tracked reality</div><div class="v">${c("RiskFormer").toFixed(2)}</div><div class="s">Scale of 0 to 1 (correlation). The standard GARCH method: ${c("GARCH(1,1)").toFixed(2)}. Best of all five: ${best[0]}</div></div>
      <div class="stat"><div class="k">When it said “90% sure,” it was right</div><div class="v">${(cover * 100).toFixed(1)}%</div><div class="s">of the time. The goal is 90%: ${outside.filter(Boolean).length} of ${outside.length} days fell outside its range</div></div>
      <div class="stat"><div class="k">Trading days tested</div><div class="v">${data.dates.length}</div><div class="s">${asset}, Jan 2023 to Dec 2025, all unseen during training</div></div>`;
    root.querySelector("#rf-asset-name").textContent = asset;
    root.querySelector("#rf-asset-name2").textContent = asset;
  }
  render();
}

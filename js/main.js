import { createMosaic, PALETTE_NAMES, STYLE_NAMES, PALETTES } from "./mosaic.js";
import { initRiskFormer } from "./riskformer.js";

// ---------- Mosaic demo ----------
const MAX_SIDE = 800;
const $ = (s) => document.querySelector(s);
let source = null;

function fill(sel, names, def) {
  const s = $(sel);
  s.innerHTML = names.map((n) => `<option ${n === def ? "selected" : ""}>${n}</option>`).join("");
}
fill("#mz-palette", PALETTE_NAMES, "Ocean");
fill("#mz-style", STYLE_NAMES, "Circle");

function loadImage(url) {
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, c.width, c.height);
    source = ctx.getImageData(0, 0, c.width, c.height);
    run();
  };
  img.onerror = () => { $("#mz-status").textContent = "That file couldn't be read as an image."; };
  img.src = url;
}

function paint(id, imgData) {
  const c = $(id);
  c.width = imgData.width; c.height = imgData.height;
  c.getContext("2d").putImageData(imgData, 0, 0);
}

function run() {
  if (!source) return;
  const N = +$("#mz-grid").value;
  $("#mz-grid-val").textContent = `${N} × ${N}`;
  try {
    const r = createMosaic(source, N, $("#mz-palette").value, $("#mz-style").value);
    paint("#mz-orig", r.crop); paint("#mz-seg", r.seg); paint("#mz-out", r.out);
    $("#mz-mse").textContent = Math.round(r.mse).toLocaleString();
    $("#mz-ssim").textContent = r.ssim.toFixed(3);
    $("#mz-psnr").textContent = `${r.psnr.toFixed(1)} dB`;
    $("#mz-time").textContent = `${r.ms.toFixed(0)} ms`;
    $("#mz-status").textContent = `${r.crop.width} × ${r.crop.height} px · ${N * N} tiles of ${r.tw} × ${r.th} px`;
    $("#mz-swatches").innerHTML = PALETTES[$("#mz-palette").value].map((c) => `<span style="background:rgb(${c})"></span>`).join("");
  } catch (e) {
    $("#mz-status").textContent = e.message;
  }
}

let pending;
const schedule = () => { clearTimeout(pending); pending = setTimeout(run, 0); };
["#mz-grid", "#mz-palette", "#mz-style"].forEach((s) => $(s).addEventListener("input", schedule));
$("#mz-file").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (f) loadImage(URL.createObjectURL(f));
});
$("#mz-sample").addEventListener("click", () => loadImage("assets/mosaic/original.jpg"));
$("#mz-download").addEventListener("click", () => {
  const a = document.createElement("a");
  a.download = `mosaic-${$("#mz-palette").value}-${$("#mz-style").value}-${$("#mz-grid").value}.png`.toLowerCase();
  a.href = $("#mz-out").toDataURL("image/png");
  a.click();
});
loadImage("assets/mosaic/original.jpg");

// ---------- RiskFormer explorer ----------
initRiskFormer(document.querySelector("#riskformer")).catch((e) => {
  document.querySelector("#rf-vol").textContent = `Couldn't load the results data (${e.message}).`;
});

// ---------- Blackhole gallery ----------
document.querySelectorAll("#bh-thumbs button").forEach((b) => {
  b.addEventListener("click", () => {
    const main = $("#bh-main");
    main.src = b.dataset.src; main.alt = b.dataset.alt;
    main.parentElement.scrollTop = 0;
    $("#bh-caption").textContent = b.dataset.alt;
    document.querySelectorAll("#bh-thumbs button").forEach((x) => x.setAttribute("aria-pressed", x === b));
  });
});

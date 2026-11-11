// In-browser port of the Mosaic-Generator pipeline (github.com/Rhea-Thomas/Mosaic-Generator).
// Same steps as app.py: crop to an N×N grid, average each cell, snap to the nearest palette
// color, draw a pre-rendered tile per cell, then score MSE / SSIM / PSNR on grayscale.

const PALETTES = {
  Grayscale: [0, 32, 64, 96, 128, 160, 192, 224].map((i) => [i, i, i]),
  Ocean: [[0, 30, 60], [0, 60, 100], [0, 100, 140], [0, 140, 180], [30, 170, 200], [80, 200, 220], [140, 220, 235], [200, 240, 250]],
  Vibrant: [[255, 0, 68], [255, 119, 0], [255, 238, 0], [0, 255, 68], [0, 238, 255], [0, 119, 255], [68, 0, 255], [255, 0, 238]],
  Sunset: [[50, 20, 50], [100, 30, 60], [150, 50, 70], [200, 80, 80], [230, 120, 90], [250, 160, 100], [255, 200, 120], [255, 230, 160]],
  Forest: [[34, 139, 34], [46, 139, 87], [60, 179, 113], [144, 238, 144], [85, 107, 47], [128, 128, 0], [152, 251, 152], [173, 255, 47]],
};

const BG = 200; // light background used by the patterned styles, as in app.py
const SQ3 = Math.sqrt(3);

// Each style maps a pixel (i = row, j = col) of an h×w tile to a brightness factor for the
// palette color, or null for the background.
const STYLES = {
  Solid: () => () => 1,
  Gradient: (h) => (i) => 0.5 + 0.5 * (i / h),
  Striped: (h) => { const s = Math.max(1, Math.floor(h / 4)); return (i) => (i % s === 0 ? 0.7 : 1); },
  Circle: (h, w) => { const r = Math.min(h, w) / 2 - 2; return (i, j) => ((j - w / 2) ** 2 + (i - h / 2) ** 2 <= r * r ? 1 : null); },
  Diamond: (h, w) => { const r = Math.min(h, w) / 2 - 2; return (i, j) => (Math.abs(j - w / 2) + Math.abs(i - h / 2) <= r ? 1 : null); },
  Triangle: (h, w) => (i, j) => {
    const left = Math.trunc(w / 2 - (i / h) * w / 2), right = Math.trunc(w / 2 + (i / h) * w / 2);
    return j >= left && j < right ? 1 : null;
  },
  Crosshatch: (h, w) => {
    const sh = Math.max(1, Math.floor(h / 3)), sw = Math.max(1, Math.floor(w / 3));
    return (i, j) => (i % sh === 0 || j % sw === 0 ? 1 : null);
  },
  Noise: () => () => "noise",
  Hexagon: (h, w) => {
    const cx = Math.floor(w / 2), cy = Math.floor(h / 2), r = Math.floor(Math.min(h, w) / 2) - 2;
    return (i, j) => {
      const dx = Math.abs(j - cx), dy = Math.abs(i - cy);
      return r > 0 && dy <= (r * SQ3) / 2 && SQ3 * dx + dy <= SQ3 * r ? 1 : null;
    };
  },
  Mandelbrot: (h, w) => (i, j) => {
    const x = (j - w / 2) / (w / 4), y = (i - h / 2) / (h / 4);
    let zx = 0, zy = 0, it = 0;
    for (let k = 0; k < 10; k++) {
      [zx, zy] = [zx * zx - zy * zy + x, 2 * zx * zy + y];
      if (zx * zx + zy * zy > 4) break;
      it++;
    }
    return it > 5 ? 1 : null;
  },
};

function makeTiles(palette, style, h, w) {
  const fn = STYLES[style](h, w);
  return palette.map((c) => {
    const t = new Uint8ClampedArray(h * w * 4);
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        const f = fn(i, j), p = (i * w + j) * 4;
        for (let k = 0; k < 3; k++) {
          if (f === "noise") t[p + k] = c[k] + Math.floor(Math.random() * 60) - 30;
          else t[p + k] = f === null ? BG : Math.floor(c[k] * f);
        }
        t[p + 3] = 255;
      }
    }
    return t;
  });
}

function gray(data, n) {
  const g = new Float64Array(n);
  for (let p = 0; p < n; p++) g[p] = Math.round(0.299 * data[p * 4] + 0.587 * data[p * 4 + 1] + 0.114 * data[p * 4 + 2]);
  return g;
}

// SSIM as in scikit-image's defaults: 7×7 uniform window, sample covariance, mean over the
// windows that fit entirely inside the image.
function ssim(a, b, W, H) {
  const N = 7, cn = (N * N) / (N * N - 1), C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  const S = (W + 1) * (H + 1);
  const I = [new Float64Array(S), new Float64Array(S), new Float64Array(S), new Float64Array(S), new Float64Array(S)];
  for (let y = 0; y < H; y++) {
    const r = [0, 0, 0, 0, 0];
    for (let x = 0; x < W; x++) {
      const u = a[y * W + x], v = b[y * W + x], v5 = [u, v, u * u, v * v, u * v];
      const o = (y + 1) * (W + 1) + x + 1, up = y * (W + 1) + x + 1;
      for (let k = 0; k < 5; k++) { r[k] += v5[k]; I[k][o] = I[k][up] + r[k]; }
    }
  }
  const box = (k, x, y) => {
    const x1 = x + N, y1 = y + N;
    return (I[k][y1 * (W + 1) + x1] - I[k][y * (W + 1) + x1] - I[k][y1 * (W + 1) + x] + I[k][y * (W + 1) + x]) / (N * N);
  };
  let sum = 0, cnt = 0;
  for (let y = 0; y + N <= H; y++) {
    for (let x = 0; x + N <= W; x++) {
      const ux = box(0, x, y), uy = box(1, x, y);
      const vx = cn * (box(2, x, y) - ux * ux), vy = cn * (box(3, x, y) - uy * uy), vxy = cn * (box(4, x, y) - ux * uy);
      sum += ((2 * ux * uy + C1) * (2 * vxy + C2)) / ((ux * ux + uy * uy + C1) * (vx + vy + C2));
      cnt++;
    }
  }
  return cnt ? sum / cnt : NaN;
}

export function createMosaic(src, N, paletteName, style) {
  const t0 = performance.now();
  const palette = PALETTES[paletteName];
  const th = Math.floor(src.height / N), tw = Math.floor(src.width / N);
  if (th < 1 || tw < 1) throw new Error("Image too small for this grid size");
  const H = th * N, W = tw * N, d = src.data, sw = src.width;

  // 1. Average color per cell, then 2. nearest palette color (Euclidean RGB).
  const idx = new Uint8Array(N * N);
  const seg = new ImageData(W, H), out = new ImageData(W, H), crop = new ImageData(W, H);
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      let r = 0, g = 0, b = 0;
      for (let y = gy * th; y < (gy + 1) * th; y++) {
        for (let x = gx * tw; x < (gx + 1) * tw; x++) {
          const p = (y * sw + x) * 4; r += d[p]; g += d[p + 1]; b += d[p + 2];
        }
      }
      const n = th * tw, c = [Math.floor(r / n), Math.floor(g / n), Math.floor(b / n)];
      let best = 0, bd = Infinity;
      palette.forEach((q, k) => { const dd = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2; if (dd < bd) { bd = dd; best = k; } });
      idx[gy * N + gx] = best;
    }
  }

  // 3. One tile per palette color, 4. assemble by index.
  const tiles = makeTiles(palette, style, th, tw);
  for (let y = 0; y < H; y++) {
    const gy = Math.floor(y / th), ty = y - gy * th;
    for (let x = 0; x < W; x++) {
      const gx = Math.floor(x / tw), k = idx[gy * N + gx], p = (y * W + x) * 4, tp = (ty * tw + (x - gx * tw)) * 4, sp = (y * sw + x) * 4;
      for (let c = 0; c < 4; c++) {
        out.data[p + c] = tiles[k][tp + c];
        crop.data[p + c] = c === 3 ? 255 : d[sp + c];
        seg.data[p + c] = c === 3 ? 255 : palette[k][c];
      }
    }
  }

  // 5. Metrics on grayscale, mosaic vs cropped original.
  const ga = gray(crop.data, W * H), gb = gray(out.data, W * H);
  let se = 0;
  for (let p = 0; p < W * H; p++) se += (ga[p] - gb[p]) ** 2;
  const mse = se / (W * H);
  return {
    crop, seg, out, N, th, tw,
    mse, psnr: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse), ssim: ssim(ga, gb, W, H),
    ms: performance.now() - t0,
  };
}

export const PALETTE_NAMES = Object.keys(PALETTES);
export const STYLE_NAMES = Object.keys(STYLES);
export { PALETTES };

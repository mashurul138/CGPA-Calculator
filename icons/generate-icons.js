/**
 * PWA Icon Generator for CGPA Calculator
 * Generates icon-192.png and icon-512.png using only Node.js built-ins.
 * Run with: node icons/generate-icons.js
 */

"use strict";

const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

/* ─── CRC-32 ──────────────────────────────────────────────────────────────── */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ─── PNG encoder ─────────────────────────────────────────────────────────── */
function pngChunk(type, data) {
  const typeB = Buffer.from(type, "ascii");
  const lenB = Buffer.allocUnsafe(4);
  lenB.writeUInt32BE(data.length, 0);
  const crcB = Buffer.allocUnsafe(4);
  crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])), 0);
  return Buffer.concat([lenB, typeB, data, crcB]);
}

function encodePNG(width, height, rgb) {
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = 1 + width * 3;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * stride + 1);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ─── Pixel helpers ───────────────────────────────────────────────────────── */
function makeCanvas(size) {
  const buf = new Uint8Array(size * size * 3);

  function set(x, y, r, g, b) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 3;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
  }

  function fill(r, g, b) {
    for (let i = 0; i < buf.length; i += 3) {
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
    }
  }

  function rect(x0, y0, w, h, r, g, b) {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) set(x, y, r, g, b);
  }

  function rectGrad(x0, y0, w, h, r0, g0, b0, r1, g1, b1) {
    for (let y = y0; y < y0 + h; y++) {
      const t = h > 1 ? (y - y0) / (h - 1) : 0;
      const ri = Math.round(r0 + (r1 - r0) * t);
      const gi = Math.round(g0 + (g1 - g0) * t);
      const bi = Math.round(b0 + (b1 - b0) * t);
      for (let x = x0; x < x0 + w; x++) set(x, y, ri, gi, bi);
    }
  }

  function circleFill(cx, cy, radius, r, g, b) {
    const r2 = radius * radius;
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const dx = x - cx,
          dy = y - cy;
        if (dx * dx + dy * dy <= r2) set(x, y, r, g, b);
      }
    }
  }

  return { buf, set, fill, rect, rectGrad, circleFill };
}

/* ─── Icon drawing ────────────────────────────────────────────────────────── */
function drawIcon(size) {
  const cv = makeCanvas(size);
  const s = size;

  const BG = [15, 14, 42];
  const BG2 = [22, 20, 60];
  const PUR = [123, 94, 167];
  const LPU = [167, 139, 222];
  const GRN = [86, 211, 100];
  const WHT = [240, 234, 255];

  cv.fill(...BG);

  const cr = Math.round(s * 0.18);
  const ip = Math.round(s * 0.04);

  cv.rect(ip + cr, ip, s - 2 * (ip + cr), s - 2 * ip, ...BG2);
  cv.rect(ip, ip + cr, s - 2 * ip, s - 2 * (ip + cr), ...BG2);
  cv.circleFill(ip + cr, ip + cr, cr, ...BG2);
  cv.circleFill(s - ip - cr, ip + cr, cr, ...BG2);
  cv.circleFill(ip + cr, s - ip - cr, cr, ...BG2);
  cv.circleFill(s - ip - cr, s - ip - cr, cr, ...BG2);

  const cL = Math.round(s * 0.13);
  const cR = Math.round(s * 0.87);
  const cT = Math.round(s * 0.14);
  const cB = Math.round(s * 0.7);
  const cW = cR - cL;
  const cH = cB - cT;

  const bars = [
    { h: 0.52, col: PUR },
    { h: 0.78, col: LPU },
    { h: 0.42, col: PUR },
    { h: 0.93, col: LPU },
    { h: 0.67, col: GRN },
  ];

  const unit = cW / bars.length;
  for (let i = 0; i < bars.length; i++) {
    const { h, col } = bars[i];
    const bx = Math.round(cL + i * unit + unit * 0.12);
    const bw = Math.round(unit * 0.76);
    const bh = Math.round(cH * h);
    const by = cB - bh;

    const [r, g, b] = col;
    const lr = Math.min(255, r + 55),
      lg = Math.min(255, g + 45),
      lb = Math.min(255, b + 45);
    cv.rectGrad(bx, by, bw, bh, lr, lg, lb, r, g, b);

    const capH = Math.max(2, Math.round(s * 0.012));
    cv.rect(
      bx,
      by,
      bw,
      capH,
      Math.min(255, lr + 30),
      Math.min(255, lg + 30),
      Math.min(255, lb + 30),
    );
  }

  const blH = Math.max(2, Math.round(s * 0.018));
  cv.rect(cL, cB, cW, blH, ...PUR);

  const FONT = {
    C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
    P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  };

  const text = "CGPA";
  const fW = 5,
    fH = 7;
  const scale = Math.max(1, Math.round(s / 56));
  const gap = Math.round(scale * 2);
  const tw = text.length * (fW * scale + gap) - gap;
  const tx0 = Math.round((s - tw) / 2);
  const ty0 = Math.round(s * 0.785);

  for (let ci = 0; ci < text.length; ci++) {
    const rows = FONT[text[ci]];
    if (!rows) continue;
    const ox = tx0 + ci * (fW * scale + gap);
    for (let row = 0; row < fH; row++) {
      for (let col = 0; col < fW; col++) {
        if (rows[row][col] === "1") {
          for (let sy = 0; sy < scale; sy++)
            for (let sx = 0; sx < scale; sx++)
              cv.set(ox + col * scale + sx, ty0 + row * scale + sy, ...WHT);
        }
      }
    }
  }

  const dotR = Math.max(2, Math.round(s * 0.028));
  const dotGp = Math.round(s * 0.075);
  const d1x = Math.round(s * 0.75),
    d1y = Math.round(s * 0.1);
  cv.circleFill(d1x, d1y, dotR, ...GRN);
  cv.circleFill(d1x + dotGp, d1y, dotR, ...LPU);

  return cv.buf;
}

/* ─── Main ────────────────────────────────────────────────────────────────── */
const OUT_DIR = __dirname;

for (const size of [192, 512]) {
  const pixels = drawIcon(size);
  const pngData = encodePNG(size, size, pixels);
  const outFile = path.join(OUT_DIR, `icon-${size}.png`);
  fs.writeFileSync(outFile, pngData);
  console.log(`  icon-${size}.png  (${(pngData.length / 1024).toFixed(1)} KB)`);
}

console.log("\nAll icons generated successfully!");

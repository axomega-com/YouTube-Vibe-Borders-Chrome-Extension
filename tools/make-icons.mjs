/**
 * Generates the extension icons as real PNGs with zero dependencies: a PNG is a signature,
 * an IHDR, zlib-deflated scanlines and an IEND, and node:zlib gives us deflate.
 *
 *   node tools/make-icons.mjs      ->  src/icons/icon{16,32,48,128}.png
 *
 * Design: a dark rounded tile with a green-to-red ring (the product's whole idea) and a
 * white play triangle. Rendered 4x and box-downsampled for anti-aliasing.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'src', 'icons');
const SIZES = [16, 32, 48, 128];
const SS = 4; // supersample factor

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Signed distance to a rounded box; <= 0 means inside. */
const boxSdf = (px, py, cx, cy, hx, hy, r) => {
  const qx = Math.abs(px - cx) - (hx - r);
  const qy = Math.abs(py - cy) - (hy - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

const inTriangle = (px, py, s) => {
  const [ax, ay, bx, by, cx, cy] = [0.72 * s, 0.5 * s, 0.34 * s, 0.25 * s, 0.34 * s, 0.75 * s];
  const side = (x1, y1, x2, y2) => (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  const d1 = side(ax, ay, bx, by);
  const d2 = side(bx, by, cx, cy);
  const d3 = side(cx, cy, ax, ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
};

const TILE = [22, 23, 28];
const GREEN = [46, 204, 64];
const RED = [230, 57, 70];

function render(size) {
  const big = size * SS;
  const rgba = Buffer.alloc(size * size * 4);
  const radius = 0.2 * big;
  const ring = 0.085 * big;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let cr = 0, cg = 0, cb = 0, cover = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const px = x * SS + sx + 0.5;
          const py = y * SS + sy + 0.5;
          if (boxSdf(px, py, big / 2, big / 2, big / 2, big / 2, radius) > 0) continue; // transparent corner
          const t = py / big;
          const inRing = boxSdf(px, py, big / 2, big / 2, big / 2 - ring, big / 2 - ring, radius - ring) > 0;
          if (inTriangle(px, py, big)) { cr += 255; cg += 255; cb += 255; }
          else if (inRing) { cr += GREEN[0] + (RED[0] - GREEN[0]) * t; cg += GREEN[1] + (RED[1] - GREEN[1]) * t; cb += GREEN[2] + (RED[2] - GREEN[2]) * t; }
          else { cr += TILE[0]; cg += TILE[1]; cb += TILE[2]; }
          cover += 1;
        }
      }
      const i = (y * size + x) * 4;
      if (cover > 0) {
        // average colour over COVERED subpixels only, so edges do not darken toward black
        rgba[i] = Math.round(cr / cover);
        rgba[i + 1] = Math.round(cg / cover);
        rgba[i + 2] = Math.round(cb / cover);
      }
      rgba[i + 3] = Math.round((cover / (SS * SS)) * 255);
    }
  }
  return encodePng(size, rgba);
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  const file = path.join(OUT, `icon${size}.png`);
  const png = render(size);
  writeFileSync(file, png);
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  console.log(`icon${size}.png  ${png.length} bytes  ${w}x${h}  colourType=${png[25]}`);
}

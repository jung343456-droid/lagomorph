/**
 * Generates 40×40 floor tiles and 20×20 wall / 24×24 obstacle tiles as PNGs.
 * Run once: node scripts/gen-tiles.js
 */
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── PNG encoder ─────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u32be(v) {
  return Buffer.from([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]);
}

function chunk(type, data) {
  const typeB = Buffer.from(type, 'ascii');
  const body  = Buffer.concat([typeB, data]);
  return Buffer.concat([u32be(data.length), body, u32be(crc32(body))]);
}

function encodePNG(w, h, pixels /* Uint8Array RGB row-major */) {
  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit depth, RGB

  const raw = Buffer.alloc((1 + w * 3) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter None
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 3, d = y * (1 + w * 3) + 1 + x * 3;
      raw[d] = pixels[s]; raw[d + 1] = pixels[s + 1]; raw[d + 2] = pixels[s + 2];
    }
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ── pixel helpers ────────────────────────────────────────────────────────────

function fill(px, w, h, rx, ry, rw, rh, r, g, b) {
  for (let y = ry; y < Math.min(ry + rh, h); y++)
    for (let x = rx; x < Math.min(rx + rw, w); x++) {
      const i = (y * w + x) * 3;
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
    }
}

function set(px, w, x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= w) return;
  const i = (y * w + x) * 3;
  px[i] = r; px[i + 1] = g; px[i + 2] = b;
}

function line(px, w, x0, y0, x1, y1, r, g, b) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    set(px, w, x0, y0, r, g, b);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx)  { err += dx; y0 += sy; }
  }
}

// ── tiles ────────────────────────────────────────────────────────────────────

const OUT = path.join(__dirname, '..', 'public', 'assets', 'tiles');
fs.mkdirSync(OUT, { recursive: true });

const T = 40;

// 시드 기반 의사난수 — 타일마다 일관된 grain 패턴
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 균일하게 분포된 noise — base 위에 미세한 명/암 픽셀
function speckle(px, w, h, seed, baseR, baseG, baseB, count, deltaDark, deltaLight) {
  const rng = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng() * w);
    const y = Math.floor(rng() * h);
    const dark = rng() < 0.5;
    const d = dark ? -deltaDark : deltaLight;
    set(px, w, x, y,
      Math.max(0, Math.min(255, baseR + d)),
      Math.max(0, Math.min(255, baseG + d)),
      Math.max(0, Math.min(255, baseB + d)));
  }
}

// tile_floor — 기본 석재 #12121e + grain (경계선 없음 → 인접 타일과 자연스럽게 이어짐)
{
  const px = new Uint8Array(T * T * 3);
  fill(px, T, T, 0, 0, T, T, 0x12, 0x12, 0x1e);
  speckle(px, T, T, 1, 0x12, 0x12, 0x1e, 80, 2, 6);
  fs.writeFileSync(path.join(OUT, 'tile_floor.png'), encodePNG(T, T, px));
  console.log('tile_floor.png');
}

// tile_floor_b — 미세하게 밝은 변형 #14142a (대비 완화)
{
  const px = new Uint8Array(T * T * 3);
  fill(px, T, T, 0, 0, T, T, 0x14, 0x14, 0x24);
  speckle(px, T, T, 2, 0x14, 0x14, 0x24, 90, 2, 8);
  fs.writeFileSync(path.join(OUT, 'tile_floor_b.png'), encodePNG(T, T, px));
  console.log('tile_floor_b.png');
}

// tile_crack — Y자 균열 (base는 동일, 경계선 없음)
{
  const px = new Uint8Array(T * T * 3);
  fill(px, T, T, 0, 0, T, T, 0x12, 0x12, 0x1e);
  speckle(px, T, T, 3, 0x12, 0x12, 0x1e, 60, 2, 4);
  // 소프트 엣지 → 메인 균열 순으로 덮어쓰기
  line(px, T, 10, 11, 20, 23, 0x1e, 0x1e, 0x2e);
  line(px, T, 20, 23, 17, 33, 0x1e, 0x1e, 0x2e);
  line(px, T, 20, 23, 30, 21, 0x1e, 0x1e, 0x2e);
  line(px, T,  9, 11, 19, 23, 0x25, 0x25, 0x35);
  line(px, T, 19, 23, 16, 33, 0x25, 0x25, 0x35);
  line(px, T, 19, 23, 29, 21, 0x25, 0x25, 0x35);
  fs.writeFileSync(path.join(OUT, 'tile_crack.png'), encodePNG(T, T, px));
  console.log('tile_crack.png');
}

// tile_moss — 6개 이끼 패치 (base는 동일, 경계선 없음)
{
  const px = new Uint8Array(T * T * 3);
  fill(px, T, T, 0, 0, T, T, 0x12, 0x12, 0x1e);
  speckle(px, T, T, 4, 0x12, 0x12, 0x1e, 60, 2, 4);
  for (const [mx, my, mw, mh] of [[5,5,4,2],[31,7,4,3],[10,29,5,3],[27,27,5,2],[21,17,3,2],[3,20,3,3]]) {
    fill(px, T, T, mx, my, mw, mh, 0x1a, 0x30, 0x1a);
    fill(px, T, T, mx + 1, my, mw - 1, Math.ceil(mh / 2), 0x1e, 0x3a, 0x1e);
    set(px, T, mx + 1, my, 0x24, 0x4a, 0x26);
  }
  fs.writeFileSync(path.join(OUT, 'tile_moss.png'), encodePNG(T, T, px));
  console.log('tile_moss.png');
}

// tile_wall — 20×20 brick texture
{
  const W = 20;
  const px = new Uint8Array(W * W * 3);
  fill(px, W, W, 0, 0, W, W, 0x3a, 0x3a, 0x5e);
  // top highlight
  for (let x = 0; x < W; x++) set(px, W, x, 0, 0x3e, 0x3e, 0x66);
  // bottom shade
  for (let x = 0; x < W; x++) {
    set(px, W, x, W - 1, 0x32, 0x32, 0x5a);
    set(px, W, x, W - 2, 0x32, 0x32, 0x5a);
  }
  // horizontal mortar at y=7 and y=15
  for (let x = 0; x < W; x++) {
    set(px, W, x, 7,  0x2a, 0x2a, 0x4e);
    set(px, W, x, 15, 0x2a, 0x2a, 0x4e);
  }
  // vertical mortar — offset by half-brick each row band
  for (let y = 1; y < 7;  y++) set(px, W, 10, y, 0x2a, 0x2a, 0x4e);
  for (let y = 8; y < 15; y++) set(px, W,  0, y, 0x2a, 0x2a, 0x4e);
  for (let y = 16; y < W - 1; y++) set(px, W, 10, y, 0x2a, 0x2a, 0x4e);
  fs.writeFileSync(path.join(OUT, 'tile_wall.png'), encodePNG(W, W, px));
  console.log('tile_wall.png');
}

// tile_obstacle — 24×24 boulder (top-left lit)
{
  const S = 24;
  const px = new Uint8Array(S * S * 3);
  fill(px, S, S, 0, 0, S, S, 0x2a, 0x2a, 0x50);
  fill(px, S, S, 10, 8, S - 10, S - 8, 0x1e, 0x1e, 0x3e);
  fill(px, S, S, 15, 15, S - 15, S - 15, 0x16, 0x16, 0x30);
  fill(px, S, S, 0, 0, 10, 8, 0x3a, 0x3a, 0x66);
  for (let x = 0; x < 10; x++) set(px, S, x, 0, 0x3e, 0x3e, 0x6a);
  for (let y = 0; y < 8;  y++) set(px, S, 0, y, 0x3e, 0x3e, 0x6a);
  fs.writeFileSync(path.join(OUT, 'tile_obstacle.png'), encodePNG(S, S, px));
  console.log('tile_obstacle.png');
}

console.log('\nAll tiles generated → public/assets/tiles/');

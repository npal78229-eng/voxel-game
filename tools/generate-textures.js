#!/usr/bin/env node
/**
 * generate-textures.js  (HD Minecraft Edition)
 * Original procedural texture atlas. NO dependencies, needs only Node 16+.
 * Every tile is painted from seeded noise, height-map lighting, Voronoi stones,
 * hand-built leaf/blade/gem shapes and colour gradients. Nothing is copied from any game.
 *
 *   node tools/generate-textures.js                  -> 32px tiles (512x512 atlas)  DEFAULT
 *   node tools/generate-textures.js --tile 64        -> 64px tiles (1024x1024)  most detailed
 *   node tools/generate-textures.js --tile 16        -> classic small tiles
 *   node tools/generate-textures.js --seed 1337 --leaf-holes 0.10 --out public/assets/textures
 *
 * Output: atlas.png, atlas.json, atlas_preview.png
 */
'use strict';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const T = [16, 32, 64].includes(parseInt(arg('tile', '32'), 10)) ? parseInt(arg('tile', '32'), 10) : 32;
const SEED = parseInt(arg('seed', '1337'), 10);
const OUT = arg('out', 'public/assets/textures');
const LEAF_HOLES = parseFloat(arg('leaf-holes', '0.10'));
const COLS = 16, ATLAS = T * COLS, K = T / 16, TAU = Math.PI * 2;

/* ───────────── basic helpers ───────────── */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const stops = arr => arr.map(hex);
const shade = (c, f) => [Math.round(clamp(c[0] * f, 0, 255)), Math.round(clamp(c[1] * f, 0, 255)), Math.round(clamp(c[2] * f, 0, 255))];
const mix = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
const stretch = (v, k = 1.9) => clamp((v - 0.5) * k + 0.5, 0, 1);
const wrap = v => ((v % T) + T) % T;
function grad(s, v) { v = clamp(v, 0, 1) * (s.length - 1); const i = Math.min(Math.floor(v), s.length - 2); return mix(s[i], s[i + 1], v - i); }

class Tile {
  constructor() { this.d = new Uint8Array(T * T * 4); }
  set(x, y, c, a = 255) { if (x < 0 || y < 0 || x >= T || y >= T) return; const i = (y * T + x) * 4; this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a; }
  setW(x, y, c, a = 255) { this.set(wrap(Math.round(x)), wrap(Math.round(y)), c, a); }
  get(x, y) { const i = (wrap(Math.round(y)) * T + wrap(Math.round(x))) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  alphaAt(x, y) { return this.d[(wrap(Math.round(y)) * T + wrap(Math.round(x))) * 4 + 3]; }
  each(fn) { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) fn(x, y); }
}

/* Tileable noise: nx x ny lattice that wraps, so tiles never show seams */
function noiseGrid(r, nx, ny) {
  nx = Math.max(1, Math.min(T, Math.round(nx))); ny = Math.max(1, Math.min(T, Math.round(ny)));
  const g = new Float32Array(nx * ny); for (let i = 0; i < g.length; i++) g[i] = r();
  const wx = v => ((v % nx) + nx) % nx, wy = v => ((v % ny) + ny) % ny;
  return (x, y) => {
    const fx = (x / T) * nx, fy = (y / T) * ny, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[wy(y0) * nx + wx(x0)], b = g[wy(y0) * nx + wx(x0 + 1)], c = g[wy(y0 + 1) * nx + wx(x0)], d = g[wy(y0 + 1) * nx + wx(x0 + 1)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
function fbm(r, { base = 2, oct = 4, gain = 0.5, ax = 1, ay = 1 } = {}) {
  const L = []; let amp = 1, sum = 0;
  for (let i = 0; i < oct; i++) { const nx = base * ax * 2 ** i, ny = base * ay * 2 ** i; if (nx > T && ny > T) break; L.push({ n: noiseGrid(r, nx, ny), amp }); sum += amp; amp *= gain; }
  return (x, y) => { let v = 0; for (const l of L) v += l.n(x, y) * l.amp; return v / sum; };
}
/* Tileable Voronoi on a jittered g x g grid */
function voronoi(r, g) {
  const pts = [], cs = T / g;
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) pts.push([(i + 0.2 + r() * 0.6) * cs, (j + 0.2 + r() * 0.6) * cs]);
  const f = (x, y) => {
    let d1 = 1e9, d2 = 1e9, id = -1, ddx = 0, ddy = 0;
    for (let i = 0; i < pts.length; i++) {
      let dx = x - pts[i][0], dy = y - pts[i][1];
      dx -= Math.round(dx / T) * T; dy -= Math.round(dy / T) * T;
      const d = Math.hypot(dx, dy);
      if (d < d1) { d2 = d1; d1 = d; id = i; ddx = dx; ddy = dy; } else if (d < d2) d2 = d;
    }
    return { d1, d2, id, dx: ddx, dy: ddy };
  };
  f.count = pts.length; f.cell = cs; return f;
}
const field = fn => { const F = new Float32Array(T * T); for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) F[y * T + x] = fn(x, y); return F; };
const at = (F, x, y) => F[wrap(y) * T + wrap(x)];
const slope = (F, x, y) => at(F, x + 1, y + 1) - at(F, x - 1, y - 1);
function paintField(t, F, s, { k = 2, jit = 0.02, r, alpha = 255 } = {}) {
  const kk = k * (K / 2);
  t.each((x, y) => {
    const c = shade(grad(s, F[y * T + x]), clamp(1 + slope(F, x, y) * kk, 0.5, 1.6) * (1 + ((r ? r() : 0.5) - 0.5) * jit * 2));
    t.set(x, y, c, alpha);
  });
}
function lump(t, cx, cy, R, s, { diamond = false, shadow = 0.6, tone = 0.6, r } = {}) {
  const ext = Math.ceil(R) + 2, so = Math.max(1, Math.round(K * 0.6));
  if (shadow < 1) for (let py = -ext; py <= ext; py++) for (let px = -ext; px <= ext; px++) {
    const u = px - so, v = py - so, d = diamond ? Math.abs(u) + Math.abs(v) : Math.hypot(u, v);
    if (d < R + 0.6 && (diamond ? Math.abs(px) + Math.abs(py) : Math.hypot(px, py)) >= R) t.setW(cx + px, cy + py, shade(t.get(cx + px, cy + py), shadow));
  }
  for (let py = -ext; py <= ext; py++) for (let px = -ext; px <= ext; px++) {
    const d = diamond ? Math.abs(px) + Math.abs(py) : Math.hypot(px, py);
    if (d > R) continue;
    const light = (-px * 0.6 - py * 0.8) / R, edge = d / R;
    let c = grad(s, clamp(tone + 0.38 * light - 0.12 * edge * edge + ((r ? r() : 0.5) - 0.5) * 0.08, 0, 1));
    if (edge > 0.82) c = shade(c, 0.82);
    t.setW(cx + px, cy + py, c);
  }
  t.setW(cx - R * 0.35, cy - R * 0.4, s[s.length - 1]);
}
function crackLine(t, r, x, y, len, dark = 0.55, light = 1.18) {
  let a = r() * TAU;
  for (let i = 0; i < len; i++) {
    t.setW(x, y, shade(t.get(x, y), dark)); t.setW(x + 1, y + 1, shade(t.get(x + 1, y + 1), light));
    a += (r() - 0.5) * 1.1; x += Math.cos(a); y += Math.sin(a);
  }
}

/* ───────────── palettes (all original) ───────────── */
const P = {
  grass: stops(['#2a5c1f', '#377029', '#47872f', '#5aa03a', '#72b849', '#8fd05c']),
  blade: stops(['#2f6a24', '#4a9134', '#6fb84a', '#9ad86a', '#c4ef8a']),
  dirt: stops(['#3f2716', '#55351f', '#6b4527', '#815630', '#976a3d', '#ad7f4d']),
  pebble: stops(['#4a4238', '#62574a', '#7b6e5e', '#958775', '#b0a28c']),
  stone: stops(['#484b54', '#5a5d66', '#6c6f78', '#7f828a', '#92959c', '#a7aaaf']),
  sand: stops(['#b9a866', '#c9b976', '#d8cb88', '#e5d99c', '#f0e6b3']),
  snow: stops(['#a9c2dc', '#c4d6e9', '#dce9f5', '#eff6fc', '#ffffff']),
  ice: stops(['#5f9fd0', '#7fb6e0', '#9fcbea', '#c0e2f6', '#e2f5fd']),
  oakBark: stops(['#1f1307', '#2f1e0e', '#412b16', '#553a1f', '#6a4a29', '#815d35']),
  birchBark: stops(['#8f8b7c', '#aaa697', '#c4c0b1', '#dcd8ca', '#eeebe0', '#faf8f1']),
  pineBark: stops(['#1b100b', '#2a1a12', '#3b261a', '#4e3323', '#654332', '#7e5642']),
  oakWood: stops(['#86592a', '#9d6f38', '#b3854a', '#c99b5c', '#dfb474']),
  birchWood: stops(['#a89268', '#bda978', '#cfbd8b', '#dfd0a1', '#ede1b8']),
  pineWood: stops(['#6d4327', '#835636', '#996a44', '#af8055', '#c5966a']),
  oakPlank: stops(['#7d5528', '#94692f', '#ab7e3f', '#c19350', '#d6a962']),
  birchPlank: stops(['#b09a6a', '#c3af7d', '#d5c48f', '#e4d5a4', '#f1e5bb']),
  pinePlank: stops(['#664024', '#7c5231', '#926440', '#a8784f', '#bd8d60']),
  leafOak: stops(['#143d14', '#1d5219', '#276820', '#347f29', '#449833', '#59b043', '#76c95a']),
  leafBirch: stops(['#2f5a1a', '#417022', '#55882c', '#6c9f38', '#85b846', '#a1d05a', '#c0e67c']),
  leafPine: stops(['#0d2a20', '#123a2a', '#184c35', '#205f41', '#2b7551', '#3b8d64', '#55a87c']),
  water: stops(['#1b4b8f', '#245a9e', '#2f6db4', '#3f81c9', '#58a0e0', '#8ec5f0']),
  lava: stops(['#5a0e00', '#8f2000', '#c93a04', '#f0620f', '#fa9a1e', '#fed553', '#fff0a8']),
  crust: stops(['#160b08', '#241310', '#361d16', '#4a2a1f']),
  brick: stops(['#5e1f17', '#742a1e', '#8a3626', '#a04630', '#b5583a', '#c96d4a']),
  mortar: stops(['#8a857a', '#9d988b', '#b3aea1']),
  cactus: stops(['#1c4d26', '#256030', '#2f7539', '#3b8b45', '#4fa259', '#6cbb70']),
  coal: stops(['#0c0c10', '#1a1a20', '#2a2a32', '#3d3d47', '#5a5a66']),
  iron: stops(['#8f5b42', '#b0704f', '#cf8b63', '#e7a97f', '#f6cba9']),
  gold: stops(['#a87a0c', '#cc9a14', '#eab92a', '#f8d64f', '#fff1a0']),
  crystal: stops(['#0c8aa0', '#16afc4', '#3fd0dc', '#7eeaee', '#d0fbfb']),
  redstone: stops(['#4a0404', '#850a0a', '#c41414', '#f22e2e', '#ff8585']),
  emerald: stops(['#064e24', '#0b7a38', '#14ad52', '#38df76', '#a7f7c4']),
  bedrock: stops(['#090a0d', '#16181f', '#252832', '#383d4a', '#505666']),
  obsidian: stops(['#07040d', '#120a21', '#1f1238', '#311d54', '#4b2f7a']),
  glowstone: stops(['#5c3409', '#8f5512', '#c7831e', '#f2b838', '#fde676', '#fffbe0']),
  pumpkin: stops(['#8a3808', '#b04a0c', '#d46214', '#ea7b1e', '#f79836']),
  melon: stops(['#1e4214', '#2e611c', '#458226', '#68a838', '#96cf58']),
};

/* ───────────── painters ───────────── */
function paintGrass(t, r) {
  const n = fbm(r, { base: 2, oct: 4 });
  paintField(t, field((x, y) => stretch(n(x, y), 2.1) * 0.75), P.grass, { k: 1.2, jit: 0.03, r });
  const count = Math.round(T * T / 5), bw = Math.max(1, Math.round(K / 2));
  for (let i = 0; i < count; i++) {
    const x = r() * T, y = r() * T, L = (2.2 + r() * 3.2) * K * 0.9, lean = (r() - 0.5) * 0.9, br = 0.55 + r() * 0.45;
    for (let s = 0; s <= L; s++) { const f = s / L, c = grad(P.blade, (0.1 + 0.8 * f) * br); for (let w = 0; w < bw; w++) t.setW(x + lean * s + w, y - s, c); }
  }
  for (let i = 0; i < T * T / 45; i++) t.setW(r() * T, r() * T, hex('#b7a94a'));
}
function paintDirt(t, r) {
  const n = fbm(r, { base: 2, oct: 5 });
  paintField(t, field((x, y) => stretch(n(x, y), 2.0) * 0.85), P.dirt, { k: 1.8, jit: 0.04, r });
  for (let i = 0; i < T * T / 60; i++) { const x = r() * T, y = r() * T; t.setW(x, y, shade(t.get(x, y), 0.6)); if (r() < 0.6) t.setW(x + 1, y, shade(t.get(x + 1, y), 0.7)); }
  for (let i = 0; i < Math.round(T / 8); i++) lump(t, r() * T, r() * T, (0.4 + r() * 0.6) * K, P.pebble, { tone: 0.35 + r() * 0.4, shadow: 0.75, r });
  for (let i = 0; i < T * T / 40; i++) t.setW(r() * T, r() * T, shade(P.dirt[4], 1.08));
}
function paintCoverSide(t, r, coverPainter, coverName, lowStops) {
  const G = new Tile(); coverPainter(G, rng(SEED ^ hashStr(coverName)));
  const D = new Tile(); paintDirt(D, rng(SEED ^ hashStr('dirt_a')));
  const bn = noiseGrid(r, Math.max(2, T / 2), 1), base = T * 0.27, sh = Math.max(2, Math.round(K * 1.6));
  for (let x = 0; x < T; x++) {
    const hb = Math.round(base + (bn(x, 0) - 0.5) * T * 0.16 + (r() < 0.3 ? r() * T * 0.1 : 0));
    for (let y = 0; y < T; y++) {
      if (y < hb) { let c = G.get(x, y); if (y >= hb - Math.max(1, Math.round(K / 2))) c = shade(c, 0.82); t.set(x, y, c); }
      else { const j = y - hb; t.set(x, y, shade(D.get(x, y), j < sh ? 0.6 + 0.4 * (j / sh) : 1)); }
    }
    if (r() < 0.45) { const e = K * (1 + r() * 2.2); for (let j = 0; j < e; j++) if (r() < 0.9 - j / e * 0.3) t.set(x, hb + j, grad(lowStops, 0.3 + 0.45 * r() - j / e * 0.15)); }
  }
}
function paintStone(t, r) {
  const n = fbm(r, { base: 2, oct: 5 }), w = fbm(r, { base: 2, oct: 2 });
  paintField(t, field((x, y) => stretch(n(x, y), 1.5) * 0.85 + (Math.sin(TAU * (2 * y / T + 1.0 * w(x, y))) * 0.5 + 0.5) * 0.08), P.stone, { k: 1.6, jit: 0.06, r });
  for (let i = 0; i < 1 + Math.round(K / 2); i++) crackLine(t, r, r() * T, r() * T, (4 + r() * 5) * K, 0.68, 1.1);
  for (let i = 0; i < T * T / 30; i++) { const x = r() * T, y = r() * T; t.setW(x, y, shade(t.get(x, y), r() < 0.5 ? 0.82 : 1.16)); }
  for (let i = 0; i < T / 8; i++) { const x = r() * T, y = r() * T; t.setW(x, y, P.stone[5]); t.setW(x + 1, y, shade(P.stone[5], 0.9)); }
}
function paintCells(t, r, g, { colors, mortarW, mortarCol, dome = 0.5, k = 5, warp = 0.08, mortarLight = 1 }) {
  const V = voronoi(r, g), cs = T / g, nz = fbm(r, { base: 4, oct: 3 }), wn = fbm(r, { base: 2, oct: 2 });
  const tone = []; for (let i = 0; i < V.count; i++) tone.push({ c: colors[Math.floor(r() * colors.length)], b: 0.85 + r() * 0.3 });
  const W = (x, y) => V(x + (wn(x, y) - 0.5) * T * warp, y + (wn(y + 7, x + 3) - 0.5) * T * warp);
  const H = field((x, y) => { const c = W(x, y); return clamp((c.d2 - c.d1) / (cs * dome), 0, 1); });
  t.each((x, y) => {
    const c = W(x, y), edge = c.d2 - c.d1, tx = 0.9 + 0.2 * nz(x, y);
    if (edge < mortarW) { t.set(x, y, shade(grad(mortarCol, 0.4 + 0.5 * nz(x, y)), mortarLight)); return; }
    const h = H[y * T + x], f = (0.86 + 0.24 * h) * clamp(1 + slope(H, x, y) * k * (K / 2), 0.55, 1.5) * tx * tone[c.id].b;
    t.set(x, y, shade(tone[c.id].c, f * (1 + (r() - 0.5) * 0.06)));
  });
}
function paintCobble(t, r) {
  const cols = [P.stone[2], P.stone[3], mix(P.stone[2], hex('#7a6f5f'), 0.35), P.stone[1], mix(P.stone[3], hex('#6f7a72'), 0.3)];
  paintCells(t, r, Math.max(3, Math.round(T / 8)), { colors: cols, mortarW: Math.max(1.1, K * 0.85), mortarCol: stops(['#3a3b41', '#4a4b52', '#5b5c63']), dome: 0.22, k: 1.6 });
}
function paintMossyCobble(t, r) {
  const cols = [P.stone[2], P.stone[3], mix(P.stone[2], hex('#587846'), 0.4), P.stone[1]];
  paintCells(t, r, Math.max(3, Math.round(T / 8)), { colors: cols, mortarW: Math.max(1.2, K * 0.9), mortarCol: stops(['#254f1d', '#3a752c', '#589c42']), dome: 0.22, k: 1.6 });
}
function paintGravel(t, r) {
  const cols = stops(['#5c5a58', '#77736e', '#8f8a83', '#a59d92', '#7b6f60', '#9a8b74', '#67696d']);
  paintCells(t, r, Math.max(3, Math.round(T / 6)), { colors: cols, mortarW: Math.max(0.9, K * 0.6), mortarCol: stops(['#2a2826', '#3a3734', '#4a4642']), dome: 0.3, k: 1.8, warp: 0.05 });
}
function paintSand(t, r) {
  const w = fbm(r, { base: 2, oct: 3 }), f = fbm(r, { base: 4, oct: 4 });
  paintField(t, field((x, y) => (Math.sin(TAU * (2 * y / T + 0.9 * w(x, y))) * 0.5 + 0.5) * 0.25 + stretch(f(x, y), 1.5) * 0.6 + 0.1), P.sand, { k: 1.6, jit: 0.07, r });
  for (let i = 0; i < T * T / 7; i++) { const x = r() * T, y = r() * T; t.setW(x, y, shade(t.get(x, y), r() < 0.5 ? 0.9 : 1.08)); }
  for (let i = 0; i < 3; i++) lump(t, r() * T, r() * T, (0.5 + r() * 0.5) * K, P.pebble, { tone: 0.6, shadow: 0.75, r });
}
function paintSnow(t, r) {
  const n = fbm(r, { base: 2, oct: 4 });
  paintField(t, field((x, y) => 0.45 + stretch(n(x, y), 1.8) * 0.55), P.snow, { k: 2.2, jit: 0.02, r });
  for (let i = 0; i < T * T / 40; i++) t.setW(r() * T, r() * T, [255, 255, 255]);
  for (let i = 0; i < T * T / 60; i++) t.setW(r() * T, r() * T, P.snow[0]);
}
function paintIce(t, r) {
  const n = fbm(r, { base: 2, oct: 4 });
  paintField(t, field((x, y) => stretch(n(x, y), 1.8) * 0.7 + 0.15 + 0.15 * ((x + y) % T) / T), P.ice, { k: 1.5, jit: 0.02, r, alpha: 210 });
  for (let i = 0; i < 3 + Math.round(K); i++) { let x = r() * T, y = r() * T, a = r() * TAU; for (let j = 0; j < (6 + r() * 8) * K; j++) { t.setW(x, y, P.ice[4], 235); t.setW(x + 1, y + 1, P.ice[0], 200); a += (r() - 0.5) * 0.9; x += Math.cos(a); y += Math.sin(a); } }
}
function paintBarkSide(t, r, bark, { ridge = 1, marks = false } = {}) {
  const n = fbm(r, { base: 2, oct: 4, ax: K, ay: 0.5 }), wn = fbm(r, { base: 2, oct: 2 });
  const F = field((x, y) => { const v = n(x + (wn(x, y) - 0.5) * T * 0.15, y); const rd = 1 - Math.abs(2 * v - 1); return clamp(0.25 + Math.pow(rd, 1.6) * 0.75 * ridge + (1 - ridge) * v * 0.6, 0, 1); });
  paintField(t, F, bark, { k: 2.6, jit: 0.03, r });
  for (let i = 0; i < Math.round(4 * K); i++) {
    let x = r() * T, y = r() * T; const len = (5 + r() * 8) * K;
    for (let j = 0; j < len; j++) { t.setW(x, y, shade(t.get(x, y), 0.5)); t.setW(x + 1, y, shade(t.get(x + 1, y), 1.15)); x += (r() - 0.5) * 0.7; y += 1; }
  }
  if (marks) for (let i = 0; i < Math.round(2.5 * K); i++) {
    const cx = r() * T, cy = r() * T, w = (1 + r() * 2.2) * K, h = Math.max(1, Math.round(K * (0.3 + r() * 0.4)));
    for (let py = -h; py <= h; py++) for (let px = -w; px <= w; px++) if ((px / w) ** 2 + (py / (h + 0.5)) ** 2 <= 1) t.setW(cx + px, cy + py, shade(hex(r() < 0.6 ? '#1f1d1a' : '#3a3833'), 1 + (r() - 0.5) * 0.3));
  }
}
function paintLogTop(t, r, bark, wood, barkTone = 1) {
  const c0 = T / 2 - 0.5, bw = Math.max(2, Math.round(K * 1.6)), nz = fbm(r, { base: 2, oct: 3 }), bn = fbm(r, { base: 4, oct: 3 });
  const F = field((x, y) => {
    const dx = x - c0, dy = y - c0, ch = Math.max(Math.abs(dx), Math.abs(dy));
    if (ch >= c0 + 0.5 - bw) return 0.15 + bn(x, y) * 0.7;
    return 0;
  });
  t.each((x, y) => {
    const dx = x - c0, dy = y - c0, ch = Math.max(Math.abs(dx), Math.abs(dy));
    if (ch >= c0 + 0.5 - bw) { const edge = ch - (c0 + 0.5 - bw); t.set(x, y, shade(grad(bark, F[y * T + x]), (edge > bw - 1 ? 0.75 : 1) * barkTone * clamp(1 + slope(F, x, y) * 2 * K / 2, 0.6, 1.4))); return; }
    const d = Math.hypot(dx, dy), dd = d + (nz(x, y) - 0.5) * T * 0.16;
    const ring = 0.5 + 0.5 * Math.sin(dd * TAU / (T / 5.5));
    let v = 0.3 + 0.38 * ring + 0.22 * (dd / c0);
    let c = grad(wood, v);
    if (dd < T * 0.07) c = shade(c, 0.78);
    if (ch > c0 - bw - Math.max(1, K)) c = shade(c, 0.86);
    t.set(x, y, shade(c, 1 + (r() - 0.5) * 0.06));
  });
  for (let i = 0; i < 2; i++) { const a = r() * TAU, len = (0.25 + r() * 0.2) * c0; for (let s = T * 0.09; s < len; s += 0.6) { const x = c0 + Math.cos(a) * s, y = c0 + Math.sin(a) * s; t.setW(x, y, shade(t.get(x, y), 0.85)); } }
}
function paintPlanks(t, r, s) {
  const ph = T / 4, g = fbm(r, { base: 2, oct: 4, ax: 1, ay: K * 2 }), lw = Math.max(1, Math.round(K / 2));
  for (let row = 0; row < 4; row++) {
    const tone = 0.25 + r() * 0.5, jx = Math.floor(r() * T), knot = r() < 0.5 ? [r() * T, row * ph + ph / 2] : null;
    for (let ly = 0; ly < ph; ly++) for (let x = 0; x < T; x++) {
      const y = row * ph + ly;
      let v = tone * 0.55 + 0.45 * stretch(g(x + row * 5, y), 1.7);
      if (knot) { const d = Math.hypot(x - knot[0], (y - knot[1]) * 1.6); if (d < 2.6 * K) v -= 0.22 * (0.5 + 0.5 * Math.sin(d * 2.4 / K)); }
      let c = grad(s, v);
      if (ly < lw) c = shade(c, 1.14); else if (ly >= ph - Math.max(1, Math.round(K * 0.8))) c = shade(c, 0.52);
      if (x === jx) c = shade(c, 0.55); else if (x === wrap(jx + 1)) c = shade(c, 1.1);
      t.set(x, y, shade(c, 1 + (r() - 0.5) * 0.05));
    }
    for (const nx of [jx + 2.2 * K]) lump(t, nx, row * ph + ph / 2, Math.max(0.7, K * 0.4), stops(['#2b2118', '#4a4038', '#7d7469', '#b9b2a6']), { shadow: 0.7, tone: 0.55, r });
  }
}
function drawLeaf(t, cx, cy, len, wid, ang, s, tone, r, onlyCovered = false) {
  cx = Math.round(cx); cy = Math.round(cy);
  const cs = Math.cos(ang), sn = Math.sin(ang), hu = len / 2, R = Math.ceil(hu + 1), sdot = 0.6 * sn - 0.8 * cs;
  for (let py = -R; py <= R; py++) for (let px = -R; px <= R; px++) {
    const u = px * cs + py * sn, v = -px * sn + py * cs; if (Math.abs(u) > hu) continue;
    const w = (wid / 2) * (1 - (u / hu) ** 2) + 0.35; if (Math.abs(v) > w) continue;
    const nv = v / w; if (onlyCovered && t.alphaAt(cx + px, cy + py) === 0) continue;
    let c = grad(s, clamp(tone + 0.2 * nv * sdot + 0.09 * (u / hu) + (r() - 0.5) * 0.04, 0, 1));
    if (Math.abs(v) < 0.5 && Math.abs(u) < hu * 0.8) c = shade(c, 0.82);
    if (Math.abs(nv) > 0.8) c = shade(c, 0.88);
    t.setW(cx + px, cy + py, c);
  }
}
function paintLeaves(t, r, s, style) {
  const cover = () => { let n = 0; for (let i = 3; i < t.d.length; i += 4) if (t.d[i]) n++; return n / (T * T); };
  const target = 1 - LEAF_HOLES, pine = style === 'needle';
  const dims = (a, b, kW) => { const len = (a + r() * b) * K; return [len, len * kW]; };
  for (let i = 0; i < 700 && cover() < target; i++) {
    const [len, wid] = pine ? dims(4.6, 2.6, 0.3) : dims(3.4, 2.4, 0.48);
    drawLeaf(t, r() * T, r() * T, len, wid, pine ? Math.PI / 2 + (r() - 0.5) * 1.7 : r() * TAU, s, 0.04 + r() * 0.26, r);
  }
  // Fill any remaining transparent holes with deep leaf shadow so opaque block faces never look black
  t.each((x, y) => { if (!t.alphaAt(x, y)) t.set(x, y, grad(s, 0.04)); });
  const layer = (n, a, b, kW, lo, hi) => { for (let i = 0; i < n; i++) { const [len, wid] = dims(a, b, kW); drawLeaf(t, r() * T, r() * T, len, wid, pine ? Math.PI / 2 + (r() - 0.5) * 2.0 : r() * TAU, s, lo + r() * (hi - lo), r, true); } };
  const area = T * T;
  if (pine) { layer(Math.round(area / (7 * K * K) * 1.4), 3.6, 2.0, 0.26, 0.3, 0.6); layer(Math.round(area / (5 * K * K) * 1.2), 2.8, 1.8, 0.22, 0.55, 0.95); }
  else { layer(Math.round(area / (7.5 * K * K) * 1.5), 2.8, 2.0, 0.5, 0.3, 0.62); layer(Math.round(area / (9 * K * K) * 1.1), 2.2, 1.6, 0.52, 0.6, 1.0); }
}
function paintWater(t, r) {
  const V = voronoi(r, Math.max(3, Math.round(T / 8))), nz = fbm(r, { base: 2, oct: 3 }), nz2 = fbm(r, { base: 4, oct: 3 });
  t.each((x, y) => {
    const wx = x + (nz(x, y) - 0.5) * T * 0.25, wy = y + (nz(y + 5, x + 9) - 0.5) * T * 0.25, c = V(wx, wy), e = c.d2 - c.d1;
    const wave = Math.sin(TAU * (2 * y / T + 1.1 * nz(x, y))) * 0.5 + 0.5, caustic = Math.pow(clamp(1 - e / (V.cell * 0.2), 0, 1), 1.5);
    const v = 0.22 + 0.28 * wave + 0.16 * stretch(nz2(x, y), 1.6) + 0.42 * caustic;
    t.set(x, y, grad(P.water, v), Math.round(190 + 30 * caustic));
  });
}
function paintLava(t, r) {
  const V = voronoi(r, Math.max(3, Math.round(T / 7))), nz = fbm(r, { base: 2, oct: 4 }), nz2 = fbm(r, { base: 4, oct: 3 });
  t.each((x, y) => {
    const wx = x + (nz(x, y) - 0.5) * T * 0.2, wy = y + (nz(y + 3, x + 6) - 0.5) * T * 0.2, c = V(wx, wy), e = c.d2 - c.d1;
    const glow = Math.pow(clamp(1 - e / (V.cell * 0.32), 0, 1), 0.75);
    const crust = grad(P.crust, stretch(nz2(x, y), 1.8)), hot = grad(P.lava, 0.42 + 0.58 * stretch(nz(x + 5, y + 5), 1.7));
    let col = mix(crust, hot, glow);
    if (glow < 0.2 && nz2(x, y) > 0.66) col = mix(col, P.lava[3], 0.55);
    t.set(x, y, col);
  });
}
function paintGlass(t, r) {
  const fw = Math.max(1, Math.round(K * 0.9));
  t.each((x, y) => {
    const d = Math.min(x, y, T - 1 - x, T - 1 - y), inner = d < fw;
    if (inner) t.set(x, y, shade(hex('#d6eef4'), d === 0 ? 1 : 0.92), 220);
    else if (d < fw * 2) t.set(x, y, hex('#c3e6ef'), 60); else t.set(x, y, hex('#bfe4ee'), 26);
  });
  const band = (o, w, a) => { for (let i = 0; i < T; i++) for (let j = 0; j < w; j++) { const x = i, y = T - 1 - i - o - j; if (x > fw && y > fw && x < T - fw && y < T - fw) t.set(x, y, [255, 255, 255], a); } };
  band(Math.round(T * 0.32), Math.max(1, Math.round(K * 1.5)), 200); band(Math.round(T * 0.32) + Math.round(K * 3.2), Math.max(1, Math.round(K * 0.8)), 150);
  void r;
}
function paintBricks(t, r, pal = P.brick, mortarPal = P.mortar) {
  const rows = 4, bh = T / rows, bw = T / 2, mw = Math.max(1, Math.round(K * 0.6)), bv = Math.max(1, Math.round(K / 2));
  const nz = fbm(r, { base: T / 2, oct: 2 }), nm = fbm(r, { base: 4, oct: 3 }), tone = {};
  t.each((x, y) => {
    const row = Math.floor(y / bh), xx = (x + (row % 2) * (bw / 2)) % T, bi = Math.floor(xx / bw), lx = xx % bw, ly = y % bh, key = row * 4 + bi;
    if (!(key in tone)) tone[key] = { v: r(), chip: r() < 0.6 ? [r() < 0.5 ? 0 : bw - mw - 1, r() < 0.5 ? 0 : bh - mw - 1] : null };
    if (ly >= bh - mw || lx >= bw - mw) { t.set(x, y, grad(mortarPal, 0.3 + 0.6 * nm(x, y))); return; }
    let c = grad(pal, clamp(tone[key].v * 0.55 + 0.1 + 0.35 * nz(x, y), 0, 1));
    if (ly < bv) c = shade(c, 1.18); else if (lx < bv) c = shade(c, 1.1); else if (ly >= bh - mw - bv) c = shade(c, 0.78); else if (lx >= bw - mw - bv) c = shade(c, 0.85);
    const ch = tone[key].chip; if (ch && Math.abs(lx - ch[0]) < 1.6 * K && Math.abs(ly - ch[1]) < 1.6 * K && nz(x, y) > 0.4) c = grad(mortarPal, 0.5);
    t.set(x, y, shade(c, 1 + (r() - 0.5) * 0.07));
  });
}
function paintOre(t, r, gem, kind) {
  paintStone(t, rng(SEED ^ hashStr('stone_a')));
  const clusters = 6 + (K >= 2 ? 1 : 0), diamond = kind === 'crystal' || kind === 'emerald';
  for (let b = 0; b < clusters; b++) {
    const cx = 4 * K + r() * (T - 8 * K), cy = 4 * K + r() * (T - 8 * K), n = 2 + ((r() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = r() * 1.6 * K, R = (0.9 + r() * 0.9) * K * (kind === 'coal' ? 1.1 : 1);
      lump(t, cx + Math.cos(a) * d, cy + Math.sin(a) * d, R, gem, { diamond, shadow: 0.55, tone: 0.5 + r() * 0.25, r });
    }
  }
}
function paintTallGrass(t, r) {
  const nb = Math.round(T * 0.4), blades = [];
  for (let b = 0; b < nb; b++) blades.push({ x: ((b + 0.5) / nb) * T * 0.9 + T * 0.05 + (r() - 0.5) * K, h: T * (0.32 + 0.6 * r()), lean: (r() - 0.5) * T * 0.4, back: r() < 0.4 });
  blades.sort((a, b) => (b.back ? 1 : 0) - (a.back ? 1 : 0)).reverse().sort((a, b) => (a.back ? 0 : 1) - (b.back ? 0 : 1));
  for (const bl of blades) {
    const w0 = Math.max(1.2, K * 0.95), steps = bl.h * 2.5;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps, x = bl.x + bl.lean * f * f, y = T - 1 - f * bl.h, w = w0 * (1 - f * 0.85) + 0.3;
      for (let px = -w / 2; px <= w / 2; px += 0.5) { const side = px / (w / 2 + 0.01); t.set(Math.round(x + px), Math.round(y), shade(grad(P.blade, 0.08 + 0.85 * f - 0.15 * side), bl.back ? 0.72 : 1)); }
    }
  }
}
function paintFlower(t, r, petal, center, petalCol) {
  const hx = T / 2 + (r() - 0.5) * T * 0.15, hy = T * 0.3, sw = Math.max(1, Math.round(K * 0.7));
  for (let s = 0; s <= T * 0.75; s++) { const f = s / (T * 0.75), x = T / 2 + (hx - T / 2) * f * f, y = T - 1 - f * (T - 1 - hy); for (let w = 0; w < sw; w++) t.set(Math.round(x + w), Math.round(y), grad(P.blade, 0.15 + 0.35 * f - 0.1 * w)); }
  drawLeaf(t, T * 0.36, T * 0.78, T * 0.3, T * 0.13, -0.5, P.blade, 0.5, r); drawLeaf(t, T * 0.64, T * 0.66, T * 0.26, T * 0.12, 0.6, P.blade, 0.4, r);
  const pn = 6, pl = T * 0.24;
  for (let i = 0; i < pn; i++) { const a = (i / pn) * TAU + 0.3; drawLeaf(t, hx + Math.cos(a) * pl * 0.5, hy + Math.sin(a) * pl * 0.5, pl, pl * 0.62, a, petalCol, 0.45 + r() * 0.3, r); }
  lump(t, hx, hy, T * 0.075, center, { shadow: 1, tone: 0.55, r });
}
function paintCactusSide(t, r) {
  paintField(t, field((x) => 0.15 + 0.7 * (Math.sin(TAU * (x + 0.5) / (T / 4)) * 0.5 + 0.5)), P.cactus, { k: 2.2, jit: 0.03, r });
  for (let rib = 0; rib < 4; rib++) for (let y = T * 0.12; y < T; y += T / 5) { const x = Math.round((rib + 0.25) * T / 4), sp = stops(['#8a7a4a', '#d9d1a4', '#fbf6dc']); t.set(x, Math.round(y), sp[2]); t.set(x + 1, Math.round(y) + 1, sp[0]); t.set(x - 1, Math.round(y) - 1, sp[1]); }
}
function paintCactusTop(t, r) {
  const c0 = T / 2 - 0.5, bw = Math.max(1, Math.round(K));
  t.each((x, y) => {
    const dx = x - c0, dy = y - c0, ch = Math.max(Math.abs(dx), Math.abs(dy)), a = Math.atan2(dy, dx), rib = 0.5 + 0.5 * Math.sin(a * 8);
    let c = grad(P.cactus, 0.2 + 0.5 * rib + 0.1 * (1 - Math.hypot(dx, dy) / c0));
    if (ch >= c0 + 0.5 - bw) c = shade(P.cactus[0], 0.9 + 0.2 * rib); t.set(x, y, shade(c, 1 + (r() - 0.5) * 0.06));
  });
  lump(t, c0, c0, T * 0.09, stops(['#8a7a4a', '#d9d1a4', '#fbf6dc']), { shadow: 0.8, tone: 0.5, r });
}
function crackPath(r) {
  const pts = [];
  for (let b = 0; b < 5; b++) {
    let x = T / 2 + (r() - 0.5) * 3 * K, y = T / 2 + (r() - 0.5) * 3 * K, a = (b / 5) * TAU + r();
    for (let i = 0; i < 9 * K; i++) { pts.push({ x, y, o: i + r() * 1.5 }); a += (r() - 0.5) * 1.0; x += Math.cos(a); y += Math.sin(a); if (r() < 0.08 && i > 3) { let bx = x, by = y, ba = a + (r() < 0.5 ? 1 : -1) * 0.9; for (let j = 0; j < 4 * K; j++) { pts.push({ x: bx, y: by, o: i + j + 2 }); bx += Math.cos(ba); by += Math.sin(ba); ba += (r() - 0.5) * 0.7; } } }
  }
  return pts.sort((a, b) => a.o - b.o);
}

/* ───────────── Additional Minecraft Block Painters ───────────── */
function paintBedrock(t, r) {
  const n = fbm(r, { base: 4, oct: 4 });
  paintField(t, field((x, y) => stretch(n(x, y), 2.4)), P.bedrock, { k: 2.8, jit: 0.08, r });
}
function paintObsidian(t, r) {
  const V = voronoi(r, 4), nz = fbm(r, { base: 3, oct: 4 });
  paintField(t, field((x, y) => clamp(0.2 + 0.6 * nz(x, y) + 0.25 * (1 - V(x, y).d1 / (T / 4)), 0, 1)), P.obsidian, { k: 2.5, jit: 0.04, r });
}
function paintGlowstone(t, r) {
  paintCells(t, r, 4, { colors: P.glowstone, mortarW: Math.max(1, K * 0.7), mortarCol: stops(['#3b1e04', '#5c3208']), dome: 0.4, k: 2.2 });
}
function paintCraftingTop(t, r) {
  paintPlanks(t, r, P.oakPlank);
  const m = Math.round(T * 0.16), gEnd = T - m;
  for (let y = m; y < gEnd; y++) for (let x = m; x < gEnd; x++) {
    const gx = Math.floor(((x - m) / (gEnd - m)) * 3), gy = Math.floor(((y - m) / (gEnd - m)) * 3);
    const edge = ((x - m) % Math.floor((gEnd - m) / 3) === 0) || ((y - m) % Math.floor((gEnd - m) / 3) === 0) || x === m || y === m || x === gEnd - 1 || y === gEnd - 1;
    t.set(x, y, edge ? hex('#2f1c0c') : shade(P.oakWood[(gx + gy) % 3 + 1], 0.95));
  }
}
function paintCraftingSide(t, r) {
  paintPlanks(t, r, P.oakPlank);
  for (let x = 0; x < T; x++) for (let y = 0; y < Math.round(T * 0.28); y++) {
    t.set(x, y, y > T * 0.22 ? hex('#3b2210') : grad(stops(['#7d221c', '#a32e26', '#c24036']), (x % 8) / 8));
  }
  for (let y = Math.round(T * 0.38); y < Math.round(T * 0.78); y++) for (let x = Math.round(T * 0.28); x < Math.round(T * 0.46); x++) {
    t.set(x, y, hex('#757c88'));
  }
}
function paintFurnaceFront(t, r) {
  paintCobble(t, r);
  const cx = T / 2;
  for (let y = Math.round(T * 0.22); y < Math.round(T * 0.88); y++) for (let x = Math.round(T * 0.22); x < Math.round(T * 0.78); x++) {
    const arch = Math.hypot(x - cx, Math.max(0, (T * 0.45) - y)) < T * 0.26;
    if (arch || y >= T * 0.45) {
      const fire = y > T * 0.66 ? grad(P.lava, 0.5 + 0.4 * r()) : hex('#141418');
      t.set(x, y, fire);
    }
  }
}
function paintTntSide(t, r) {
  t.each((x, y) => {
    const stick = Math.floor(x / (T / 4));
    const red = grad(stops(['#851812', '#b3241b', '#d93429', '#ed4c40']), 0.3 + 0.5 * Math.sin(((x % (T / 4)) / (T / 4)) * Math.PI));
    if (y >= T * 0.36 && y < T * 0.64) {
      const band = (y === Math.round(T * 0.36) || y === Math.round(T * 0.63)) ? hex('#262220') : hex('#f2efe9');
      t.set(x, y, band);
    } else {
      t.set(x, y, shade(red, stick % 2 === 0 ? 1.0 : 0.92));
    }
  });
  void r;
}
function paintTntTop(t, r) {
  t.each((x, y) => {
    const sx = Math.floor(x / (T / 4)), sy = Math.floor(y / (T / 4));
    t.set(x, y, (sx + sy) % 2 === 0 ? hex('#c92c20') : hex('#a12016'));
  });
  lump(t, T / 2, T / 2, T * 0.14, stops(['#1a1817', '#45403c', '#e6ded5']), { r });
}
function paintBookshelfSide(t, r) {
  paintPlanks(t, r, P.oakPlank);
  const bookCols = [hex('#b0251e'), hex('#216e39'), hex('#224b8f'), hex('#b8861b'), hex('#6c2785'), hex('#207878')];
  for (const shelfY of [Math.round(T * 0.14), Math.round(T * 0.54)]) {
    let bx = Math.round(T * 0.08);
    while (bx < T * 0.9) {
      const bw = Math.max(2, Math.round(K * (1.4 + r() * 1.1)));
      const bh = Math.round(T * (0.28 + r() * 0.06));
      const col = bookCols[Math.floor(r() * bookCols.length)];
      for (let y = shelfY + (Math.round(T * 0.34) - bh); y < shelfY + Math.round(T * 0.34); y++) {
        for (let x = bx; x < Math.min(Math.round(T * 0.92), bx + bw); x++) {
          t.set(x, y, x === bx ? shade(col, 1.18) : x === bx + bw - 1 ? shade(col, 0.72) : col);
        }
      }
      bx += bw;
    }
  }
}
function paintStoneBricks(t, r) {
  paintBricks(t, r, P.stone, stops(['#2b2d33', '#3b3e46', '#4c5059']));
}
function paintSandstoneSide(t, r) {
  const n = fbm(r, { base: 2, oct: 3 });
  t.each((x, y) => {
    const band = Math.sin((y / T) * TAU * 2.5 + n(x, y) * 0.8) * 0.5 + 0.5;
    t.set(x, y, grad(P.sand, 0.2 + 0.7 * band));
  });
}
function paintPumpkinSide(t, r) {
  paintField(t, field((x) => 0.25 + 0.65 * (Math.sin(TAU * x / (T / 4)) * 0.5 + 0.5)), P.pumpkin, { k: 2.0, jit: 0.04, r });
}
function paintPumpkinTop(t, r) {
  const c0 = T / 2 - 0.5;
  t.each((x, y) => {
    const a = Math.atan2(y - c0, x - c0), rib = 0.5 + 0.5 * Math.sin(a * 8);
    t.set(x, y, grad(P.pumpkin, 0.25 + 0.65 * rib));
  });
  lump(t, c0, c0, T * 0.12, P.oakBark, { r });
}
function paintMelonSide(t, r) {
  paintField(t, field((x) => 0.2 + 0.7 * (Math.sin(TAU * x / (T / 5)) * 0.5 + 0.5)), P.melon, { k: 1.8, jit: 0.04, r });
}

/* ───────────── registry (order = atlas order) ───────────── */
const tiles = [];
const def = (name, fn) => { const t = new Tile(); fn(t, rng(SEED ^ hashStr(name))); tiles.push({ name, t }); };

// Original 54 tiles (indices 0..53)
['a', 'b', 'c'].forEach(s => def('grass_top_' + s, paintGrass));
def('grass_side', (t, r) => paintCoverSide(t, r, paintGrass, 'grass_top_a', P.blade));
['a', 'b', 'c'].forEach(s => def('dirt_' + s, paintDirt));
['a', 'b', 'c'].forEach(s => def('stone_' + s, paintStone));
def('cobble', paintCobble);
['a', 'b'].forEach(s => def('sand_' + s, paintSand));
def('gravel', paintGravel);
def('snow', paintSnow);
def('snow_side', (t, r) => paintCoverSide(t, r, paintSnow, 'snow', P.snow));
def('ice', paintIce);
def('log_oak_side', (t, r) => paintBarkSide(t, r, P.oakBark));
def('log_oak_top', (t, r) => paintLogTop(t, r, P.oakBark, P.oakWood));
def('log_birch_side', (t, r) => paintBarkSide(t, r, P.birchBark, { ridge: 0.35, marks: true }));
def('log_birch_top', (t, r) => paintLogTop(t, r, P.birchBark, P.birchWood, 0.85));
def('log_pine_side', (t, r) => paintBarkSide(t, r, P.pineBark, { ridge: 1.15 }));
def('log_pine_top', (t, r) => paintLogTop(t, r, P.pineBark, P.pineWood));
def('planks_oak', (t, r) => paintPlanks(t, r, P.oakPlank));
def('planks_birch', (t, r) => paintPlanks(t, r, P.birchPlank));
def('planks_pine', (t, r) => paintPlanks(t, r, P.pinePlank));
def('leaves_oak', (t, r) => paintLeaves(t, r, P.leafOak, 'blob'));
def('leaves_oak_b', (t, r) => paintLeaves(t, r, P.leafOak, 'blob'));
def('leaves_birch', (t, r) => paintLeaves(t, r, P.leafBirch, 'blob'));
def('leaves_pine', (t, r) => paintLeaves(t, r, P.leafPine, 'needle'));
def('water', paintWater);
def('lava', paintLava);
def('glass', paintGlass);
def('bricks', paintBricks);
def('ore_coal', (t, r) => paintOre(t, r, P.coal, 'coal'));
def('ore_iron', (t, r) => paintOre(t, r, P.iron, 'iron'));
def('ore_gold', (t, r) => paintOre(t, r, P.gold, 'gold'));
def('ore_crystal', (t, r) => paintOre(t, r, P.crystal, 'crystal'));
def('tall_grass', paintTallGrass);
def('flower_red', (t, r) => paintFlower(t, r, '#d43a3a', stops(['#8a5a08', '#d9a21a', '#ffd84a', '#fff0a0']), stops(['#7d1616', '#a82424', '#d13a3a', '#ec5c5c', '#f78a8a'])));
def('flower_yellow', (t, r) => paintFlower(t, r, '#f2c62e', stops(['#5a2a0c', '#8f4a14', '#c2691f', '#e08a3a']), stops(['#a8770a', '#d09b14', '#efc32c', '#f9dc5c', '#fff0a0'])));
def('flower_blue', (t, r) => paintFlower(t, r, '#4a6fe0', stops(['#b8b0a0', '#e0dccf', '#f6f3ea', '#ffffff']), stops(['#243c96', '#3454c4', '#4a6fe0', '#6f92f0', '#a0b8fa'])));
def('cactus_side', paintCactusSide);
def('cactus_top', paintCactusTop);
{
  const path0 = crackPath(rng(SEED ^ hashStr('crack')));
  for (let s = 0; s < 10; s++) def('crack_' + s, t => {
    const n = Math.ceil(path0.length * (s + 1) / 10), th = Math.max(1, Math.round((s > 6 ? 1.6 : 1) * K / 2));
    for (let i = 0; i < n; i++) { const p = path0[i]; for (let a = 0; a < th; a++) for (let b = 0; b < th; b++) t.set(Math.round(p.x) + a, Math.round(p.y) + b, [0, 0, 0], 215); t.set(Math.round(p.x) - 1, Math.round(p.y) - 1, [0, 0, 0], 90); }
  });
}

// Extended Minecraft Block Tiles (indices 54..69)
def('bedrock', paintBedrock);
def('obsidian', paintObsidian);
def('glowstone', paintGlowstone);
def('crafting_top', paintCraftingTop);
def('crafting_side', paintCraftingSide);
def('furnace_front', paintFurnaceFront);
def('tnt_top', paintTntTop);
def('tnt_side', paintTntSide);
def('bookshelf_side', paintBookshelfSide);
def('mossy_cobble', paintMossyCobble);
def('stone_bricks', paintStoneBricks);
def('sandstone_side', paintSandstoneSide);
def('ore_redstone', (t, r) => paintOre(t, r, P.redstone, 'redstone'));
def('ore_emerald', (t, r) => paintOre(t, r, P.emerald, 'emerald'));
def('pumpkin_top', paintPumpkinTop);
def('pumpkin_side', paintPumpkinSide);
def('melon_side', paintMelonSide);

if (tiles.length > COLS * COLS) throw new Error('Too many tiles for the atlas');

/* ───────────── atlas + JSON ───────────── */
const atlas = Buffer.alloc(ATLAS * ATLAS * 4), tileMap = {};
tiles.forEach(({ name, t }, i) => {
  const cx = (i % COLS) * T, cy = Math.floor(i / COLS) * T;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const s = (y * T + x) * 4, d = ((cy + y) * ATLAS + cx + x) * 4; atlas[d] = t.d[s]; atlas[d + 1] = t.d[s + 1]; atlas[d + 2] = t.d[s + 2]; atlas[d + 3] = t.d[s + 3]; }
  const e = 0.5 / ATLAS;
  tileMap[name] = { index: i, x: cx, y: cy, u0: cx / ATLAS + e, v0: 1 - (cy + T) / ATLAS + e, u1: (cx + T) / ATLAS - e, v1: 1 - cy / ATLAS - e };
});
const transparent = tiles.filter(({ t }) => { for (let i = 3; i < t.d.length; i += 4) if (t.d[i] < 255) return true; return false; }).map(x => x.name);
const all = n => ({ top: n, side: n, bottom: n });
const blocks = {
  grass: { top: 'grass_top_a', side: 'grass_side', bottom: 'dirt_a' }, dirt: all('dirt_a'), stone: all('stone_a'), cobble: all('cobble'),
  sand: all('sand_a'), gravel: all('gravel'), snow: all('snow'), snowy_grass: { top: 'snow', side: 'snow_side', bottom: 'dirt_a' },
  ice: all('ice'), glass: all('glass'), bricks: all('bricks'), water: all('water'), lava: all('lava'),
  oak_log: { top: 'log_oak_top', side: 'log_oak_side', bottom: 'log_oak_top' },
  birch_log: { top: 'log_birch_top', side: 'log_birch_side', bottom: 'log_birch_top' },
  pine_log: { top: 'log_pine_top', side: 'log_pine_side', bottom: 'log_pine_top' },
  oak_planks: all('planks_oak'), birch_planks: all('planks_birch'), pine_planks: all('planks_pine'),
  oak_leaves: all('leaves_oak'), birch_leaves: all('leaves_birch'), pine_leaves: all('leaves_pine'),
  coal_ore: all('ore_coal'), iron_ore: all('ore_iron'), gold_ore: all('ore_gold'), crystal_ore: all('ore_crystal'),
  redstone_ore: all('ore_redstone'), emerald_ore: all('ore_emerald'),
  cactus: { top: 'cactus_top', side: 'cactus_side', bottom: 'cactus_top' },
  bedrock: all('bedrock'), obsidian: all('obsidian'), glowstone: all('glowstone'),
  crafting_table: { top: 'crafting_top', side: 'crafting_side', bottom: 'planks_oak' },
  furnace: { top: 'stone_a', side: 'furnace_front', bottom: 'stone_a' },
  tnt: { top: 'tnt_top', side: 'tnt_side', bottom: 'tnt_top' },
  bookshelf: { top: 'planks_oak', side: 'bookshelf_side', bottom: 'planks_oak' },
  mossy_cobble: all('mossy_cobble'), stone_bricks: all('stone_bricks'),
  sandstone: { top: 'sand_a', side: 'sandstone_side', bottom: 'sand_a' },
  pumpkin: { top: 'pumpkin_top', side: 'pumpkin_side', bottom: 'pumpkin_top' },
  melon: { top: 'melon_side', side: 'melon_side', bottom: 'melon_side' },
  tall_grass: { cross: 'tall_grass' }, flower_red: { cross: 'flower_red' }, flower_yellow: { cross: 'flower_yellow' }, flower_blue: { cross: 'flower_blue' },
};
const variants = { grass_top: ['grass_top_a', 'grass_top_b', 'grass_top_c'], dirt: ['dirt_a', 'dirt_b', 'dirt_c'], stone: ['stone_a', 'stone_b', 'stone_c'], sand: ['sand_a', 'sand_b'], oak_leaves: ['leaves_oak', 'leaves_oak_b'] };
const json = {
  note: 'Generated by tools/generate-textures.js. Use NearestFilter (crisp) or LinearFilter (soft), no mipmaps, colorSpace = SRGBColorSpace. UV origin is bottom-left (Three.js).',
  tileSize: T, atlasSize: ATLAS, columns: COLS, seed: SEED,
  tiles: tileMap, blocks, variants, cracks: Array.from({ length: 10 }, (_, i) => 'crack_' + i), transparentTiles: transparent,
  renderHints: { alphaTestTiles: transparent.filter(n => n.startsWith('leaves') || ['tall_grass', 'flower_red', 'flower_yellow', 'flower_blue'].includes(n)), blendedTiles: ['water', 'glass', 'ice'] },
};

/* ───────────── PNG writer (no dependencies) ───────────── */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function preview(scale) {
  const W = ATLAS * scale, out = Buffer.alloc(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const s = (Math.floor(y / scale) * ATLAS + Math.floor(x / scale)) * 4, a = atlas[s + 3] / 255, bg = ((x >> 4) + (y >> 4)) & 1 ? 58 : 44, d = (y * W + x) * 4;
    out[d] = atlas[s] * a + bg * (1 - a); out[d + 1] = atlas[s + 1] * a + bg * (1 - a); out[d + 2] = atlas[s + 2] * a + bg * (1 - a); out[d + 3] = 255;
  }
  return encodePNG(W, W, out);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'atlas.png'), encodePNG(ATLAS, ATLAS, atlas));
fs.writeFileSync(path.join(OUT, 'atlas.json'), JSON.stringify(json, null, 2));
fs.writeFileSync(path.join(OUT, 'atlas_preview.png'), preview(Math.max(1, Math.floor(1024 / ATLAS))));
console.log(`OK  ${tiles.length} tiles @ ${T}px -> ${OUT}/atlas.png (${ATLAS}x${ATLAS}) + atlas.json + atlas_preview.png  seed=${SEED} leafHoles=${LEAF_HOLES}`);

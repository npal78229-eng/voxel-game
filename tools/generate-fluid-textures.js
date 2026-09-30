import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRAME_W = 32;
const FRAME_H = 32;
const NUM_FRAMES = 16;
const STRIP_W = FRAME_W;
const STRIP_H = FRAME_H * NUM_FRAMES; // 512

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColor(c1, c2, t) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

function samplePalette(palette, t) {
  const clamped = Math.max(0, Math.min(0.9999, t));
  const scaled = clamped * (palette.length - 1);
  const idx = Math.floor(scaled);
  const frac = scaled - idx;
  return lerpColor(palette[idx], palette[idx + 1], frac);
}

// Pure Node PNG Encoder
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const tBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([tBuf, data])), 0);
    return Buffer.concat([len, tBuf, data, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 1. Water Palettes
const WATER_PAL = [
  hexToRgb('#1e40af'),
  hexToRgb('#1d4ed8'),
  hexToRgb('#2563eb'),
  hexToRgb('#3b82f6'),
  hexToRgb('#60a5fa'),
  hexToRgb('#93c5fd'),
];

// 2. Lava Palettes
const LAVA_PAL = [
  hexToRgb('#7c2d12'),
  hexToRgb('#9a3412'),
  hexToRgb('#c2410c'),
  hexToRgb('#ea580c'),
  hexToRgb('#f97316'),
  hexToRgb('#fbbf24'),
  hexToRgb('#fef08a'),
];

function generateStrip(generatorFn, isTransparent = false) {
  const buf = Buffer.alloc(STRIP_W * STRIP_H * 4);
  for (let frame = 0; frame < NUM_FRAMES; frame++) {
    const phase = (frame / NUM_FRAMES) * Math.PI * 2;
    const yOffset = frame * FRAME_H;
    for (let y = 0; y < FRAME_H; y++) {
      for (let x = 0; x < FRAME_W; x++) {
        const { rgb, alpha } = generatorFn(x, y, phase, frame);
        const idx = ((yOffset + y) * STRIP_W + x) * 4;
        buf[idx + 0] = rgb[0];
        buf[idx + 1] = rgb[1];
        buf[idx + 2] = rgb[2];
        buf[idx + 3] = isTransparent ? (alpha !== undefined ? alpha : 210) : 255;
      }
    }
  }
  return encodePNG(STRIP_W, STRIP_H, buf);
}

// water_still generator: gentle calm ripples
function genWaterStill(x, y, phase) {
  const nx = x / FRAME_W;
  const ny = y / FRAME_H;
  const wave1 = Math.sin(nx * Math.PI * 4 + phase);
  const wave2 = Math.cos(ny * Math.PI * 4 - phase * 0.8);
  const wave3 = Math.sin((nx + ny) * Math.PI * 3 + phase * 1.2);
  const val = (wave1 * 0.4 + wave2 * 0.35 + wave3 * 0.25 + 1.0) * 0.5;
  const rgb = samplePalette(WATER_PAL, val);
  const alpha = 200 + Math.floor(val * 40);
  return { rgb, alpha };
}

// water_flow generator: downward churning current
function genWaterFlow(x, y, phase) {
  const nx = x / FRAME_W;
  const ny = y / FRAME_H;
  const stream1 = Math.sin(nx * Math.PI * 4 + (ny * Math.PI * 8 - phase * 2));
  const stream2 = Math.cos(nx * Math.PI * 2 - (ny * Math.PI * 6 - phase * 1.5));
  const foam = Math.sin(nx * Math.PI * 8 + ny * Math.PI * 4 + phase);
  const val = (stream1 * 0.45 + stream2 * 0.35 + foam * 0.2 + 1.0) * 0.5;
  const rgb = samplePalette(WATER_PAL, val);
  const alpha = 210 + Math.floor(val * 40);
  return { rgb, alpha };
}

// lava_still generator: slowly bubbling molten magma crust
function genLavaStill(x, y, phase) {
  const nx = x / FRAME_W;
  const ny = y / FRAME_H;
  const magma1 = Math.sin(nx * Math.PI * 3 + Math.cos(ny * Math.PI * 3 + phase));
  const magma2 = Math.cos(ny * Math.PI * 3 + phase * 0.7);
  const glow = Math.sin((nx - ny) * Math.PI * 4 + phase);
  const val = (magma1 * 0.4 + magma2 * 0.4 + glow * 0.2 + 1.0) * 0.5;
  const rgb = samplePalette(LAVA_PAL, val);
  return { rgb, alpha: 255 };
}

// lava_flow generator: surging fiery molten rivers
function genLavaFlow(x, y, phase) {
  const nx = x / FRAME_W;
  const ny = y / FRAME_H;
  const surge = Math.sin((ny * Math.PI * 8 - phase * 2) + Math.sin(nx * Math.PI * 4));
  const eddy = Math.cos(nx * Math.PI * 4 - phase);
  const pulse = Math.sin(nx * Math.PI * 6 + ny * Math.PI * 6 + phase * 1.5);
  const val = (surge * 0.5 + eddy * 0.3 + pulse * 0.2 + 1.0) * 0.5;
  const rgb = samplePalette(LAVA_PAL, val);
  return { rgb, alpha: 255 };
}

const outDir = path.resolve(__dirname, '../public/assets/blocks');
fs.mkdirSync(outDir, { recursive: true });

console.log('Generating 16-frame 32x512 animated fluid textures...');

fs.writeFileSync(path.join(outDir, 'water_still.png'), generateStrip(genWaterStill, true));
console.log(' Created water_still.png (32x512, 16 frames)');

fs.writeFileSync(path.join(outDir, 'water_flow.png'), generateStrip(genWaterFlow, true));
console.log(' Created water_flow.png (32x512, 16 frames)');

fs.writeFileSync(path.join(outDir, 'lava_still.png'), generateStrip(genLavaStill, false));
console.log(' Created lava_still.png (32x512, 16 frames)');

fs.writeFileSync(path.join(outDir, 'lava_flow.png'), generateStrip(genLavaFlow, false));
console.log(' Created lava_flow.png (32x512, 16 frames)');

console.log('All 4 animated fluid strips generated successfully!');

import * as THREE from 'three';

// ============================================================================
// Phases U2, U3 & U6.3 — Original Block Registry, Per-Face Colors & Isometric Icons
// ============================================================================

export const BLOCK_DEFINITIONS = [
  {
    id: 'grass',
    name: 'Turf Block',
    key: 1,
    colorHex: '#58b947',
    sideHex: '#8b5a2b',
    bottomHex: '#6e4720',
    color: new THREE.Color('#58b947'),
    hardness: 0.6,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'dirt',
    name: 'Loam Soil',
    key: 2,
    colorHex: '#8b5a2b',
    sideHex: '#754920',
    bottomHex: '#633d1a',
    color: new THREE.Color('#9c6631'),
    hardness: 0.5,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'stone',
    name: 'Grey Slate',
    key: 3,
    colorHex: '#949ca3',
    sideHex: '#7b8288',
    bottomHex: '#656b70',
    color: new THREE.Color('#9ea7b0'),
    hardness: 1.2,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'cobblestone',
    name: 'Rubble Stone',
    key: 4,
    colorHex: '#6e767d',
    sideHex: '#575e64',
    bottomHex: '#474d52',
    color: new THREE.Color('#778088'),
    hardness: 1.4,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'wood',
    name: 'Timber Log',
    key: 5,
    colorHex: '#b88a52',
    sideHex: '#6b4724',
    bottomHex: '#b88a52',
    color: new THREE.Color('#9e6c3a'),
    hardness: 1.0,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'planks',
    name: 'Hewn Planks',
    key: 6,
    colorHex: '#c99e67',
    sideHex: '#ad8452',
    bottomHex: '#946f42',
    color: new THREE.Color('#d4a96e'),
    hardness: 0.9,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'brick',
    name: 'Kiln Bricks',
    key: 7,
    colorHex: '#b84a39',
    sideHex: '#963829',
    bottomHex: '#7d2d20',
    color: new THREE.Color('#c95644'),
    hardness: 1.5,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'sand',
    name: 'Dune Sand',
    key: 8,
    colorHex: '#e6d285',
    sideHex: '#cbb86d',
    bottomHex: '#b5a259',
    color: new THREE.Color('#ede098'),
    hardness: 0.45,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'torch',
    name: 'Sunstone Lamp',
    key: 9,
    colorHex: '#fde047',
    sideHex: '#f59e0b',
    bottomHex: '#b45309',
    color: new THREE.Color('#fde047'),
    hardness: 0.2,
    transparent: false,
    lightLevel: 14,
  },
  // Extended U2 & U3 World Biomes / Ores / Liquids Blocks
  {
    id: 'snow',
    name: 'Frost Turf',
    key: 0,
    colorHex: '#f8fafc',
    sideHex: '#cbd5e1',
    bottomHex: '#8b5a2b',
    color: new THREE.Color('#f1f5f9'),
    hardness: 0.5,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'ice',
    name: 'Glacier Ice',
    key: 0,
    colorHex: '#93c5fd',
    sideHex: '#60a5fa',
    bottomHex: '#3b82f6',
    color: new THREE.Color('#93c5fd'),
    hardness: 0.6,
    transparent: true,
    lightLevel: 0,
  },
  {
    id: 'water',
    name: 'Clear Water',
    key: 0,
    colorHex: '#38bdf8',
    sideHex: '#0284c7',
    bottomHex: '#0369a1',
    color: new THREE.Color('#0ea5e9'),
    hardness: 999,
    transparent: true,
    lightLevel: 0,
  },
  {
    id: 'glass',
    name: 'Silica Glass',
    key: 0,
    colorHex: '#e0f2fe',
    sideHex: '#bae6fd',
    bottomHex: '#7dd3fc',
    color: new THREE.Color('#e0f2fe'),
    hardness: 0.3,
    transparent: true,
    lightLevel: 0,
  },
  {
    id: 'leaves',
    name: 'Canopy Foliage',
    key: 0,
    colorHex: '#3b8c32',
    sideHex: '#2d6e26',
    bottomHex: '#22541d',
    color: new THREE.Color('#429e38'),
    hardness: 0.25,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'birch_wood',
    name: 'Silver Bark Log',
    key: 0,
    colorHex: '#e2e8f0',
    sideHex: '#cbd5e1',
    bottomHex: '#94a3b8',
    color: new THREE.Color('#e2e8f0'),
    hardness: 1.0,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'coal_ore',
    name: 'Carbon Seam Ore',
    key: 0,
    colorHex: '#475569',
    sideHex: '#334155',
    bottomHex: '#1e293b',
    color: new THREE.Color('#475569'),
    hardness: 1.6,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'iron_ore',
    name: 'Ferric Vein Ore',
    key: 0,
    colorHex: '#d6b498',
    sideHex: '#b08968',
    bottomHex: '#7f5539',
    color: new THREE.Color('#d6b498'),
    hardness: 1.8,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'gold_ore',
    name: 'Auric Vein Ore',
    key: 0,
    colorHex: '#facc15',
    sideHex: '#eab308',
    bottomHex: '#ca8a04',
    color: new THREE.Color('#facc15'),
    hardness: 2.0,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'gem_ore',
    name: 'Azure Crystal Ore',
    key: 0,
    colorHex: '#22d3ee',
    sideHex: '#06b6d4',
    bottomHex: '#0891b2',
    color: new THREE.Color('#22d3ee'),
    hardness: 2.4,
    transparent: false,
    lightLevel: 4,
  },
  {
    id: 'lava',
    name: 'Molten Magma',
    key: 0,
    colorHex: '#fb923c',
    sideHex: '#ea580c',
    bottomHex: '#c2410c',
    color: new THREE.Color('#f97316'),
    hardness: 999,
    transparent: false,
    lightLevel: 15,
  },
  {
    id: 'bedrock',
    name: 'Basalt Core',
    key: 0,
    colorHex: '#1e293b',
    sideHex: '#0f172a',
    bottomHex: '#020617',
    color: new THREE.Color('#1e293b'),
    hardness: Infinity,
    transparent: false,
    lightLevel: 0,
  },
];

export const BLOCK_BY_ID = Object.fromEntries(
  BLOCK_DEFINITIONS.map((block) => [block.id, block])
);

const iconCache = new Map();

/**
 * Phase U6.3 — Renders an isometric 3D cube icon onto an offscreen canvas
 * using the block's top, sunlit left, and shaded right face colors/patterns,
 * cached as a data URL for crisp pixel-art display in Hotbar & Inventory UI.
 */
export function getBlockIconDataURL(blockId) {
  if (iconCache.has(blockId)) {
    return iconCache.get(blockId);
  }

  const block = BLOCK_BY_ID[blockId] || BLOCK_DEFINITIONS[0];
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const cx = size / 2;
  const cy = size / 2;
  const r = 18;
  const dy = 10;

  // 1. Top Diamond Face (+Y)
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy - r + dy);
  ctx.lineTo(cx, cy - r + dy * 2);
  ctx.lineTo(cx - r, cy - r + dy);
  ctx.closePath();
  ctx.fillStyle = block.colorHex;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 2. Left Face (-X/+Z sunlit side)
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - r + dy);
  ctx.lineTo(cx, cy - r + dy * 2);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy + r - dy);
  ctx.closePath();
  ctx.fillStyle = block.sideHex;
  ctx.fill();
  ctx.stroke();

  // 3. Right Face (+X/-Z shaded side)
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + dy * 2);
  ctx.lineTo(cx + r, cy - r + dy);
  ctx.lineTo(cx + r, cy + r - dy);
  ctx.lineTo(cx, cy + r);
  ctx.closePath();
  ctx.fillStyle = block.bottomHex || block.sideHex;
  ctx.fill();
  ctx.stroke();

  const url = canvas.toDataURL();
  iconCache.set(blockId, url);
  return url;
}

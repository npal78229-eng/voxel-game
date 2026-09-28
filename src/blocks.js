import * as THREE from 'three';

// ============================================================================
// Phase 2 — Block Registry & Palette (Hotbar Slots 1–9)
// ============================================================================

export const BLOCK_DEFINITIONS = [
  {
    id: 'grass',
    name: 'Grass Block',
    key: 1,
    colorHex: '#58b947',
    sideHex: '#8b5a2b',
    color: new THREE.Color('#58b947'),
  },
  {
    id: 'dirt',
    name: 'Dirt',
    key: 2,
    colorHex: '#8b5a2b',
    sideHex: '#734820',
    color: new THREE.Color('#9c6631'),
  },
  {
    id: 'stone',
    name: 'Stone',
    key: 3,
    colorHex: '#949ca3',
    sideHex: '#7b8288',
    color: new THREE.Color('#9ea7b0'),
  },
  {
    id: 'cobblestone',
    name: 'Cobblestone',
    key: 4,
    colorHex: '#6e767d',
    sideHex: '#575e64',
    color: new THREE.Color('#778088'),
  },
  {
    id: 'wood',
    name: 'Oak Log',
    key: 5,
    colorHex: '#8f6234',
    sideHex: '#6b4724',
    color: new THREE.Color('#9e6c3a'),
  },
  {
    id: 'planks',
    name: 'Oak Planks',
    key: 6,
    colorHex: '#c99e67',
    sideHex: '#ad8452',
    color: new THREE.Color('#d4a96e'),
  },
  {
    id: 'brick',
    name: 'Clay Bricks',
    key: 7,
    colorHex: '#b84a39',
    sideHex: '#963829',
    color: new THREE.Color('#c95644'),
  },
  {
    id: 'sand',
    name: 'Sand',
    key: 8,
    colorHex: '#e6d285',
    sideHex: '#cbb86d',
    color: new THREE.Color('#ede098'),
  },
  {
    id: 'leaves',
    name: 'Oak Leaves',
    key: 9,
    colorHex: '#3b8c32',
    sideHex: '#2d6e26',
    color: new THREE.Color('#429e38'),
  },
];

export const BLOCK_BY_ID = Object.fromEntries(
  BLOCK_DEFINITIONS.map((block) => [block.id, block])
);

import * as THREE from 'three';

// ============================================================================
// Minecraft-Style Fluid Quad Mesher (src/fluids/FluidMesher.js)
// Builds variable-height, smooth corner-averaged quad meshes for Water & Lava.
// - Surface height = (8 - level) / 9.0 (level 0 source ≈ 0.888, level 7 ≈ 0.111)
// - Submerged / fluid above = 1.0
// - Corner height averaging across 4 meeting voxel columns for smooth slopes
// - Culls internal faces between same-fluid blocks at equal height
// - Seamless vertex alignment across chunk borders
// ============================================================================

export function getFluidCornerHeight(world, cx, cy, cz, fluidType) {
  let sumHeight = 0;
  let count = 0;
  let hasFluidAbove = false;

  // 4 columns meeting at corner (cx, cz):
  // [cx - 1, cz - 1], [cx, cz - 1], [cx - 1, cz], [cx, cz]
  const cols = [
    [cx - 1, cz - 1],
    [cx, cz - 1],
    [cx - 1, cz],
    [cx, cz],
  ];

  for (const [colX, colZ] of cols) {
    // If any column has fluid above, this corner is fully submerged -> 1.0
    const aboveFluid = world.getFluid(colX, cy + 1, colZ);
    if (aboveFluid && aboveFluid.type === fluidType) {
      hasFluidAbove = true;
      break;
    }

    const f = world.getFluid(colX, cy, colZ);
    if (f && f.type === fluidType) {
      const h = f.falling ? 1.0 : (8.0 - Math.min(f.level, 7)) / 9.0;
      sumHeight += h;
      count++;
    }
  }

  if (hasFluidAbove) return 1.0;
  if (count === 0) return 8.0 / 9.0;
  return sumHeight / count;
}

export function buildFluidGeometry(chunk, fluidType, world) {
  const positions = [];
  const normals = [];
  const uvs = [];

  const addQuad = (v0, v1, v2, v3, norm, uv0 = [0, 0], uv1 = [0, 1], uv2 = [1, 1], uv3 = [1, 0]) => {
    // Triangle 1: v0, v1, v2
    positions.push(...v0, ...v1, ...v2);
    normals.push(...norm, ...norm, ...norm);
    uvs.push(...uv0, ...uv1, ...uv2);

    // Triangle 2: v0, v2, v3
    positions.push(...v0, ...v2, ...v3);
    normals.push(...norm, ...norm, ...norm);
    uvs.push(...uv0, ...uv2, ...uv3);
  };

  const startX = chunk.startX;
  const startZ = chunk.startZ;
  const chunkSize = chunk.chunkSize || 16;

  // Gather all fluid blocks belonging to this chunk
  const fluidCoords = [];

  // Check chunk blocks and chunk fluids
  if (chunk.fluids) {
    for (const [key, f] of chunk.fluids.entries()) {
      if (f.type === fluidType) {
        const [wx, wy, wz] = key.split(',').map(Number);
        fluidCoords.push({ wx, wy, wz, fluid: f });
      }
    }
  }

  // Also check blocks in chunk for natural settled fluids
  for (const [key, blockType] of chunk.blocks.entries()) {
    if (blockType === fluidType) {
      const [wx, wy, wz] = key.split(',').map(Number);
      // Avoid duplicate if already in chunk.fluids
      const already = chunk.fluids && chunk.fluids.has(key);
      if (!already) {
        const f = world.getFluid(wx, wy, wz) || { type: fluidType, level: 0, falling: false };
        fluidCoords.push({ wx, wy, wz, fluid: f });
      }
    }
  }

  if (fluidCoords.length === 0) return null;

  for (const { wx, wy, wz, fluid } of fluidCoords) {
    // 1. Calculate 4 corner heights for the top face
    const hNW = getFluidCornerHeight(world, wx, wy, wz, fluidType);
    const hNE = getFluidCornerHeight(world, wx + 1, wy, wz, fluidType);
    const hSE = getFluidCornerHeight(world, wx + 1, wy, wz + 1, fluidType);
    const hSW = getFluidCornerHeight(world, wx, wy, wz + 1, fluidType);

    const yNW = wy + hNW;
    const yNE = wy + hNE;
    const ySE = wy + hSE;
    const ySW = wy + hSW;

    // TOP FACE: Draw if block directly above is not the same fluid
    const aboveFluid = world.getFluid(wx, wy + 1, wz);
    if (!aboveFluid || aboveFluid.type !== fluidType) {
      addQuad(
        [wx, yNW, wz],
        [wx, ySW, wz + 1],
        [wx + 1, ySE, wz + 1],
        [wx + 1, yNE, wz],
        [0, 1, 0],
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0]
      );
    }

    // BOTTOM FACE: Draw if block below is not fluid and not solid
    const belowFluid = world.getFluid(wx, wy - 1, wz);
    const belowSolid = world.isSolidAt(wx, wy - 1, wz);
    if (!belowSolid && (!belowFluid || belowFluid.type !== fluidType)) {
      addQuad(
        [wx, wy, wz + 1],
        [wx, wy, wz],
        [wx + 1, wy, wz],
        [wx + 1, wy, wz + 1],
        [0, -1, 0],
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0]
      );
    }

    // SIDE FACES (+Z, -Z, +X, -X)
    // Face +Z (South)
    {
      const nFluid = world.getFluid(wx, wy, wz + 1);
      const nSolid = world.isSolidAt(wx, wy, wz + 1);
      if (!nSolid) {
        if (!nFluid || nFluid.type !== fluidType) {
          // Neighbor has no fluid: draw full wall from top corners down to wy
          addQuad(
            [wx, ySW, wz + 1],
            [wx, wy, wz + 1],
            [wx + 1, wy, wz + 1],
            [wx + 1, ySE, wz + 1],
            [0, 0, 1]
          );
        } else {
          // Neighbor has same fluid: check if neighbor's top is lower
          const nhW = getFluidCornerHeight(world, wx, wy, wz + 1, fluidType);
          const nhE = getFluidCornerHeight(world, wx + 1, wy, wz + 1, fluidType);
          if (ySW > wy + nhW || ySE > wy + nhE) {
            addQuad(
              [wx, ySW, wz + 1],
              [wx, wy + nhW, wz + 1],
              [wx + 1, wy + nhE, wz + 1],
              [wx + 1, ySE, wz + 1],
              [0, 0, 1]
            );
          }
        }
      }
    }

    // Face -Z (North)
    {
      const nFluid = world.getFluid(wx, wy, wz - 1);
      const nSolid = world.isSolidAt(wx, wy, wz - 1);
      if (!nSolid) {
        if (!nFluid || nFluid.type !== fluidType) {
          addQuad(
            [wx + 1, yNE, wz],
            [wx + 1, wy, wz],
            [wx, wy, wz],
            [wx, yNW, wz],
            [0, 0, -1]
          );
        } else {
          const nhW = getFluidCornerHeight(world, wx, wy, wz, fluidType);
          const nhE = getFluidCornerHeight(world, wx + 1, wy, wz, fluidType);
          if (yNE > wy + nhE || yNW > wy + nhW) {
            addQuad(
              [wx + 1, yNE, wz],
              [wx + 1, wy + nhE, wz],
              [wx, wy + nhW, wz],
              [wx, yNW, wz],
              [0, 0, -1]
            );
          }
        }
      }
    }

    // Face +X (East)
    {
      const nFluid = world.getFluid(wx + 1, wy, wz);
      const nSolid = world.isSolidAt(wx + 1, wy, wz);
      if (!nSolid) {
        if (!nFluid || nFluid.type !== fluidType) {
          addQuad(
            [wx + 1, yNE, wz],
            [wx + 1, ySE, wz + 1],
            [wx + 1, wy, wz + 1],
            [wx + 1, wy, wz],
            [1, 0, 0]
          );
        } else {
          const nhN = getFluidCornerHeight(world, wx + 1, wy, wz, fluidType);
          const nhS = getFluidCornerHeight(world, wx + 1, wy, wz + 1, fluidType);
          if (yNE > wy + nhN || ySE > wy + nhS) {
            addQuad(
              [wx + 1, yNE, wz],
              [wx + 1, ySE, wz + 1],
              [wx + 1, wy + nhS, wz + 1],
              [wx + 1, wy + nhN, wz],
              [1, 0, 0]
            );
          }
        }
      }
    }

    // Face -X (West)
    {
      const nFluid = world.getFluid(wx - 1, wy, wz);
      const nSolid = world.isSolidAt(wx - 1, wy, wz);
      if (!nSolid) {
        if (!nFluid || nFluid.type !== fluidType) {
          addQuad(
            [wx, ySW, wz + 1],
            [wx, yNW, wz],
            [wx, wy, wz],
            [wx, wy, wz + 1],
            [-1, 0, 0]
          );
        } else {
          const nhN = getFluidCornerHeight(world, wx, wy, wz, fluidType);
          const nhS = getFluidCornerHeight(world, wx, wy, wz + 1, fluidType);
          if (yNW > wy + nhN || ySW > wy + nhS) {
            addQuad(
              [wx, ySW, wz + 1],
              [wx, yNW, wz],
              [wx, wy + nhN, wz],
              [wx, wy + nhS, wz + 1],
              [-1, 0, 0]
            );
          }
        }
      }
    }
  }

  if (positions.length === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeBoundingSphere();
  return geo;
}

import * as THREE from "three";

/**
 * GPU-compatible geometry data representation prepared for WebGPU compute shaders
 * and Möller–Trumbore raycasting.
 */
export interface GPUGeometryData {
  /**
   * Planar vertex position array [x0, y0, z0, x1, y1, z1, ...].
   */
  positions: Float32Array;

  /**
   * Planar surface normal array [nx0, ny0, nz0, nx1, ny1, nz1, ...].
   */
  normals: Float32Array;

  /**
   * Triangle indices buffer [i0, i1, i2, ...]. Length is multiple of 3.
   */
  indices: Uint32Array;

  /**
   * Packed triangle buffer formatted for WGSL std430 storage buffer:
   * Each triangle takes 16 floats (64 bytes):
   * - float[0..3]   : vec4<f32> v0 (x, y, z, 1.0)
   * - float[4..7]   : vec4<f32> v1 (x, y, z, 1.0)
   * - float[8..11]  : vec4<f32> v2 (x, y, z, 1.0)
   * - float[12..15] : vec4<f32> normal (nx, ny, nz, area)
   */
  triangleBuffer: Float32Array;

  /**
   * Optional vertex colors RGBA [0..1].
   */
  colors?: Float32Array;

  /** Total number of triangles. */
  triangleCount: number;

  /** Total number of vertices. */
  vertexCount: number;

  /** Axis-aligned bounding box and geometric envelope. */
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
    dimensions: [number, number, number];
    radius: number;
  };

  /**
   * Packed 32-byte BVH nodes formatted for WGSL:
   * - float[0..2]: bounds_min (vec3<f32>)
   * - uint[3]    : left_first (u32)
   * - float[4..6]: bounds_max (vec3<f32>)
   * - uint[7]    : primitive_count (u32)
   */
  bvhNodes: Float32Array;

  /** Total number of BVH nodes in the linear array. */
  bvhNodeCount: number;

  /** Total surface area in square meters (for physical solar kWh/m² accumulation). */
  totalArea: number;
}

export type { GPUGeometryBuffers } from "./WebGPUContext.ts";

export interface GeometryProcessingOptions {
  /** If true, centers the geometry at origin (0, 0, 0). Default: false. */
  center?: boolean;

  /** Scale multiplier applied to positions (e.g., to normalize to real-world meters). Default: 1.0. */
  scale?: number;

  /** For point clouds, radius of surfel quads in meters. If omitted, estimated from density. */
  surfelRadius?: number;
}

/**
 * Packs indexed vertices into WGSL std430 16-float (64-byte) aligned triangle records.
 */
function packTrianglesForWGSL(
  positions: Float32Array,
  indices: Uint32Array,
  normals?: Float32Array
): { triangleBuffer: Float32Array; totalArea: number } {
  const triangleCount = indices.length / 3;
  // 16 floats (64 bytes) per triangle
  const triangleBuffer = new Float32Array(triangleCount * 16);
  let totalArea = 0;

  for (let t = 0; t < triangleCount; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];

    const v0x = positions[i0 * 3];
    const v0y = positions[i0 * 3 + 1];
    const v0z = positions[i0 * 3 + 2];

    const v1x = positions[i1 * 3];
    const v1y = positions[i1 * 3 + 1];
    const v1z = positions[i1 * 3 + 2];

    const v2x = positions[i2 * 3];
    const v2y = positions[i2 * 3 + 1];
    const v2z = positions[i2 * 3 + 2];

    // Compute edge vectors: E1 = V1 - V0, E2 = V2 - V0
    const e1x = v1x - v0x;
    const e1y = v1y - v0y;
    const e1z = v1z - v0z;

    const e2x = v2x - v0x;
    const e2y = v2y - v0y;
    const e2z = v2z - v0z;

    // Cross product: E1 x E2
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;

    const crossLength = Math.sqrt(cx * cx + cy * cy + cz * cz);
    const area = 0.5 * crossLength;
    totalArea += area;

    let nx = 0;
    let ny = 1;
    let nz = 0;

    if (crossLength > 1e-8) {
      nx = cx / crossLength;
      ny = cy / crossLength;
      nz = cz / crossLength;
    } else if (normals && normals.length > i0 * 3 + 2) {
      // Fallback to vertex normal if degenerate face
      nx = normals[i0 * 3];
      ny = normals[i0 * 3 + 1];
      nz = normals[i0 * 3 + 2];
    }

    const offset = t * 16;
    // v0: vec4<f32>(x, y, z, 1.0)
    triangleBuffer[offset] = v0x;
    triangleBuffer[offset + 1] = v0y;
    triangleBuffer[offset + 2] = v0z;
    triangleBuffer[offset + 3] = 1.0;

    // v1: vec4<f32>(x, y, z, 1.0)
    triangleBuffer[offset + 4] = v1x;
    triangleBuffer[offset + 5] = v1y;
    triangleBuffer[offset + 6] = v1z;
    triangleBuffer[offset + 7] = 1.0;

    // v2: vec4<f32>(x, y, z, 1.0)
    triangleBuffer[offset + 8] = v2x;
    triangleBuffer[offset + 9] = v2y;
    triangleBuffer[offset + 10] = v2z;
    triangleBuffer[offset + 11] = 1.0;

    // normal: vec4<f32>(nx, ny, nz, area)
    triangleBuffer[offset + 12] = nx;
    triangleBuffer[offset + 13] = ny;
    triangleBuffer[offset + 14] = nz;
    triangleBuffer[offset + 15] = area;
  }

  return { triangleBuffer, totalArea };
}

/**
 * Calculates Axis-Aligned Bounding Box (AABB) metrics for an array of positions.
 */
function computeBoundingMetrics(positions: Float32Array): {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  dimensions: [number, number, number];
  radius: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  const count = positions.length / 3;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;

    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  if (count === 0) {
    minX = minY = minZ = maxX = maxY = maxZ = 0;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;

  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;

  const radius = Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [cx, cy, cz],
    dimensions: [dx, dy, dz],
    radius,
  };
}

/**
 * Converts an unmeshed LiDAR point cloud (e.g. from .xyz or point-only .ply) into
 * a ray-traceable surfel mesh (surface element quads).
 *
 * Each point is expanded into an oriented quad composed of 2 triangles with computed surface normals.
 *
 * @param positions Point cloud coordinates [x0, y0, z0, ...]
 * @param existingNormals Optional existing normals [nx0, ny0, nz0, ...]
 * @param existingColors Optional vertex colors [r0, g0, b0, ...]
 * @param surfelRadius Optional explicit surfel radius in meters
 * @returns Three.js BufferGeometry containing indexed surfel quads
 */
export function pointCloudToSurfelMesh(
  positions: Float32Array,
  existingNormals?: Float32Array,
  existingColors?: Float32Array,
  surfelRadius?: number
): THREE.BufferGeometry {
  const pointCount = positions.length / 3;
  if (pointCount === 0) {
    return new THREE.BufferGeometry();
  }

  // Estimate adaptive surfel radius if not provided
  const bounds = computeBoundingMetrics(positions);
  const estimatedRadius =
    surfelRadius && surfelRadius > 0
      ? surfelRadius
      : Math.max(0.02, bounds.radius / Math.max(1, Math.cbrt(pointCount) * 1.5));

  // 4 vertices per point (1 quad)
  const surfelVertexCount = pointCount * 4;
  const surfelPositions = new Float32Array(surfelVertexCount * 3);
  const surfelNormals = new Float32Array(surfelVertexCount * 3);
  let surfelColors: Float32Array | undefined;

  if (existingColors && existingColors.length >= pointCount * 3) {
    surfelColors = new Float32Array(surfelVertexCount * 3);
  }

  // 2 triangles per quad = 6 indices per point
  const surfelIndices = new Uint32Array(pointCount * 6);

  const defaultUp = new THREE.Vector3(0, 1, 0);
  const tangent1 = new THREE.Vector3();
  const tangent2 = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const point = new THREE.Vector3();

  for (let p = 0; p < pointCount; p++) {
    point.set(positions[p * 3], positions[p * 3 + 1], positions[p * 3 + 2]);

    if (existingNormals && existingNormals.length >= (p + 1) * 3) {
      normal.set(existingNormals[p * 3], existingNormals[p * 3 + 1], existingNormals[p * 3 + 2]);
      if (normal.lengthSq() < 1e-4) {
        normal.copy(defaultUp);
      } else {
        normal.normalize();
      }
    } else {
      // Default to upward normal for urban drone photogrammetry / terrain
      normal.copy(defaultUp);
    }

    // Construct orthonormal tangent frame perpendicular to normal
    const helper = Math.abs(normal.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : defaultUp;
    tangent1.crossVectors(normal, helper).normalize().multiplyScalar(estimatedRadius);
    tangent2.crossVectors(normal, tangent1).normalize().multiplyScalar(estimatedRadius);

    // Quad corners centered around the LiDAR point
    const vBase = p * 4;
    const pBase = vBase * 3;

    // Corner 0: -T1 - T2
    surfelPositions[pBase] = point.x - tangent1.x - tangent2.x;
    surfelPositions[pBase + 1] = point.y - tangent1.y - tangent2.y;
    surfelPositions[pBase + 2] = point.z - tangent1.z - tangent2.z;

    // Corner 1: +T1 - T2
    surfelPositions[pBase + 3] = point.x + tangent1.x - tangent2.x;
    surfelPositions[pBase + 4] = point.y + tangent1.y - tangent2.y;
    surfelPositions[pBase + 5] = point.z + tangent1.z - tangent2.z;

    // Corner 2: +T1 + T2
    surfelPositions[pBase + 6] = point.x + tangent1.x + tangent2.x;
    surfelPositions[pBase + 7] = point.y + tangent1.y + tangent2.y;
    surfelPositions[pBase + 8] = point.z + tangent1.z + tangent2.z;

    // Corner 3: -T1 + T2
    surfelPositions[pBase + 9] = point.x - tangent1.x + tangent2.x;
    surfelPositions[pBase + 10] = point.y - tangent1.y + tangent2.y;
    surfelPositions[pBase + 11] = point.z - tangent1.z + tangent2.z;

    // Assign normal to all 4 vertices
    for (let c = 0; c < 4; c++) {
      surfelNormals[(vBase + c) * 3] = normal.x;
      surfelNormals[(vBase + c) * 3 + 1] = normal.y;
      surfelNormals[(vBase + c) * 3 + 2] = normal.z;

      if (surfelColors && existingColors) {
        surfelColors[(vBase + c) * 3] = existingColors[p * 3];
        surfelColors[(vBase + c) * 3 + 1] = existingColors[p * 3 + 1];
        surfelColors[(vBase + c) * 3 + 2] = existingColors[p * 3 + 2];
      }
    }

    // Two counter-clockwise triangles for the quad: (0, 1, 2) and (0, 2, 3)
    const iBase = p * 6;
    surfelIndices[iBase] = vBase;
    surfelIndices[iBase + 1] = vBase + 1;
    surfelIndices[iBase + 2] = vBase + 2;

    surfelIndices[iBase + 3] = vBase;
    surfelIndices[iBase + 4] = vBase + 2;
    surfelIndices[iBase + 5] = vBase + 3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(surfelPositions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(surfelNormals, 3));
  if (surfelColors) {
    geometry.setAttribute("color", new THREE.BufferAttribute(surfelColors, 3));
  }
  geometry.setIndex(new THREE.BufferAttribute(surfelIndices, 1));

  return geometry;
}

/**
 * Parses raw ASCII or comma/space/tab delimited .xyz point cloud text into a Three.js BufferGeometry.
 *
 * Supports:
 * - `x y z`
 * - `x y z r g b` (RGB 0-255 or 0.0-1.0)
 * - `x y z nx ny nz`
 *
 * @param text Content of the .xyz file
 * @returns Three.js BufferGeometry containing positions, normals, and colors if present
 */
export function parseXYZ(text: string): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const normals: number[] = [];

  let hasColors = false;
  let hasNormals = false;

  let pos = 0;
  const len = text.length;

  while (pos < len) {
    let nextNewline = text.indexOf("\n", pos);
    if (nextNewline === -1) nextNewline = len;

    let line = text.substring(pos, nextNewline).trim();
    pos = nextNewline + 1;

    if (!line || line.charCodeAt(0) === 35 /* '#' */ || line.startsWith("//")) {
      continue;
    }

    // Split on whitespace or commas
    const parts = line.split(/[\s,]+/);
    if (parts.length < 3) continue;

    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    const z = parseFloat(parts[2]);

    if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

    positions.push(x, y, z);

    // Optional attributes: 6 components (XYZ + RGB or XYZ + Normal)
    if (parts.length >= 6) {
      const v3 = parseFloat(parts[3]);
      const v4 = parseFloat(parts[4]);
      const v5 = parseFloat(parts[5]);

      if (!isNaN(v3) && !isNaN(v4) && !isNaN(v5)) {
        // If values exceed 1.0, treat as RGB [0..255]
        if (v3 > 1.0 || v4 > 1.0 || v5 > 1.0) {
          hasColors = true;
          colors.push(v3 / 255, v4 / 255, v5 / 255);
        } else if (parts.length >= 7) {
          // If 7+ components, likely XYZ + RGB + Intensity
          hasColors = true;
          colors.push(v3, v4, v5);
        } else {
          // Assume normal vector if normalized
          hasNormals = true;
          normals.push(v3, v4, v5);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  const posArray = new Float32Array(positions);
  geometry.setAttribute("position", new THREE.BufferAttribute(posArray, 3));

  if (hasNormals && normals.length === positions.length) {
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));
  }
  if (hasColors && colors.length === positions.length) {
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
  }

  return geometry;
}

/**
 * Main ingestion processor: converts any imported 3D mesh or LiDAR point cloud (.ply, .xyz, .glb)
 * into GPU-ready typed array buffers and WGSL std430 storage structures.
 *
 * @param geometry Input Three.js BufferGeometry
 * @param options Geometric transformation and surfel meshing parameters
 * @returns Fully compiled GPUGeometryData ready for WebGPU compute kernels
 */
export function processBufferGeometry(
  geometry: THREE.BufferGeometry,
  options: GeometryProcessingOptions = {}
): GPUGeometryData {
  let targetGeometry = geometry;

  // If geometry is a point cloud (no index buffer and no face groupings), convert to surfel mesh
  const hasIndex = targetGeometry.index !== null && targetGeometry.index.count > 0;
  const positionAttr = targetGeometry.getAttribute("position");

  if (!positionAttr) {
    throw new Error("Invalid geometry: missing 'position' attribute.");
  }

  if (!hasIndex && positionAttr.count > 0) {
    // If unindexed and count is not a multiple of 3, treat as point cloud
    const isPointCloud = positionAttr.count % 3 !== 0;
    if (isPointCloud) {
      const existingNormals = targetGeometry.getAttribute("normal")?.array as Float32Array | undefined;
      const existingColors = targetGeometry.getAttribute("color")?.array as Float32Array | undefined;
      targetGeometry = pointCloudToSurfelMesh(
        positionAttr.array as Float32Array,
        existingNormals,
        existingColors,
        options.surfelRadius
      );
    }
  }

  // Clone positions to apply optional scale and centering transformations
  const rawPositions = (targetGeometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
  const positions = new Float32Array(rawPositions.length);
  positions.set(rawPositions);

  const scale = options.scale ?? 1.0;
  if (scale !== 1.0) {
    for (let i = 0; i < positions.length; i++) {
      positions[i] *= scale;
    }
  }

  if (options.center) {
    const bounds = computeBoundingMetrics(positions);
    for (let i = 0; i < positions.length / 3; i++) {
      positions[i * 3] -= bounds.center[0];
      positions[i * 3 + 1] -= bounds.center[1];
      positions[i * 3 + 2] -= bounds.center[2];
    }
  }

  // Compute normals if missing
  let normalAttr = targetGeometry.getAttribute("normal") as THREE.BufferAttribute | undefined;
  if (!normalAttr || normalAttr.count !== positions.length / 3) {
    targetGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    targetGeometry.computeVertexNormals();
    normalAttr = targetGeometry.getAttribute("normal") as THREE.BufferAttribute;
  }
  const normals = new Float32Array(normalAttr.array as Float32Array);

  // Extract or generate index buffer
  let indices: Uint32Array;
  if (targetGeometry.index) {
    const rawIndices = targetGeometry.index.array;
    indices = new Uint32Array(rawIndices.length);
    indices.set(rawIndices);
  } else {
    // Unindexed triangle soup: generate linear sequence [0, 1, 2, 3, ...]
    const count = positions.length / 3;
    indices = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      indices[i] = i;
    }
  }

  // Extract optional colors
  let colors: Float32Array | undefined;
  const colorAttr = targetGeometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  if (colorAttr) {
    colors = new Float32Array(colorAttr.array as Float32Array);
  }

  // Build Linear BVH acceleration structure and reorder indices for spatial locality
  const bvhResult = buildBVH(positions, indices);
  indices.set(bvhResult.reorderedIndices);

  // Pack triangles for WGSL std430 storage buffer
  const { triangleBuffer, totalArea } = packTrianglesForWGSL(positions, indices, normals);
  const boundingBox = computeBoundingMetrics(positions);

  return {
    positions,
    normals,
    indices,
    triangleBuffer,
    bvhNodes: bvhResult.bvhNodes,
    bvhNodeCount: bvhResult.nodeCount,
    colors,
    triangleCount: indices.length / 3,
    vertexCount: positions.length / 3,
    boundingBox,
    totalArea,
  };
}

export interface BVHBuildResult {
  bvhNodes: Float32Array;
  nodeCount: number;
  reorderedIndices: Uint32Array;
}

/**
 * Constructs a Linear Bounding Volume Hierarchy (BVH) matching WGSL BVHNode layout (32 bytes per node).
 * Guarantees that internal nodes have left child at `left_first` and right child at `left_first + 1`.
 * Reorders triangle indices so that primitives referenced by leaf nodes are contiguous.
 *
 * @param positions Vertex coordinates [x0, y0, z0, ...]
 * @param indices Triangle index array [i0, i1, i2, ...]
 * @param maxLeafSize Maximum triangles per leaf node (default: 4)
 * @returns BVHBuildResult containing packed nodes and reordered indices
 */
export function buildBVH(
  positions: Float32Array,
  indices: Uint32Array,
  maxLeafSize = 4
): BVHBuildResult {
  const triCount = Math.floor(indices.length / 3);
  if (triCount === 0) {
    return {
      bvhNodes: new Float32Array(0),
      nodeCount: 0,
      reorderedIndices: new Uint32Array(0),
    };
  }

  const triCentroids = new Float32Array(triCount * 3);
  const triBounds = new Float32Array(triCount * 6);
  const triIndices = new Uint32Array(triCount);

  for (let t = 0; t < triCount; t++) {
    triIndices[t] = t;
    const i0 = indices[t * 3] * 3;
    const i1 = indices[t * 3 + 1] * 3;
    const i2 = indices[t * 3 + 2] * 3;

    const v0x = positions[i0];
    const v0y = positions[i0 + 1];
    const v0z = positions[i0 + 2];

    const v1x = positions[i1];
    const v1y = positions[i1 + 1];
    const v1z = positions[i1 + 2];

    const v2x = positions[i2];
    const v2y = positions[i2 + 1];
    const v2z = positions[i2 + 2];

    triCentroids[t * 3] = (v0x + v1x + v2x) / 3;
    triCentroids[t * 3 + 1] = (v0y + v1y + v2y) / 3;
    triCentroids[t * 3 + 2] = (v0z + v1z + v2z) / 3;

    triBounds[t * 6] = Math.min(v0x, v1x, v2x);
    triBounds[t * 6 + 1] = Math.min(v0y, v1y, v2y);
    triBounds[t * 6 + 2] = Math.min(v0z, v1z, v2z);
    triBounds[t * 6 + 3] = Math.max(v0x, v1x, v2x);
    triBounds[t * 6 + 4] = Math.max(v0y, v1y, v2y);
    triBounds[t * 6 + 5] = Math.max(v0z, v1z, v2z);
  }

  interface IntermediateNode {
    min: [number, number, number];
    max: [number, number, number];
    leftFirst: number;
    primCount: number;
  }

  const rawNodes: IntermediateNode[] = [
    { min: [0, 0, 0], max: [0, 0, 0], leftFirst: 0, primCount: 0 },
  ];

  function populateNode(nodeIdx: number, start: number, count: number): void {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (let i = start; i < start + count; i++) {
      const t = triIndices[i];
      if (triBounds[t * 6] < minX) minX = triBounds[t * 6];
      if (triBounds[t * 6 + 1] < minY) minY = triBounds[t * 6 + 1];
      if (triBounds[t * 6 + 2] < minZ) minZ = triBounds[t * 6 + 2];
      if (triBounds[t * 6 + 3] > maxX) maxX = triBounds[t * 6 + 3];
      if (triBounds[t * 6 + 4] > maxY) maxY = triBounds[t * 6 + 4];
      if (triBounds[t * 6 + 5] > maxZ) maxZ = triBounds[t * 6 + 5];
    }

    rawNodes[nodeIdx].min = [minX, minY, minZ];
    rawNodes[nodeIdx].max = [maxX, maxY, maxZ];

    if (count <= maxLeafSize) {
      rawNodes[nodeIdx].leftFirst = start;
      rawNodes[nodeIdx].primCount = count;
      return;
    }

    // Split on longest axis of centroid bounding box
    let cMinX = Infinity;
    let cMinY = Infinity;
    let cMinZ = Infinity;
    let cMaxX = -Infinity;
    let cMaxY = -Infinity;
    let cMaxZ = -Infinity;

    for (let i = start; i < start + count; i++) {
      const t = triIndices[i];
      const cx = triCentroids[t * 3];
      const cy = triCentroids[t * 3 + 1];
      const cz = triCentroids[t * 3 + 2];
      if (cx < cMinX) cMinX = cx;
      if (cx > cMaxX) cMaxX = cx;
      if (cy < cMinY) cMinY = cy;
      if (cy > cMaxY) cMaxY = cy;
      if (cz < cMinZ) cMinZ = cz;
      if (cz > cMaxZ) cMaxZ = cz;
    }

    const extentX = cMaxX - cMinX;
    const extentY = cMaxY - cMinY;
    const extentZ = cMaxZ - cMinZ;
    let axis = 0;
    if (extentY > extentX && extentY > extentZ) axis = 1;
    else if (extentZ > extentX && extentZ > extentY) axis = 2;

    const mid = (start + start + count) >> 1;
    triIndices
      .subarray(start, start + count)
      .sort((a, b) => triCentroids[a * 3 + axis] - triCentroids[b * 3 + axis]);

    const leftCount = mid - start;
    const rightCount = count - leftCount;

    // Consecutively allocate both children so right child is always leftFirst + 1
    const leftChildIdx = rawNodes.length;
    const rightChildIdx = leftChildIdx + 1;
    rawNodes.push({ min: [0, 0, 0], max: [0, 0, 0], leftFirst: 0, primCount: 0 });
    rawNodes.push({ min: [0, 0, 0], max: [0, 0, 0], leftFirst: 0, primCount: 0 });

    rawNodes[nodeIdx].leftFirst = leftChildIdx;
    rawNodes[nodeIdx].primCount = 0;

    populateNode(leftChildIdx, start, leftCount);
    populateNode(rightChildIdx, mid, rightCount);
  }

  populateNode(0, 0, triCount);

  // Build reordered indices array matching leaf primitive partition
  const reorderedIndices = new Uint32Array(indices.length);
  for (let t = 0; t < triCount; t++) {
    const origTri = triIndices[t];
    reorderedIndices[t * 3] = indices[origTri * 3];
    reorderedIndices[t * 3 + 1] = indices[origTri * 3 + 1];
    reorderedIndices[t * 3 + 2] = indices[origTri * 3 + 2];
  }

  // Pack into 32-byte std430 binary buffer:
  // float[0..2]: bounds_min (vec3<f32>)
  // uint[3]    : left_first (u32)
  // float[4..6]: bounds_max (vec3<f32>)
  // uint[7]    : primitive_count (u32)
  const buffer = new ArrayBuffer(rawNodes.length * 32);
  const f32 = new Float32Array(buffer);
  const u32 = new Uint32Array(buffer);

  for (let n = 0; n < rawNodes.length; n++) {
    const node = rawNodes[n];
    const off = n * 8;
    f32[off] = node.min[0];
    f32[off + 1] = node.min[1];
    f32[off + 2] = node.min[2];
    u32[off + 3] = node.leftFirst;
    f32[off + 4] = node.max[0];
    f32[off + 5] = node.max[1];
    f32[off + 6] = node.max[2];
    u32[off + 7] = node.primCount;
  }

  return {
    bvhNodes: f32,
    nodeCount: rawNodes.length,
    reorderedIndices,
  };
}



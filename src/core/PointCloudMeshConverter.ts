import * as THREE from "three";
import { PointCloudData, MeshConversionOptions } from "../types/pointCloud";

/**
 * Cleanly disposes a Three.js BufferGeometry and detaches its underlying GPU and CPU buffer arrays
 * so they are immediately eligible for garbage collection.
 */
export function disposeGeometry(geometry: THREE.BufferGeometry | null | undefined): void {
  if (!geometry) return;

  // 1. Dispatch WebGL dispose event
  geometry.dispose();

  // 2. Dispose and detach all buffer attributes
  const attributes = geometry.attributes;
  if (attributes) {
    for (const key of Object.keys(attributes)) {
      const attr = attributes[key];
      if (attr) {
        if (typeof (attr as any).dispose === "function") {
          (attr as any).dispose();
        }
        // Break typed array reference to prevent holding large buffers in memory
        (attr as any).array = null;
      }
      delete (attributes as any)[key];
    }
  }

  // 3. Dispose and detach index buffer
  if (geometry.index) {
    if (typeof (geometry.index as any).dispose === "function") {
      (geometry.index as any).dispose();
    }
    (geometry.index as any).array = null;
    (geometry as any).index = null;
  }
}

/**
 * Generates an oriented surfel quad mesh (4 vertices, 2 faces per point)
 * for solid surface rendering and raytracing without connecting points across empty space.
 */
export function generateSurfelMesh(
  positions: Float32Array,
  pointCount: number,
  colors?: Float32Array,
  normals?: Float32Array,
  surfelRadius?: number,
  boundsRadius = 1.0,
  centerOffsetX = 0,
  centerOffsetY = 0,
  centerOffsetZ = 0
): THREE.BufferGeometry {
  const estimatedRadius =
    surfelRadius && surfelRadius > 0
      ? surfelRadius
      : Math.max(0.015, boundsRadius / Math.max(1, Math.cbrt(pointCount) * 1.5));

  const vertexCount = pointCount * 4;
  const surfelPositions = new Float32Array(vertexCount * 3);
  const surfelNormals = new Float32Array(vertexCount * 3);
  const surfelColors = colors ? new Float32Array(vertexCount * 3) : undefined;
  const surfelIndices = new Uint32Array(pointCount * 6);

  const defaultUp = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3();
  const tangent1 = new THREE.Vector3();
  const tangent2 = new THREE.Vector3();

  for (let p = 0; p < pointCount; p++) {
    const px = positions[p * 3] - centerOffsetX;
    const py = positions[p * 3 + 1] - centerOffsetY;
    const pz = positions[p * 3 + 2] - centerOffsetZ;

    if (normals && normals.length >= (p + 1) * 3) {
      normal.set(normals[p * 3], normals[p * 3 + 1], normals[p * 3 + 2]);
      if (normal.lengthSq() < 1e-4) normal.copy(defaultUp);
      else normal.normalize();
    } else {
      normal.copy(defaultUp);
    }

    const helper = Math.abs(normal.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : defaultUp;
    tangent1.crossVectors(normal, helper).normalize().multiplyScalar(estimatedRadius);
    tangent2.crossVectors(normal, tangent1).normalize().multiplyScalar(estimatedRadius);

    const vBase = p * 4;
    const pBase = vBase * 3;

    surfelPositions[pBase] = px - tangent1.x - tangent2.x;
    surfelPositions[pBase + 1] = py - tangent1.y - tangent2.y;
    surfelPositions[pBase + 2] = pz - tangent1.z - tangent2.z;

    surfelPositions[pBase + 3] = px + tangent1.x - tangent2.x;
    surfelPositions[pBase + 4] = py + tangent1.y - tangent2.y;
    surfelPositions[pBase + 5] = pz + tangent1.z - tangent2.z;

    surfelPositions[pBase + 6] = px + tangent1.x + tangent2.x;
    surfelPositions[pBase + 7] = py + tangent1.y + tangent2.y;
    surfelPositions[pBase + 8] = pz + tangent1.z + tangent2.z;

    surfelPositions[pBase + 9] = px - tangent1.x + tangent2.x;
    surfelPositions[pBase + 10] = py - tangent1.y + tangent2.y;
    surfelPositions[pBase + 11] = pz - tangent1.z + tangent2.z;

    for (let c = 0; c < 4; c++) {
      const vOffset = (vBase + c) * 3;
      surfelNormals[vOffset] = normal.x;
      surfelNormals[vOffset + 1] = normal.y;
      surfelNormals[vOffset + 2] = normal.z;

      if (surfelColors && colors) {
        surfelColors[vOffset] = colors[p * 3];
        surfelColors[vOffset + 1] = colors[p * 3 + 1];
        surfelColors[vOffset + 2] = colors[p * 3 + 2];
      }
    }

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
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    geographicOffset: [centerOffsetX, centerOffsetY, centerOffsetZ],
    originalPointCount: pointCount,
    isPointCloud: false,
    isPointSurfelMesh: true,
  };

  return geometry;
}

/**
 * Converts a PointCloudData structure (from .ply, .las, .laz, or .xyz)
 * into a renderable Three.js BufferGeometry.
 *
 * If the source file already had triangle faces (e.g. meshed .ply), those faces are preserved.
 * If the source file is an unmeshed point cloud, a standard Three.js point cloud geometry
 * with native 3D points, colors, and coordinates is created (or surfel quads if renderMode is "mesh").
 * This prevents artificial Delaunay spiderwebbing across buildings and open space.
 *
 * @param data Parsed PointCloudData
 * @param options Conversion and memory options
 * @returns Three.js BufferGeometry ready for rendering
 */
export function pointCloudToMeshGeometry(
  data: PointCloudData,
  options: MeshConversionOptions = {}
): THREE.BufferGeometry {
  const {
    surfelRadius,
    centerAtOrigin = true,
    maxPoints = 500000,
    renderMode = "pointcloud",
  } = options;

  let positions = data.positions;
  let colors = data.colors;
  let normals = data.normals;
  let indices = data.indices;
  let pointCount = data.pointCount;

  // 1. Uniform stride downsampling for massive point clouds to prevent memory exhaustion
  if (pointCount > maxPoints && !indices) {
    const stride = Math.ceil(pointCount / maxPoints);
    const downsampledCount = Math.floor(pointCount / stride);

    const dsPositions = new Float32Array(downsampledCount * 3);
    const dsColors = colors ? new Float32Array(downsampledCount * 3) : undefined;
    const dsNormals = normals ? new Float32Array(downsampledCount * 3) : undefined;

    let targetIdx = 0;
    for (let i = 0; i < pointCount && targetIdx < downsampledCount; i += stride) {
      dsPositions[targetIdx * 3] = positions[i * 3];
      dsPositions[targetIdx * 3 + 1] = positions[i * 3 + 1];
      dsPositions[targetIdx * 3 + 2] = positions[i * 3 + 2];

      if (dsColors && colors) {
        dsColors[targetIdx * 3] = colors[i * 3];
        dsColors[targetIdx * 3 + 1] = colors[i * 3 + 1];
        dsColors[targetIdx * 3 + 2] = colors[i * 3 + 2];
      }

      if (dsNormals && normals) {
        dsNormals[targetIdx * 3] = normals[i * 3];
        dsNormals[targetIdx * 3 + 1] = normals[i * 3 + 1];
        dsNormals[targetIdx * 3 + 2] = normals[i * 3 + 2];
      }

      targetIdx++;
    }

    positions = dsPositions;
    colors = dsColors;
    normals = dsNormals;
    pointCount = downsampledCount;
  }

  // 2. Compute translation offset for centering at origin (0, 0, 0)
  const centerOffsetX = centerAtOrigin ? data.bounds.center[0] : 0;
  const centerOffsetY = centerAtOrigin ? data.bounds.center[1] : 0;
  const centerOffsetZ = centerAtOrigin ? data.bounds.center[2] : 0;

  // 3. Detect if dataset is GIS Z-up (elevation is Z, while X and Y are horizontal extent)
  const dims = data.bounds.dimensions;
  const isZUp =
    (data.format === "las" || data.format === "laz") ||
    (dims[2] < dims[0] * 0.4 && dims[2] < dims[1] * 0.4 && dims[0] > 5 && dims[1] > 5);

  // 4. Handle pre-meshed geometry (e.g. meshed PLY with face indices)
  if (indices && indices.length > 0) {
    const geometry = new THREE.BufferGeometry();

    const centeredPositions = new Float32Array(positions.length);
    for (let i = 0; i < pointCount; i++) {
      centeredPositions[i * 3] = positions[i * 3] - centerOffsetX;
      centeredPositions[i * 3 + 1] = positions[i * 3 + 1] - centerOffsetY;
      centeredPositions[i * 3 + 2] = positions[i * 3 + 2] - centerOffsetZ;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(centeredPositions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    if (normals && normals.length === positions.length) {
      geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    } else {
      geometry.computeVertexNormals();
    }

    if (colors && colors.length === positions.length) {
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData = {
      geographicOffset: [centerOffsetX, centerOffsetY, centerOffsetZ],
      originalPointCount: data.pointCount,
      isPointCloud: false,
      isPointSurfelMesh: false,
      isZUp,
    };

    return geometry;
  }

  // 5. If requested render mode is "mesh" or surfelRadius is explicitly provided, generate surfel quads
  if (renderMode === "mesh" || (surfelRadius !== undefined && surfelRadius > 0)) {
    const surfelGeo = generateSurfelMesh(
      positions,
      pointCount,
      colors,
      normals,
      surfelRadius,
      data.bounds.radius,
      centerOffsetX,
      centerOffsetY,
      centerOffsetZ
    );
    surfelGeo.userData.isZUp = isZUp;
    return surfelGeo;
  }

  // 6. Native Three.js Point Cloud geometry (THREE.Points standard)
  const geometry = new THREE.BufferGeometry();
  const centeredPositions = new Float32Array(pointCount * 3);

  for (let i = 0; i < pointCount; i++) {
    centeredPositions[i * 3] = positions[i * 3] - centerOffsetX;
    centeredPositions[i * 3 + 1] = positions[i * 3 + 1] - centerOffsetY;
    centeredPositions[i * 3 + 2] = positions[i * 3 + 2] - centerOffsetZ;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(centeredPositions, 3));

  if (colors && colors.length >= pointCount * 3) {
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }

  if (normals && normals.length >= pointCount * 3) {
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    geographicOffset: [centerOffsetX, centerOffsetY, centerOffsetZ],
    originalPointCount: data.pointCount,
    isPointCloud: true,
    isPointSurfelMesh: false,
    isZUp,
  };

  return geometry;
}

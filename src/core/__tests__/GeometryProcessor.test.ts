import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  processBufferGeometry,
  parseXYZ,
  pointCloudToSurfelMesh,
  buildBVH,
} from "../GeometryProcessor.ts";

describe("GeometryProcessor - Drone LiDAR Data & GPU Pipeline", () => {
  describe("processBufferGeometry on Triangular Meshes", () => {
    it("processes an indexed cube geometry with correct WGSL std430 alignment", () => {
      const cube = new THREE.BoxGeometry(2, 2, 2);
      const gpuData = processBufferGeometry(cube);

      expect(gpuData.triangleCount).toBe(12);
      expect(gpuData.vertexCount).toBe(24);
      expect(gpuData.indices.length).toBe(36);

      // WGSL storage buffer requires 16 floats (64 bytes) per triangle
      expect(gpuData.triangleBuffer.length).toBe(12 * 16);

      // Total area of a 2x2x2 cube is 6 faces * (2*2) = 24 m²
      expect(gpuData.totalArea).toBeCloseTo(24.0, 3);

      // Verify bounding dimensions
      expect(gpuData.boundingBox.dimensions[0]).toBeCloseTo(2.0, 3);
      expect(gpuData.boundingBox.dimensions[1]).toBeCloseTo(2.0, 3);
      expect(gpuData.boundingBox.dimensions[2]).toBeCloseTo(2.0, 3);
    });

    it("correctly computes individual triangle areas in triangleBuffer", () => {
      // Plane of size 4 x 5 has total area 20 m² made of 2 triangles (10 m² each)
      const plane = new THREE.PlaneGeometry(4, 5);
      const gpuData = processBufferGeometry(plane);

      expect(gpuData.triangleCount).toBe(2);
      expect(gpuData.totalArea).toBeCloseTo(20.0, 3);

      // Each triangle has area stored at offset + 15
      expect(gpuData.triangleBuffer[15]).toBeCloseTo(10.0, 3);
      expect(gpuData.triangleBuffer[31]).toBeCloseTo(10.0, 3);
    });

    it("applies scaling option to positions and surface area", () => {
      const plane = new THREE.PlaneGeometry(1, 1); // area 1 m²
      const scaledGPU = processBufferGeometry(plane, { scale: 3.0 }); // 3x3 plane -> area 9 m²

      expect(scaledGPU.totalArea).toBeCloseTo(9.0, 3);
      expect(scaledGPU.boundingBox.dimensions[0]).toBeCloseTo(3.0, 3);
      expect(scaledGPU.boundingBox.dimensions[1]).toBeCloseTo(3.0, 3);
    });

    it("centers geometry at origin when center option is enabled", () => {
      const geo = new THREE.BufferGeometry();
      // Triangle offset far from origin: [100, 100, 100]
      const pos = new Float32Array([100, 100, 100, 102, 100, 100, 100, 102, 100]);
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

      const gpuData = processBufferGeometry(geo, { center: true });
      expect(gpuData.boundingBox.center[0]).toBeCloseTo(0, 4);
      expect(gpuData.boundingBox.center[1]).toBeCloseTo(0, 4);
      expect(gpuData.boundingBox.center[2]).toBeCloseTo(0, 4);
    });

    it("generates normals if input geometry lacks a normal attribute", () => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

      expect(geo.getAttribute("normal")).toBeUndefined();

      const gpuData = processBufferGeometry(geo);
      expect(gpuData.normals.length).toBe(9);
      // For CCW triangle in XY plane, normal points in +Z
      expect(gpuData.normals[2]).toBeCloseTo(1.0, 3);
    });
  });

  describe("parseXYZ Point Cloud Parser", () => {
    it("parses ASCII XYZ coordinates with whitespace and comma separators", () => {
      const xyzContent = `
        # Drone scan coordinates
        0.0 1.5 2.0
        3.0, 4.5, 5.0
        // Comment line
        6.0  7.5  8.0
      `;

      const geometry = parseXYZ(xyzContent);
      const pos = geometry.getAttribute("position");
      expect(pos).toBeDefined();
      expect(pos.count).toBe(3);

      expect(pos.getX(0)).toBe(0.0);
      expect(pos.getY(0)).toBe(1.5);
      expect(pos.getZ(0)).toBe(2.0);

      expect(pos.getX(1)).toBe(3.0);
      expect(pos.getY(1)).toBe(4.5);
      expect(pos.getZ(1)).toBe(5.0);

      expect(pos.getX(2)).toBe(6.0);
      expect(pos.getY(2)).toBe(7.5);
      expect(pos.getZ(2)).toBe(8.0);
    });

    it("extracts and normalizes RGB vertex colors in [0, 255] range", () => {
      const xyzWithColors = `
        10.0 20.0 30.0 255 128 0
        40.0 50.0 60.0 0 255 128
      `;

      const geometry = parseXYZ(xyzWithColors);
      const colors = geometry.getAttribute("color");
      expect(colors).toBeDefined();
      expect(colors.count).toBe(2);

      expect(colors.getX(0)).toBeCloseTo(1.0, 2); // 255 / 255
      expect(colors.getY(0)).toBeCloseTo(128 / 255, 2);
      expect(colors.getZ(0)).toBeCloseTo(0.0, 2);
    });

    it("gracefully handles empty or comment-only input", () => {
      const emptyGeometry = parseXYZ("# Only comments\n// Another comment\n   ");
      const pos = emptyGeometry.getAttribute("position");
      expect(pos).toBeDefined();
      expect(pos.count).toBe(0);
    });
  });

  describe("pointCloudToSurfelMesh & Point Cloud Ingestion", () => {
    it("converts unmeshed points into ray-traceable surfel quads", () => {
      const points = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        2, 0, 0,
      ]);

      const surfelGeo = pointCloudToSurfelMesh(points, undefined, undefined, 0.2);

      // 3 points * 4 vertices = 12 vertices
      expect(surfelGeo.getAttribute("position").count).toBe(12);

      // 3 points * 2 triangles = 6 triangles = 18 indices
      expect(surfelGeo.index).toBeDefined();
      expect(surfelGeo.index!.count).toBe(18);

      // All surfel vertices should have surface normals
      const normals = surfelGeo.getAttribute("normal");
      expect(normals).toBeDefined();
      expect(normals.count).toBe(12);
    });

    it("automatically identifies unmeshed point cloud in processBufferGeometry", () => {
      // 5 unindexed points (5 % 3 !== 0)
      const rawPoints = new THREE.BufferGeometry();
      const pos = new Float32Array([
        0, 0, 0,
        1, 1, 0,
        2, 0, 1,
        3, 2, 2,
        4, 1, 3,
      ]);
      rawPoints.setAttribute("position", new THREE.BufferAttribute(pos, 3));

      const gpuData = processBufferGeometry(rawPoints, { surfelRadius: 0.1 });

      // 5 points -> 10 surfel triangles, 20 vertices
      expect(gpuData.triangleCount).toBe(10);
      expect(gpuData.vertexCount).toBe(20);
      expect(gpuData.triangleBuffer.length).toBe(10 * 16);
      expect(gpuData.totalArea).toBeGreaterThan(0);
      expect(gpuData.bvhNodeCount).toBeGreaterThan(0);
      expect(gpuData.bvhNodes.length).toBe(gpuData.bvhNodeCount * 8);
    });
  });

  describe("buildBVH - Linear Bounding Volume Hierarchy Acceleration", () => {
    it("handles empty indices array gracefully", () => {
      const result = buildBVH(new Float32Array(0), new Uint32Array(0));
      expect(result.nodeCount).toBe(0);
      expect(result.bvhNodes.length).toBe(0);
      expect(result.reorderedIndices.length).toBe(0);
    });

    it("builds a single leaf node for a single triangle", () => {
      const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const ind = new Uint32Array([0, 1, 2]);

      const result = buildBVH(pos, ind);
      expect(result.nodeCount).toBe(1);
      expect(result.bvhNodes.length).toBe(8); // 8 floats/uints = 32 bytes

      const u32 = new Uint32Array(result.bvhNodes.buffer);
      // bounds_min: [0, 0, 0]
      expect(result.bvhNodes[0]).toBe(0);
      expect(result.bvhNodes[1]).toBe(0);
      expect(result.bvhNodes[2]).toBe(0);
      // left_first: 0 (start offset)
      expect(u32[3]).toBe(0);
      // bounds_max: [1, 1, 0]
      expect(result.bvhNodes[4]).toBe(1);
      expect(result.bvhNodes[5]).toBe(1);
      expect(result.bvhNodes[6]).toBe(0);
      // primitive_count: 1
      expect(u32[7]).toBe(1);
    });

    it("builds a hierarchical BVH tree where internal nodes have consecutive children", () => {
      const cube = new THREE.BoxGeometry(2, 2, 2);
      const pos = cube.getAttribute("position").array as Float32Array;
      const ind = cube.index!.array as Uint32Array;

      const result = buildBVH(pos, ind, 2); // maxLeafSize = 2
      expect(result.nodeCount).toBeGreaterThan(1);
      expect(result.bvhNodes.length).toBe(result.nodeCount * 8);

      const u32 = new Uint32Array(result.bvhNodes.buffer);

      // Verify that every internal node has consecutive left child (left_first) and right child (left_first + 1)
      for (let n = 0; n < result.nodeCount; n++) {
        const primCount = u32[n * 8 + 7];
        if (primCount === 0) {
          const leftChild = u32[n * 8 + 3];
          const rightChild = leftChild + 1;
          expect(leftChild).toBeGreaterThan(n);
          expect(rightChild).toBeLessThan(result.nodeCount);
        }
      }
    });

    it("reorders triangle indices so leaf primitives are contiguous spans", () => {
      const cube = new THREE.BoxGeometry(4, 4, 4);
      const gpuData = processBufferGeometry(cube);

      expect(gpuData.bvhNodeCount).toBeGreaterThan(0);
      expect(gpuData.bvhNodes.length).toBe(gpuData.bvhNodeCount * 8);

      const u32 = new Uint32Array(gpuData.bvhNodes.buffer);
      let totalLeafTriangles = 0;

      for (let n = 0; n < gpuData.bvhNodeCount; n++) {
        const primCount = u32[n * 8 + 7];
        if (primCount > 0) {
          const leftFirst = u32[n * 8 + 3];
          expect(leftFirst + primCount).toBeLessThanOrEqual(gpuData.triangleCount);
          totalLeafTriangles += primCount;
        }
      }

      expect(totalLeafTriangles).toBe(gpuData.triangleCount);
    });
  });
});

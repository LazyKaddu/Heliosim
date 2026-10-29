import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  pointCloudToMeshGeometry,
  disposeGeometry,
} from "../PointCloudMeshConverter";
import { PointCloudData } from "../../types/pointCloud";

function createSyntheticPointCloud(pointCount = 100): PointCloudData {
  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);

  for (let i = 0; i < pointCount; i++) {
    positions[i * 3] = i * 0.5;
    positions[i * 3 + 1] = Math.sin(i * 0.1) * 2;
    positions[i * 3 + 2] = i * 0.2;

    colors[i * 3] = (i % 10) / 10;
    colors[i * 3 + 1] = 0.5;
    colors[i * 3 + 2] = 1.0;
  }

  return {
    positions,
    colors,
    pointCount,
    bounds: {
      min: [0, -2, 0],
      max: [50, 2, 20],
      center: [25, 0, 10],
      dimensions: [50, 4, 20],
      radius: 30,
    },
    format: "ply",
  };
}

describe("PointCloudMeshConverter - Standard Point Cloud & Mesh Conversion", () => {
  it("converts unmeshed point cloud into native Three.js Point Cloud geometry without random bridging", () => {
    const data = createSyntheticPointCloud(150);
    const geometry = pointCloudToMeshGeometry(data, { centerAtOrigin: true, renderMode: "pointcloud" });

    expect(geometry).toBeDefined();
    expect(geometry.getAttribute("position")).toBeDefined();
    expect(geometry.getAttribute("position").count).toBe(150);

    // Verify it is recognized as a clean point cloud
    expect(geometry.userData.isPointCloud).toBe(true);

    // Verify NO random triangle indices are generated
    expect(geometry.index).toBeNull();

    // Verify colors are mapped 1-to-1 to each point
    const colorAttr = geometry.getAttribute("color");
    expect(colorAttr).toBeDefined();
    expect(colorAttr.count).toBe(150);

    disposeGeometry(geometry);
  });

  it("generates solid surfel quads when renderMode is mesh", () => {
    const data = createSyntheticPointCloud(20);
    const geometry = pointCloudToMeshGeometry(data, { centerAtOrigin: true, renderMode: "mesh" });

    expect(geometry).toBeDefined();
    expect(geometry.index).toBeDefined();
    expect(geometry.getAttribute("position").count).toBe(20 * 4); // 4 vertices per surfel quad
    expect(geometry.index!.count).toBe(20 * 6); // 2 triangles (6 indices) per quad
    expect(geometry.userData.isPointCloud).toBe(false);
    expect(geometry.userData.isPointSurfelMesh).toBe(true);

    disposeGeometry(geometry);
  });

  it("preserves pre-meshed geometry faces from meshed PLY files", () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const data: PointCloudData = {
      positions,
      indices,
      pointCount: 3,
      bounds: {
        min: [0, 0, 0],
        max: [1, 1, 0],
        center: [0.5, 0.5, 0],
        dimensions: [1, 1, 0],
        radius: 0.7,
      },
      format: "ply",
    };

    const geometry = pointCloudToMeshGeometry(data, { centerAtOrigin: false });
    expect(geometry.index).toBeDefined();
    expect(geometry.index!.count).toBe(3);
    expect(geometry.userData.isPointCloud).toBe(false);

    disposeGeometry(geometry);
  });

  it("automatically detects GIS Z-up coordinate orientation when elevation is Z", () => {
    // Like Birmingham: X span = 50m, Y span = 350m, Z span = 6m (Elevation)
    const data: PointCloudData = {
      positions: new Float32Array([450, 700, 15, 451, 701, 16]),
      pointCount: 2,
      bounds: {
        min: [420, 420, 13],
        max: [475, 800, 19],
        center: [447.5, 610, 16],
        dimensions: [55, 380, 6],
        radius: 192,
      },
      format: "ply",
    };

    const geometry = pointCloudToMeshGeometry(data);
    expect(geometry.userData.isZUp).toBe(true);

    disposeGeometry(geometry);
  });

  describe("disposeGeometry", () => {
    it("safely detaches GPU buffers and nulls attributes without throwing", () => {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
      geom.setIndex(new THREE.BufferAttribute(new Uint32Array([0]), 1));

      expect(() => disposeGeometry(geom)).not.toThrow();
      expect(geom.index).toBeNull();
      expect(geom.getAttribute("position")).toBeUndefined();

      expect(() => disposeGeometry(null)).not.toThrow();
      expect(() => disposeGeometry(undefined)).not.toThrow();
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  parseXYZ,
  parseXYZFromFile,
  parsePLY,
  parsePLYFromFile,
  parsePLYHeader,
  parseLAS,
  parseLASFromFile,
  computePointBounds,
  loadPointCloudFile,
} from "../PointCloudLoader";
import { pointCloudToMeshGeometry, disposeGeometry } from "../PointCloudMeshConverter";
import { PointCloudData } from "../../types/pointCloud";

function createSyntheticBinaryPLYBuffer(pointCount: number, hasColors = true, hasNormals = true): ArrayBuffer {
  const header = `ply
format binary_little_endian 1.0
element vertex ${pointCount}
property float x
property float y
property float z
${hasNormals ? "property float nx\nproperty float ny\nproperty float nz\n" : ""}${hasColors ? "property uchar red\nproperty uchar green\nproperty uchar blue\n" : ""}end_header\n`;

  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(header);

  const recordSize = 12 + (hasNormals ? 12 : 0) + (hasColors ? 3 : 0);
  const totalByteLength = headerBytes.byteLength + pointCount * recordSize;
  const buffer = new ArrayBuffer(totalByteLength);
  const uint8 = new Uint8Array(buffer);
  uint8.set(headerBytes, 0);

  const view = new DataView(buffer, headerBytes.byteLength);
  for (let i = 0; i < pointCount; i++) {
    const offset = i * recordSize;
    view.setFloat32(offset, i * 1.5, true);
    view.setFloat32(offset + 4, i * 2.5, true);
    view.setFloat32(offset + 8, i * 3.5, true);

    let cur = offset + 12;
    if (hasNormals) {
      view.setFloat32(cur, 0, true);
      view.setFloat32(cur + 4, 1, true);
      view.setFloat32(cur + 8, 0, true);
      cur += 12;
    }
    if (hasColors) {
      view.setUint8(cur, 255);
      view.setUint8(cur + 1, 128);
      view.setUint8(cur + 2, 64);
    }
  }

  return buffer;
}

describe("PointCloudLoader", () => {
  describe("parseXYZ", () => {
    it("strips comments and headers, correctly parsing XYZ coordinates", () => {
      const xyzText = `
# Exported LiDAR Survey from Drone
// Header metadata: coordinate system WGS84
10.5 20.2 5.0
11.0 20.5 6.0
12.0 21.0 7.5
`;
      const result = parseXYZ(xyzText);
      expect(result.pointCount).toBe(3);
      expect(result.positions.length).toBe(9);
      expect(result.positions[0]).toBeCloseTo(10.5);
      expect(result.positions[1]).toBeCloseTo(20.2);
      expect(result.positions[2]).toBeCloseTo(5.0);
      expect(result.bounds.min[0]).toBeCloseTo(10.5);
      expect(result.bounds.max[0]).toBeCloseTo(12.0);
      expect(result.format).toBe("xyz");
    });

    it("parses XYZ coordinates with 8-bit RGB color attributes", () => {
      const xyzRgb = `
0.0 0.0 0.0 255 0 0
1.0 1.0 1.0 0 255 0
2.0 2.0 2.0 0 0 255
`;
      const result = parseXYZ(xyzRgb);
      expect(result.pointCount).toBe(3);
      expect(result.colors).toBeDefined();
      if (result.colors) {
        expect(result.colors[0]).toBeCloseTo(1.0); // Red
        expect(result.colors[1]).toBeCloseTo(0.0);
        expect(result.colors[2]).toBeCloseTo(0.0);
        expect(result.colors[4]).toBeCloseTo(1.0); // Green
        expect(result.colors[8]).toBeCloseTo(1.0); // Blue
      }
    });

    it("handles comma-delimited CSV formatted point clouds", () => {
      const csvText = `
10.0, 15.0, 20.0
30.0, 35.0, 40.0
`;
      const result = parseXYZ(csvText);
      expect(result.pointCount).toBe(2);
      expect(result.positions[3]).toBe(30.0);
      expect(result.positions[4]).toBe(35.0);
      expect(result.positions[5]).toBe(40.0);
    });
  });

  describe("parsePLY", () => {
    it("correctly extracts header metadata and element record sizes", () => {
      const headerText = `ply
format binary_little_endian 1.0
comment drone survey
element vertex 1500000
property float x
property float y
property float z
property float nx
property float ny
property float nz
property uchar red
property uchar green
property uchar blue
element face 0
end_header
`;
      const bytes = new TextEncoder().encode(headerText);
      const header = parsePLYHeader(bytes);
      expect(header.format).toBe("binary_little_endian");
      expect(header.version).toBe("1.0");
      expect(header.vertexElement?.count).toBe(1500000);
      expect(header.vertexElement?.recordByteLength).toBe(27); // 3*4 + 3*4 + 3*1 = 27 bytes
      expect(header.headerByteLength).toBe(bytes.byteLength);
    });

    it("strips PLY ASCII headers and parses vertices with faces", () => {
      const plyAscii = `ply
format ascii 1.0
comment Created by Heliosim Photogrammetry Test
element vertex 3
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
3 0 1 2
`;
      const encoder = new TextEncoder();
      const buffer = encoder.encode(plyAscii).buffer;

      const result = parsePLY(buffer);
      expect(result.pointCount).toBe(3);
      expect(result.positions.length).toBe(9);
      expect(result.indices).toBeDefined();
      if (result.indices) {
        expect(result.indices.length).toBe(3);
        expect(result.indices[0]).toBe(0);
        expect(result.indices[1]).toBe(1);
        expect(result.indices[2]).toBe(2);
      }
      expect(result.format).toBe("ply");
    });

    it("parses binary little-endian PLY buffers with normals and RGB colors", () => {
      const buffer = createSyntheticBinaryPLYBuffer(10, true, true);
      const result = parsePLY(buffer);
      expect(result.pointCount).toBe(10);
      expect(result.positions.length).toBe(30);
      expect(result.positions[0]).toBeCloseTo(0);
      expect(result.positions[3]).toBeCloseTo(1.5);
      expect(result.normals).toBeDefined();
      expect(result.normals?.[1]).toBeCloseTo(1.0);
      expect(result.colors).toBeDefined();
      expect(result.colors?.[0]).toBeCloseTo(1.0); // 255 / 255
      expect(result.colors?.[1]).toBeCloseTo(128 / 255);
      expect(result.format).toBe("ply");
    });

    it("downsamples binary PLY buffers on-the-fly when pointCount exceeds maxPoints", () => {
      const buffer = createSyntheticBinaryPLYBuffer(100, true, true);
      const result = parsePLY(buffer, { maxPoints: 20 });
      expect(result.pointCount).toBe(20);
      expect(result.positions.length).toBe(60);
      expect(result.normals?.length).toBe(60);
      expect(result.colors?.length).toBe(60);
    });
  });

  describe("parseLAS", () => {
    it("validates LAS signature and extracts points and scaled coordinates", () => {
      // Build a minimal synthetic binary LAS 1.2 buffer
      const headerSize = 227;
      const pointRecordLength = 26; // Point format 2 (has RGB)
      const pointCount = 2;
      const buffer = new ArrayBuffer(headerSize + pointRecordLength * pointCount);
      const view = new DataView(buffer);

      // "LASF" magic bytes
      view.setUint8(0, 0x4c); // L
      view.setUint8(1, 0x41); // A
      view.setUint8(2, 0x53); // S
      view.setUint8(3, 0x46); // F

      // Offset to point data (227)
      view.setUint32(96, headerSize, true);
      // Point format = 2 (with RGB)
      view.setUint8(104, 2);
      // Point record length = 26
      view.setUint16(105, pointRecordLength, true);
      // Number of point records = 2
      view.setUint32(107, pointCount, true);

      // Scale factors: scaleX=0.01, scaleY=0.01, scaleZ=0.01
      view.setFloat64(131, 0.01, true);
      view.setFloat64(139, 0.01, true);
      view.setFloat64(147, 0.01, true);

      // Offsets: offsetX=100.0, offsetY=200.0, offsetZ=50.0
      view.setFloat64(155, 100.0, true);
      view.setFloat64(163, 200.0, true);
      view.setFloat64(171, 50.0, true);

      // Point 0: X=1000 (1000 * 0.01 + 100 = 110), Y=2000 (220), Z=500 (55)
      const p0 = headerSize;
      view.setInt32(p0, 1000, true);
      view.setInt32(p0 + 4, 2000, true);
      view.setInt32(p0 + 8, 500, true);
      // Color (R=255, G=0, B=128)
      view.setUint16(p0 + 20, 255, true);
      view.setUint16(p0 + 22, 0, true);
      view.setUint16(p0 + 24, 128, true);

      // Point 1: X=2000 (120), Y=3000 (230), Z=1000 (60)
      const p1 = headerSize + pointRecordLength;
      view.setInt32(p1, 2000, true);
      view.setInt32(p1 + 4, 3000, true);
      view.setInt32(p1 + 8, 1000, true);
      view.setUint16(p1 + 20, 0, true);
      view.setUint16(p1 + 22, 255, true);
      view.setUint16(p1 + 24, 0, true);

      const result = parseLAS(buffer);
      expect(result.pointCount).toBe(2);
      expect(result.positions[0]).toBeCloseTo(110.0);
      expect(result.positions[1]).toBeCloseTo(220.0);
      expect(result.positions[2]).toBeCloseTo(55.0);
      expect(result.positions[3]).toBeCloseTo(120.0);
      expect(result.positions[4]).toBeCloseTo(230.0);
      expect(result.positions[5]).toBeCloseTo(60.0);
      expect(result.colors).toBeDefined();
      expect(result.format).toBe("las");
    });

    it("throws an error when magic bytes are invalid", () => {
      const invalidBuffer = new ArrayBuffer(256);
      expect(() => parseLAS(invalidBuffer)).toThrow(/Invalid LAS signature/);
    });
  });

  describe("computePointBounds", () => {
    it("computes min, max, center, and radius correctly", () => {
      const positions = new Float32Array([
        -10, 0, 0,
        10, 0, 0,
      ]);
      const bounds = computePointBounds(positions);
      expect(bounds.min).toEqual([-10, 0, 0]);
      expect(bounds.max).toEqual([10, 0, 0]);
      expect(bounds.center).toEqual([0, 0, 0]);
      expect(bounds.dimensions).toEqual([20, 0, 0]);
      expect(bounds.radius).toBe(10);
    });
  });
});

describe("PointCloudMeshConverter", () => {
  it("converts raw point clouds into an oriented surfel quad mesh with vertices and faces", () => {
    const rawData: PointCloudData = {
      positions: new Float32Array([
        0, 0, 0,
        5, 5, 5,
      ]),
      colors: new Float32Array([
        1, 0, 0,
        0, 1, 0,
      ]),
      pointCount: 2,
      bounds: {
        min: [0, 0, 0],
        max: [5, 5, 5],
        center: [2.5, 2.5, 2.5],
        dimensions: [5, 5, 5],
        radius: 4.33,
      },
      format: "xyz",
    };

    const geometry = pointCloudToMeshGeometry(rawData, { surfelRadius: 0.2 });

    // Each point produces 1 quad = 4 vertices and 2 triangular faces (6 indices)
    expect(geometry.attributes.position.count).toBe(8); // 2 * 4
    expect(geometry.index).toBeDefined();
    if (geometry.index) {
      expect(geometry.index.count).toBe(12); // 2 * 6
    }
    expect(geometry.attributes.normal).toBeDefined();
    expect(geometry.attributes.color).toBeDefined();
    expect(geometry.userData.isPointSurfelMesh).toBe(true);

    // Verify coordinate centering
    const box = geometry.boundingBox;
    expect(box).toBeDefined();
    if (box) {
      expect(box.min.x).toBeLessThan(0);
      expect(box.max.x).toBeGreaterThan(0);
    }

    disposeGeometry(geometry);
  });

  it("preserves native face topology when point data already contains indices", () => {
    const meshedData: PointCloudData = {
      positions: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ]),
      indices: new Uint32Array([0, 1, 2]),
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

    const geometry = pointCloudToMeshGeometry(meshedData);
    expect(geometry.attributes.position.count).toBe(3);
    expect(geometry.index?.count).toBe(3);
    expect(geometry.userData.isPointSurfelMesh).toBe(false);

    disposeGeometry(geometry);
  });

  it("detaches typed array buffers and disposes attributes to prevent memory leaks", () => {
    const rawData: PointCloudData = {
      positions: new Float32Array([0, 0, 0, 1, 1, 1]),
      pointCount: 2,
      bounds: {
        min: [0, 0, 0],
        max: [1, 1, 1],
        center: [0.5, 0.5, 0.5],
        dimensions: [1, 1, 1],
        radius: 0.86,
      },
      format: "xyz",
    };

    const geometry = pointCloudToMeshGeometry(rawData);
    const posAttr = geometry.getAttribute("position");
    expect(posAttr).toBeDefined();
    expect(posAttr.array).toBeDefined();

    disposeGeometry(geometry);

    // Verify typed array is detached from the attribute
    expect(posAttr.array).toBeNull();
    expect(geometry.getAttribute("position")).toBeUndefined();
  });
});

describe("PointCloudLoader - Memory Optimization & Streaming", () => {
  function createSyntheticLasBuffer(pointCount: number): ArrayBuffer {
    const headerSize = 227;
    const pointRecordLength = 26; // Point format 2 (has RGB)
    const buffer = new ArrayBuffer(headerSize + pointRecordLength * pointCount);
    const view = new DataView(buffer);

    // "LASF"
    view.setUint8(0, 0x4c);
    view.setUint8(1, 0x41);
    view.setUint8(2, 0x53);
    view.setUint8(3, 0x46);

    view.setUint32(96, headerSize, true);
    view.setUint8(104, 2);
    view.setUint16(105, pointRecordLength, true);
    view.setUint32(107, pointCount, true);

    // Scale
    view.setFloat64(131, 0.1, true);
    view.setFloat64(139, 0.1, true);
    view.setFloat64(147, 0.1, true);
    // Offset
    view.setFloat64(155, 0, true);
    view.setFloat64(163, 0, true);
    view.setFloat64(171, 0, true);

    for (let i = 0; i < pointCount; i++) {
      const p = headerSize + i * pointRecordLength;
      view.setInt32(p, i * 10, true);
      view.setInt32(p + 4, i * 20, true);
      view.setInt32(p + 8, i * 30, true);
      view.setUint16(p + 20, 255, true);
      view.setUint16(p + 22, 128, true);
      view.setUint16(p + 24, 64, true);
    }

    return buffer;
  }

  it("downsamples points on-the-fly when parsing LAS buffer exceeding maxPoints", () => {
    const buffer = createSyntheticLasBuffer(100);
    // Request maxPoints = 25 -> stride should be 4
    const result = parseLAS(buffer, { maxPoints: 25 });

    expect(result.pointCount).toBe(25);
    expect(result.positions.length).toBe(25 * 3);
    expect(result.colors?.length).toBe(25 * 3);
  });

  it("streams and chunks LAS data from File/Blob without loading monolithic buffer", async () => {
    const buffer = createSyntheticLasBuffer(100);
    const file = new File([buffer], "large_survey.las", { type: "application/octet-stream" });

    // Request maxPoints = 20
    const result = await parseLASFromFile(file, { maxPoints: 20 });

    expect(result.pointCount).toBe(20);
    expect(result.positions.length).toBe(20 * 3);
    expect(result.colors).toBeDefined();
    expect(result.format).toBe("las");
  });

  it("downsamples massive ASCII XYZ data on-the-fly without heap exhaustion", () => {
    // Generate 100 lines of XYZ data
    let xyzContent = "";
    for (let i = 0; i < 100; i++) {
      xyzContent += `${i} ${i * 2} ${i * 3} 255 128 64\n`;
    }

    const result = parseXYZ(xyzContent, { maxPoints: 10 });
    expect(result.pointCount).toBeLessThanOrEqual(20);
    expect(result.colors).toBeDefined();
  });

  it("streams and chunks binary PLY data from File/Blob without loading monolithic buffer", async () => {
    const buffer = createSyntheticBinaryPLYBuffer(100, true, true);
    const file = new File([buffer], "large_scan.ply", { type: "application/octet-stream" });

    // Request maxPoints = 25 -> stride should be 4
    const result = await parsePLYFromFile(file, { maxPoints: 25 });

    expect(result.pointCount).toBe(25);
    expect(result.positions.length).toBe(25 * 3);
    expect(result.normals).toBeDefined();
    expect(result.normals?.length).toBe(25 * 3);
    expect(result.colors).toBeDefined();
    expect(result.colors?.length).toBe(25 * 3);
    expect(result.format).toBe("ply");
  });

  it("streams and chunks ASCII PLY data from File/Blob without loading monolithic buffer", async () => {
    let asciiContent = `ply
format ascii 1.0
element vertex 50
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
end_header
`;
    for (let i = 0; i < 50; i++) {
      asciiContent += `${i} ${i * 2} ${i * 3} 255 128 64\n`;
    }

    const file = new File([asciiContent], "ascii_scan.ply", { type: "text/plain" });
    const result = await parsePLYFromFile(file, { maxPoints: 10 });

    expect(result.pointCount).toBe(10);
    expect(result.positions.length).toBe(30);
    expect(result.colors).toBeDefined();
    expect(result.colors?.length).toBe(30);
    expect(result.format).toBe("ply");
  });

  it("streams massive ASCII XYZ files via parseXYZFromFile with chunking", async () => {
    let xyzContent = "";
    for (let i = 0; i < 100; i++) {
      xyzContent += `${i} ${i * 2} ${i * 3} 255 128 64\n`;
    }

    const file = new File([xyzContent], "survey.xyz", { type: "text/plain" });
    const result = await parseXYZFromFile(file, { maxPoints: 20 });

    expect(result.pointCount).toBeLessThanOrEqual(25);
    expect(result.positions.length).toBe(result.pointCount * 3);
    expect(result.colors).toBeDefined();
    expect(result.format).toBe("xyz");
  });

  it("loadPointCloudFile dispatches .ply files to parsePLYFromFile safely", async () => {
    const buffer = createSyntheticBinaryPLYBuffer(60, true, true);
    const file = new File([buffer], "site_photogrammetry.ply", { type: "application/octet-stream" });

    const result = await loadPointCloudFile(file, { maxPoints: 20 });
    expect(result.pointCount).toBe(20);
    expect(result.format).toBe("ply");
  });
});

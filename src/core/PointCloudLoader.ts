import { parse as loadersParse } from "@loaders.gl/core";
import { LASLoader } from "@loaders.gl/las";
import { PointCloudData } from "../types/pointCloud";

/**
 * Calculates bounding box metrics for an array of 3D positions.
 */
export function computePointBounds(positions: Float32Array): PointCloudData["bounds"] {
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
 * Parses raw text or ASCII .xyz LiDAR data, stripping comments and headers.
 * Uses index scanning and typed buffers with on-the-fly stride downsampling
 * to prevent V8 string explosion and memory exhaustion.
 */
export function parseXYZ(
  content: string,
  options: { maxPoints?: number } = {}
): PointCloudData {
  const maxPoints = options.maxPoints ?? 500000;

  // Fast estimate of line count to determine stride upfront
  let newlineCount = 0;
  const sampleLen = Math.min(100000, content.length);
  for (let i = 0; i < sampleLen; i++) {
    if (content.charCodeAt(i) === 10) newlineCount++;
  }
  const estimatedTotalLines = newlineCount > 0
    ? Math.max(1, Math.round((content.length / sampleLen) * newlineCount))
    : 1000;

  const stride = estimatedTotalLines > maxPoints ? Math.ceil(estimatedTotalLines / maxPoints) : 1;

  // Pre-allocate initial capacity
  const initialCap = Math.min(maxPoints, Math.max(1024, Math.floor(estimatedTotalLines / stride)));
  let posBuffer = new Float32Array(initialCap * 3);
  let colBuffer = new Float32Array(initialCap * 3);
  let normBuffer = new Float32Array(initialCap * 3);

  let hasColors = false;
  let hasNormals = false;
  let count = 0;
  let lineIdx = 0;

  let pos = 0;
  const len = content.length;

  while (pos < len) {
    let nextNewline = content.indexOf("\n", pos);
    if (nextNewline === -1) nextNewline = len;

    let line = content.substring(pos, nextNewline).trim();
    pos = nextNewline + 1;

    // Strip comments and empty lines
    if (!line || line.charCodeAt(0) === 35 /* '#' */ || line.startsWith("//")) {
      continue;
    }

    lineIdx++;
    if (stride > 1 && lineIdx % stride !== 0) {
      continue;
    }

    // Split on whitespace or commas
    const parts = line.split(/[\s,]+/);
    if (parts.length < 3) continue;

    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    const z = parseFloat(parts[2]);

    if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

    if (count >= posBuffer.length / 3) {
      const newCap = (posBuffer.length / 3) * 2;
      const newPos = new Float32Array(newCap * 3);
      newPos.set(posBuffer);
      posBuffer = newPos;

      const newCol = new Float32Array(newCap * 3);
      newCol.set(colBuffer);
      colBuffer = newCol;

      const newNorm = new Float32Array(newCap * 3);
      newNorm.set(normBuffer);
      normBuffer = newNorm;
    }

    const idx = count * 3;
    posBuffer[idx] = x;
    posBuffer[idx + 1] = y;
    posBuffer[idx + 2] = z;

    // Parse optional attributes (RGB colors or normals)
    if (parts.length >= 6) {
      const v3 = parseFloat(parts[3]);
      const v4 = parseFloat(parts[4]);
      const v5 = parseFloat(parts[5]);

      if (!isNaN(v3) && !isNaN(v4) && !isNaN(v5)) {
        if (v3 > 1.0 || v4 > 1.0 || v5 > 1.0) {
          // 8-bit RGB [0..255]
          hasColors = true;
          colBuffer[idx] = v3 / 255;
          colBuffer[idx + 1] = v4 / 255;
          colBuffer[idx + 2] = v5 / 255;
        } else if (parts.length >= 7) {
          hasColors = true;
          colBuffer[idx] = v3;
          colBuffer[idx + 1] = v4;
          colBuffer[idx + 2] = v5;
        } else {
          hasNormals = true;
          normBuffer[idx] = v3;
          normBuffer[idx + 1] = v4;
          normBuffer[idx + 2] = v5;
        }
      }
    }

    count++;
  }

  const positions = posBuffer.slice(0, count * 3);
  const colors = hasColors ? colBuffer.slice(0, count * 3) : undefined;
  const normals = hasNormals ? normBuffer.slice(0, count * 3) : undefined;
  const bounds = computePointBounds(positions);

  return {
    positions,
    colors,
    normals,
    pointCount: count,
    bounds,
    format: "xyz",
  };
}

export interface PLYHeaderProperty {
  name: string;
  type: string;
  size: number;
  isList: boolean;
  countType?: string;
  countSize?: number;
  itemType?: string;
  itemSize?: number;
  offset: number;
}

export interface PLYHeaderElement {
  name: string;
  count: number;
  properties: PLYHeaderProperty[];
  recordByteLength: number;
  isFixedSize: boolean;
}

export interface PLYHeader {
  format: "ascii" | "binary_little_endian" | "binary_big_endian";
  version: string;
  elements: PLYHeaderElement[];
  headerByteLength: number;
  vertexElement?: PLYHeaderElement;
  faceElement?: PLYHeaderElement;
}

export function getPLYTypeSize(type: string): number {
  switch (type.toLowerCase()) {
    case "char":
    case "int8":
    case "uchar":
    case "uint8":
      return 1;
    case "short":
    case "int16":
    case "ushort":
    case "uint16":
      return 2;
    case "int":
    case "int32":
    case "uint":
    case "uint32":
    case "float":
    case "float32":
      return 4;
    case "double":
    case "float64":
      return 8;
    default:
      return 4;
  }
}

export function readBinaryNumber(
  view: DataView,
  offset: number,
  type: string,
  littleEndian: boolean
): number {
  switch (type.toLowerCase()) {
    case "char":
    case "int8":
      return view.getInt8(offset);
    case "uchar":
    case "uint8":
      return view.getUint8(offset);
    case "short":
    case "int16":
      return view.getInt16(offset, littleEndian);
    case "ushort":
    case "uint16":
      return view.getUint16(offset, littleEndian);
    case "int":
    case "int32":
      return view.getInt32(offset, littleEndian);
    case "uint":
    case "uint32":
      return view.getUint32(offset, littleEndian);
    case "float":
    case "float32":
      return view.getFloat32(offset, littleEndian);
    case "double":
    case "float64":
      return view.getFloat64(offset, littleEndian);
    default:
      return view.getFloat32(offset, littleEndian);
  }
}

export function readBinaryNormalizedColor(
  view: DataView,
  offset: number,
  type: string,
  littleEndian: boolean
): number {
  const val = readBinaryNumber(view, offset, type, littleEndian);
  const t = type.toLowerCase();
  if (t === "uchar" || t === "uint8") {
    return val / 255;
  }
  if (t === "ushort" || t === "uint16") {
    return val / 65535;
  }
  if (t === "float" || t === "float32" || t === "double" || t === "float64") {
    return Math.max(0, Math.min(1, val));
  }
  return val > 1.0 ? val / 255 : Math.max(0, Math.min(1, val));
}

function findProperty(properties: PLYHeaderProperty[], candidates: string[]): PLYHeaderProperty | undefined {
  const lowerCandidates = candidates.map((c) => c.toLowerCase());
  return properties.find((p) => lowerCandidates.includes(p.name.toLowerCase()));
}

/**
 * Parses the ASCII header section of a PLY file and returns structured element and property metadata.
 */
export function parsePLYHeader(headerBytes: Uint8Array): PLYHeader {
  let i = 0;
  let line = "";
  const lines: string[] = [];
  let headerByteLength = 0;

  while (i < headerBytes.length) {
    const byte = headerBytes[i++];
    if (byte === 10 /* \n */ || byte === 13 /* \r */) {
      const trimmed = line.trim();
      if (trimmed === "end_header") {
        if (byte === 13 && i < headerBytes.length && headerBytes[i] === 10) {
          i++;
        }
        headerByteLength = i;
        break;
      }
      if (trimmed.length > 0) {
        lines.push(trimmed);
      }
      line = "";
    } else {
      line += String.fromCharCode(byte);
    }
  }

  if (headerByteLength === 0) {
    throw new Error("Invalid PLY file: 'end_header' delimiter not found in header.");
  }

  let format: "ascii" | "binary_little_endian" | "binary_big_endian" = "binary_little_endian";
  let version = "1.0";
  const elements: PLYHeaderElement[] = [];
  let currentElement: PLYHeaderElement | null = null;

  for (const lineText of lines) {
    const parts = lineText.split(/\s+/);
    const keyword = parts[0].toLowerCase();

    if (keyword === "format") {
      format = parts[1].toLowerCase() as any;
      version = parts[2] || "1.0";
    } else if (keyword === "element") {
      const name = parts[1].toLowerCase();
      const count = parseInt(parts[2], 10);
      currentElement = {
        name,
        count: isNaN(count) ? 0 : count,
        properties: [],
        recordByteLength: 0,
        isFixedSize: true,
      };
      elements.push(currentElement);
    } else if (keyword === "property" && currentElement) {
      if (parts[1].toLowerCase() === "list") {
        // property list <countType> <itemType> <name>
        const countType = parts[2].toLowerCase();
        const itemType = parts[3].toLowerCase();
        const name = parts[4];
        const countSize = getPLYTypeSize(countType);
        const itemSize = getPLYTypeSize(itemType);
        currentElement.properties.push({
          name,
          type: "list",
          size: 0,
          isList: true,
          countType,
          countSize,
          itemType,
          itemSize,
          offset: currentElement.recordByteLength,
        });
        currentElement.isFixedSize = false;
      } else {
        // property <type> <name>
        const type = parts[1].toLowerCase();
        const name = parts[2];
        const size = getPLYTypeSize(type);
        currentElement.properties.push({
          name,
          type,
          size,
          isList: false,
          offset: currentElement.recordByteLength,
        });
        currentElement.recordByteLength += size;
      }
    }
  }

  const vertexElement = elements.find((el) => el.name === "vertex");
  const faceElement = elements.find((el) => el.name === "face");

  return {
    format,
    version,
    elements,
    headerByteLength,
    vertexElement,
    faceElement,
  };
}

/**
 * Memory-safe parser for .ply buffers in memory.
 * Reads coordinates, normals, colors, and face indices directly into typed arrays
 * without intermediate JavaScript objects or array resizing.
 */
export function parsePLY(
  buffer: ArrayBuffer,
  options: { maxPoints?: number } = {}
): PointCloudData {
  const maxPoints = options.maxPoints ?? 500000;
  const headerSlice = new Uint8Array(buffer, 0, Math.min(131072, buffer.byteLength));
  const header = parsePLYHeader(headerSlice);

  const vertexElement = header.vertexElement;
  if (!vertexElement || vertexElement.count <= 0) {
    throw new Error("Invalid PLY file: No vertex records found.");
  }

  const xProp = findProperty(vertexElement.properties, ["x", "px", "posx", "pos_x"]);
  const yProp = findProperty(vertexElement.properties, ["y", "py", "posy", "pos_y"]);
  const zProp = findProperty(vertexElement.properties, ["z", "pz", "posz", "pos_z"]);

  if (!xProp || !yProp || !zProp) {
    throw new Error("Invalid PLY file: Missing vertex position coordinates (x, y, z).");
  }

  const nxProp = findProperty(vertexElement.properties, ["nx", "normalx", "normal_x"]);
  const nyProp = findProperty(vertexElement.properties, ["ny", "normaly", "normal_y"]);
  const nzProp = findProperty(vertexElement.properties, ["nz", "normalz", "normal_z"]);
  const hasNormals = Boolean(nxProp && nyProp && nzProp);

  const rProp = findProperty(vertexElement.properties, ["red", "r", "diffuse_red", "diffuse_r"]);
  const gProp = findProperty(vertexElement.properties, ["green", "g", "diffuse_green", "diffuse_g"]);
  const bProp = findProperty(vertexElement.properties, ["blue", "b", "diffuse_blue", "diffuse_b"]);
  const hasColors = Boolean(rProp && gProp && bProp);

  const vertexCount = vertexElement.count;
  const stride = vertexCount > maxPoints ? Math.ceil(vertexCount / maxPoints) : 1;
  const pointsToLoad = Math.floor(vertexCount / stride);

  const positions = new Float32Array(pointsToLoad * 3);
  const normals = hasNormals ? new Float32Array(pointsToLoad * 3) : undefined;
  const colors = hasColors ? new Float32Array(pointsToLoad * 3) : undefined;
  let indices: Uint32Array | undefined;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let loadedPoints = 0;

  if (header.format === "ascii") {
    const text = new TextDecoder().decode(new Uint8Array(buffer, header.headerByteLength));
    const lines = text.split(/\r\n|\n|\r/);

    const propNames = vertexElement.properties.map((p) => p.name.toLowerCase());
    const xIdx = propNames.findIndex((n) => ["x", "px", "posx", "pos_x"].includes(n));
    const yIdx = propNames.findIndex((n) => ["y", "py", "posy", "pos_y"].includes(n));
    const zIdx = propNames.findIndex((n) => ["z", "pz", "posz", "pos_z"].includes(n));
    const nxIdx = propNames.findIndex((n) => ["nx", "normalx", "normal_x"].includes(n));
    const nyIdx = propNames.findIndex((n) => ["ny", "normaly", "normal_y"].includes(n));
    const nzIdx = propNames.findIndex((n) => ["nz", "normalz", "normal_z"].includes(n));
    const rIdx = propNames.findIndex((n) => ["red", "r", "diffuse_red", "diffuse_r"].includes(n));
    const gIdx = propNames.findIndex((n) => ["green", "g", "diffuse_green", "diffuse_g"].includes(n));
    const bIdx = propNames.findIndex((n) => ["blue", "b", "diffuse_blue", "diffuse_b"].includes(n));

    const isUcharColor = rIdx >= 0 && ["uchar", "uint8"].includes(vertexElement.properties[rIdx].type.toLowerCase());
    const indexList: number[] = [];

    let currentV = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (currentV < vertexCount) {
        if (currentV % stride === 0 && loadedPoints < pointsToLoad) {
          const parts = line.split(/[\s,]+/);
          if (parts.length > Math.max(xIdx, yIdx, zIdx)) {
            const x = parseFloat(parts[xIdx]);
            const y = parseFloat(parts[yIdx]);
            const z = parseFloat(parts[zIdx]);

            if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
              const outIdx = loadedPoints * 3;
              positions[outIdx] = x;
              positions[outIdx + 1] = y;
              positions[outIdx + 2] = z;

              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (z < minZ) minZ = z;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
              if (z > maxZ) maxZ = z;

              if (hasNormals && normals && parts.length > Math.max(nxIdx, nyIdx, nzIdx)) {
                normals[outIdx] = parseFloat(parts[nxIdx]) || 0;
                normals[outIdx + 1] = parseFloat(parts[nyIdx]) || 0;
                normals[outIdx + 2] = parseFloat(parts[nzIdx]) || 0;
              }

              if (hasColors && colors && parts.length > Math.max(rIdx, gIdx, bIdx)) {
                const r = parseFloat(parts[rIdx]);
                const g = parseFloat(parts[gIdx]);
                const b = parseFloat(parts[bIdx]);
                colors[outIdx] = isUcharColor || r > 1.0 ? r / 255 : r;
                colors[outIdx + 1] = isUcharColor || g > 1.0 ? g / 255 : g;
                colors[outIdx + 2] = isUcharColor || b > 1.0 ? b / 255 : b;
              }

              loadedPoints++;
            }
          }
        }
        currentV++;
      } else if (stride === 1 && header.faceElement && header.faceElement.count > 0) {
        const parts = line.split(/[\s,]+/);
        if (parts.length >= 4) {
          const count = parseInt(parts[0], 10);
          if (count === 3 && parts.length >= 4) {
            indexList.push(parseInt(parts[1], 10), parseInt(parts[2], 10), parseInt(parts[3], 10));
          } else if (count === 4 && parts.length >= 5) {
            const i0 = parseInt(parts[1], 10);
            const i1 = parseInt(parts[2], 10);
            const i2 = parseInt(parts[3], 10);
            const i3 = parseInt(parts[4], 10);
            indexList.push(i0, i1, i2);
            indexList.push(i0, i2, i3);
          }
        }
      }
    }

    if (indexList.length > 0) {
      indices = new Uint32Array(indexList);
    }
  } else {
    // Binary little or big endian
    const littleEndian = header.format === "binary_little_endian";
    const view = new DataView(buffer);
    const recordByteLength = vertexElement.recordByteLength;

    for (let v = 0; v < vertexCount && loadedPoints < pointsToLoad; v++) {
      if (v % stride === 0) {
        const offset = header.headerByteLength + v * recordByteLength;

        const x = readBinaryNumber(view, offset + xProp.offset, xProp.type, littleEndian);
        const y = readBinaryNumber(view, offset + yProp.offset, yProp.type, littleEndian);
        const z = readBinaryNumber(view, offset + zProp.offset, zProp.type, littleEndian);

        const outIdx = loadedPoints * 3;
        positions[outIdx] = x;
        positions[outIdx + 1] = y;
        positions[outIdx + 2] = z;

        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;

        if (hasNormals && normals && nxProp && nyProp && nzProp) {
          normals[outIdx] = readBinaryNumber(view, offset + nxProp.offset, nxProp.type, littleEndian);
          normals[outIdx + 1] = readBinaryNumber(view, offset + nyProp.offset, nyProp.type, littleEndian);
          normals[outIdx + 2] = readBinaryNumber(view, offset + nzProp.offset, nzProp.type, littleEndian);
        }

        if (hasColors && colors && rProp && gProp && bProp) {
          colors[outIdx] = readBinaryNormalizedColor(view, offset + rProp.offset, rProp.type, littleEndian);
          colors[outIdx + 1] = readBinaryNormalizedColor(view, offset + gProp.offset, gProp.type, littleEndian);
          colors[outIdx + 2] = readBinaryNormalizedColor(view, offset + bProp.offset, bProp.type, littleEndian);
        }

        loadedPoints++;
      }
    }

    if (stride === 1 && header.faceElement && header.faceElement.count > 0) {
      const faceStartByte = header.headerByteLength + vertexCount * recordByteLength;
      const listProp = header.faceElement.properties.find((p) => p.isList);
      if (listProp && listProp.countType && listProp.itemType) {
        const indexList: number[] = [];
        let loc = faceStartByte;

        for (let f = 0; f < header.faceElement.count && loc < view.byteLength; f++) {
          const count = readBinaryNumber(view, loc, listProp.countType, littleEndian);
          loc += listProp.countSize!;

          const faceIndices: number[] = [];
          for (let j = 0; j < count && loc < view.byteLength; j++) {
            const idx = readBinaryNumber(view, loc, listProp.itemType, littleEndian);
            loc += listProp.itemSize!;
            faceIndices.push(idx);
          }

          if (count === 3) {
            indexList.push(faceIndices[0], faceIndices[1], faceIndices[2]);
          } else if (count === 4) {
            indexList.push(faceIndices[0], faceIndices[1], faceIndices[2]);
            indexList.push(faceIndices[0], faceIndices[2], faceIndices[3]);
          }
        }

        if (indexList.length > 0) {
          indices = new Uint32Array(indexList);
        }
      }
    }
  }

  const cx = isFinite(minX) ? (minX + maxX) / 2 : 0;
  const cy = isFinite(minY) ? (minY + maxY) / 2 : 0;
  const cz = isFinite(minZ) ? (minZ + maxZ) / 2 : 0;
  const dx = isFinite(maxX) ? maxX - minX : 0;
  const dy = isFinite(maxY) ? maxY - minY : 0;
  const dz = isFinite(maxZ) ? maxZ - minZ : 0;
  const radius = Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;

  return {
    positions: loadedPoints === pointsToLoad ? positions : positions.slice(0, loadedPoints * 3),
    normals: normals ? (loadedPoints === pointsToLoad ? normals : normals.slice(0, loadedPoints * 3)) : undefined,
    colors: colors ? (loadedPoints === pointsToLoad ? colors : colors.slice(0, loadedPoints * 3)) : undefined,
    indices,
    pointCount: loadedPoints,
    bounds: {
      min: [isFinite(minX) ? minX : 0, isFinite(minY) ? minY : 0, isFinite(minZ) ? minZ : 0],
      max: [isFinite(maxX) ? maxX : 0, isFinite(maxY) ? maxY : 0, isFinite(maxZ) ? maxZ : 0],
      center: [cx, cy, cz],
      dimensions: [dx, dy, dz],
      radius,
    },
    format: "ply",
  };
}

/**
 * Asynchronously streams line-by-line from a File or Blob in 4 MB chunks
 * without loading the whole file as a multi-gigabyte string.
 */
export async function* readLinesFromFile(
  file: File | Blob,
  startByte = 0
): AsyncGenerator<string> {
  const CHUNK_SIZE = 4 * 1024 * 1024;
  let offset = startByte;
  let remainder = "";
  const decoder = new TextDecoder();

  while (offset < file.size) {
    const end = Math.min(file.size, offset + CHUNK_SIZE);
    const slice = file.slice(offset, end);
    const buffer = await slice.arrayBuffer();
    const text = remainder + decoder.decode(buffer, { stream: end < file.size });
    offset = end;

    const lines = text.split(/\r\n|\n|\r/);
    if (offset < file.size) {
      remainder = lines.pop() ?? "";
    } else {
      remainder = "";
    }

    for (const line of lines) {
      yield line;
    }
  }

  if (remainder) {
    yield remainder;
  }
}

/**
 * Chunked streaming parser for PLY (.ply) files directly from a File or Blob.
 * Slices binary PLY in small 16 MB chunks or streams ASCII lines in 4 MB chunks.
 * Performs on-the-fly stride downsampling to prevent V8 heap exhaustion and Linux OOM crashes
 * on large (1.3+ GB) LiDAR and photogrammetry point clouds.
 */
export async function parsePLYFromFile(
  file: File | Blob,
  options: { maxPoints?: number } = {}
): Promise<PointCloudData> {
  const maxPoints = options.maxPoints ?? 500000;

  // 1. Read first 128 KB to parse PLY header
  const initialHeaderSize = Math.min(131072, file.size);
  const headerSlice = await file.slice(0, initialHeaderSize).arrayBuffer();
  const header = parsePLYHeader(new Uint8Array(headerSlice));

  const vertexElement = header.vertexElement;
  if (!vertexElement || vertexElement.count <= 0) {
    throw new Error("Invalid PLY file: No vertex records found.");
  }

  const xProp = findProperty(vertexElement.properties, ["x", "px", "posx", "pos_x"]);
  const yProp = findProperty(vertexElement.properties, ["y", "py", "posy", "pos_y"]);
  const zProp = findProperty(vertexElement.properties, ["z", "pz", "posz", "pos_z"]);

  if (!xProp || !yProp || !zProp) {
    throw new Error("Invalid PLY file: Missing vertex position coordinates (x, y, z).");
  }

  const nxProp = findProperty(vertexElement.properties, ["nx", "normalx", "normal_x"]);
  const nyProp = findProperty(vertexElement.properties, ["ny", "normaly", "normal_y"]);
  const nzProp = findProperty(vertexElement.properties, ["nz", "normalz", "normal_z"]);
  const hasNormals = Boolean(nxProp && nyProp && nzProp);

  const rProp = findProperty(vertexElement.properties, ["red", "r", "diffuse_red", "diffuse_r"]);
  const gProp = findProperty(vertexElement.properties, ["green", "g", "diffuse_green", "diffuse_g"]);
  const bProp = findProperty(vertexElement.properties, ["blue", "b", "diffuse_blue", "diffuse_b"]);
  const hasColors = Boolean(rProp && gProp && bProp);

  const vertexCount = vertexElement.count;
  const stride = vertexCount > maxPoints ? Math.ceil(vertexCount / maxPoints) : 1;
  const pointsToLoad = Math.floor(vertexCount / stride);

  const positions = new Float32Array(pointsToLoad * 3);
  const normals = hasNormals ? new Float32Array(pointsToLoad * 3) : undefined;
  const colors = hasColors ? new Float32Array(pointsToLoad * 3) : undefined;
  let indices: Uint32Array | undefined;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let loadedPoints = 0;

  if (header.format === "ascii") {
    const propNames = vertexElement.properties.map((p) => p.name.toLowerCase());
    const xIdx = propNames.findIndex((n) => ["x", "px", "posx", "pos_x"].includes(n));
    const yIdx = propNames.findIndex((n) => ["y", "py", "posy", "pos_y"].includes(n));
    const zIdx = propNames.findIndex((n) => ["z", "pz", "posz", "pos_z"].includes(n));
    const nxIdx = propNames.findIndex((n) => ["nx", "normalx", "normal_x"].includes(n));
    const nyIdx = propNames.findIndex((n) => ["ny", "normaly", "normal_y"].includes(n));
    const nzIdx = propNames.findIndex((n) => ["nz", "normalz", "normal_z"].includes(n));
    const rIdx = propNames.findIndex((n) => ["red", "r", "diffuse_red", "diffuse_r"].includes(n));
    const gIdx = propNames.findIndex((n) => ["green", "g", "diffuse_green", "diffuse_g"].includes(n));
    const bIdx = propNames.findIndex((n) => ["blue", "b", "diffuse_blue", "diffuse_b"].includes(n));

    const isUcharColor = rIdx >= 0 && ["uchar", "uint8"].includes(vertexElement.properties[rIdx].type.toLowerCase());
    const indexList: number[] = [];

    let currentV = 0;
    for await (const line of readLinesFromFile(file, header.headerByteLength)) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (currentV < vertexCount) {
        if (currentV % stride === 0 && loadedPoints < pointsToLoad) {
          const parts = trimmed.split(/[\s,]+/);
          if (parts.length > Math.max(xIdx, yIdx, zIdx)) {
            const x = parseFloat(parts[xIdx]);
            const y = parseFloat(parts[yIdx]);
            const z = parseFloat(parts[zIdx]);

            if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
              const outIdx = loadedPoints * 3;
              positions[outIdx] = x;
              positions[outIdx + 1] = y;
              positions[outIdx + 2] = z;

              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (z < minZ) minZ = z;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
              if (z > maxZ) maxZ = z;

              if (hasNormals && normals && parts.length > Math.max(nxIdx, nyIdx, nzIdx)) {
                normals[outIdx] = parseFloat(parts[nxIdx]) || 0;
                normals[outIdx + 1] = parseFloat(parts[nyIdx]) || 0;
                normals[outIdx + 2] = parseFloat(parts[nzIdx]) || 0;
              }

              if (hasColors && colors && parts.length > Math.max(rIdx, gIdx, bIdx)) {
                const r = parseFloat(parts[rIdx]);
                const g = parseFloat(parts[gIdx]);
                const b = parseFloat(parts[bIdx]);
                colors[outIdx] = isUcharColor || r > 1.0 ? r / 255 : r;
                colors[outIdx + 1] = isUcharColor || g > 1.0 ? g / 255 : g;
                colors[outIdx + 2] = isUcharColor || b > 1.0 ? b / 255 : b;
              }

              loadedPoints++;
            }
          }
        }
        currentV++;
      } else if (stride === 1 && header.faceElement && header.faceElement.count > 0) {
        const parts = trimmed.split(/[\s,]+/);
        if (parts.length >= 4) {
          const count = parseInt(parts[0], 10);
          if (count === 3 && parts.length >= 4) {
            indexList.push(parseInt(parts[1], 10), parseInt(parts[2], 10), parseInt(parts[3], 10));
          } else if (count === 4 && parts.length >= 5) {
            const i0 = parseInt(parts[1], 10);
            const i1 = parseInt(parts[2], 10);
            const i2 = parseInt(parts[3], 10);
            const i3 = parseInt(parts[4], 10);
            indexList.push(i0, i1, i2);
            indexList.push(i0, i2, i3);
          }
        }
      }
    }

    if (indexList.length > 0) {
      indices = new Uint32Array(indexList);
    }
  } else {
    // Binary little or big endian streaming
    const littleEndian = header.format === "binary_little_endian";
    const recordByteLength = vertexElement.recordByteLength;

    if (recordByteLength <= 0) {
      throw new Error("Invalid PLY file: Binary vertex record byte length is 0.");
    }

    // Process in 16 MB chunks
    const CHUNK_SIZE = 16 * 1024 * 1024;
    const recordsPerChunk = Math.max(1, Math.floor(CHUNK_SIZE / recordByteLength));

    let currentVertexIndex = 0;

    while (currentVertexIndex < vertexCount && loadedPoints < pointsToLoad) {
      const chunkStart = currentVertexIndex;
      const chunkEnd = Math.min(vertexCount, chunkStart + recordsPerChunk);
      const byteStart = header.headerByteLength + chunkStart * recordByteLength;
      const byteEnd = header.headerByteLength + chunkEnd * recordByteLength;

      const chunkBlob = file.slice(byteStart, byteEnd);
      const chunkBuffer = await chunkBlob.arrayBuffer();
      const chunkView = new DataView(chunkBuffer);

      for (let v = chunkStart; v < chunkEnd && loadedPoints < pointsToLoad; v++) {
        if (v % stride === 0) {
          const recordOffset = (v - chunkStart) * recordByteLength;

          const x = readBinaryNumber(chunkView, recordOffset + xProp.offset, xProp.type, littleEndian);
          const y = readBinaryNumber(chunkView, recordOffset + yProp.offset, yProp.type, littleEndian);
          const z = readBinaryNumber(chunkView, recordOffset + zProp.offset, zProp.type, littleEndian);

          const outIdx = loadedPoints * 3;
          positions[outIdx] = x;
          positions[outIdx + 1] = y;
          positions[outIdx + 2] = z;

          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (z < minZ) minZ = z;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          if (z > maxZ) maxZ = z;

          if (hasNormals && normals && nxProp && nyProp && nzProp) {
            normals[outIdx] = readBinaryNumber(chunkView, recordOffset + nxProp.offset, nxProp.type, littleEndian);
            normals[outIdx + 1] = readBinaryNumber(chunkView, recordOffset + nyProp.offset, nyProp.type, littleEndian);
            normals[outIdx + 2] = readBinaryNumber(chunkView, recordOffset + nzProp.offset, nzProp.type, littleEndian);
          }

          if (hasColors && colors && rProp && gProp && bProp) {
            colors[outIdx] = readBinaryNormalizedColor(chunkView, recordOffset + rProp.offset, rProp.type, littleEndian);
            colors[outIdx + 1] = readBinaryNormalizedColor(chunkView, recordOffset + gProp.offset, gProp.type, littleEndian);
            colors[outIdx + 2] = readBinaryNormalizedColor(chunkView, recordOffset + bProp.offset, bProp.type, littleEndian);
          }

          loadedPoints++;
        }
      }

      currentVertexIndex = chunkEnd;
    }

    if (stride === 1 && header.faceElement && header.faceElement.count > 0) {
      const faceStartByte = header.headerByteLength + vertexCount * recordByteLength;
      if (file.size > faceStartByte) {
        const listProp = header.faceElement.properties.find((p) => p.isList);
        if (listProp && listProp.countType && listProp.itemType) {
          const faceSlice = file.slice(faceStartByte);
          const faceBuffer = await faceSlice.arrayBuffer();
          const faceView = new DataView(faceBuffer);
          const indexList: number[] = [];
          let loc = 0;

          for (let f = 0; f < header.faceElement.count && loc < faceView.byteLength; f++) {
            const count = readBinaryNumber(faceView, loc, listProp.countType, littleEndian);
            loc += listProp.countSize!;

            const faceIndices: number[] = [];
            for (let j = 0; j < count && loc < faceView.byteLength; j++) {
              const idx = readBinaryNumber(faceView, loc, listProp.itemType, littleEndian);
              loc += listProp.itemSize!;
              faceIndices.push(idx);
            }

            if (count === 3) {
              indexList.push(faceIndices[0], faceIndices[1], faceIndices[2]);
            } else if (count === 4) {
              indexList.push(faceIndices[0], faceIndices[1], faceIndices[2]);
              indexList.push(faceIndices[0], faceIndices[2], faceIndices[3]);
            }
          }

          if (indexList.length > 0) {
            indices = new Uint32Array(indexList);
          }
        }
      }
    }
  }

  const cx = isFinite(minX) ? (minX + maxX) / 2 : 0;
  const cy = isFinite(minY) ? (minY + maxY) / 2 : 0;
  const cz = isFinite(minZ) ? (minZ + maxZ) / 2 : 0;
  const dx = isFinite(maxX) ? maxX - minX : 0;
  const dy = isFinite(maxY) ? maxY - minY : 0;
  const dz = isFinite(maxZ) ? maxZ - minZ : 0;
  const radius = Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;

  return {
    positions: loadedPoints === pointsToLoad ? positions : positions.slice(0, loadedPoints * 3),
    normals: normals ? (loadedPoints === pointsToLoad ? normals : normals.slice(0, loadedPoints * 3)) : undefined,
    colors: colors ? (loadedPoints === pointsToLoad ? colors : colors.slice(0, loadedPoints * 3)) : undefined,
    indices,
    pointCount: loadedPoints,
    bounds: {
      min: [isFinite(minX) ? minX : 0, isFinite(minY) ? minY : 0, isFinite(minZ) ? minZ : 0],
      max: [isFinite(maxX) ? maxX : 0, isFinite(maxY) ? maxY : 0, isFinite(maxZ) ? maxZ : 0],
      center: [cx, cy, cz],
      dimensions: [dx, dy, dz],
      radius,
    },
    format: "ply",
  };
}

/**
 * Memory-safe parser for uncompressed binary ASPRS LAS (.las) LiDAR buffers.
 * Supports on-the-fly stride downsampling to prevent allocating gigabytes of unused points.
 */
export function parseLAS(
  buffer: ArrayBuffer,
  options: { maxPoints?: number } = {}
): PointCloudData {
  const maxPoints = options.maxPoints ?? 500000;
  const view = new DataView(buffer);

  // 1. Verify "LASF" magic bytes
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  );

  if (magic !== "LASF") {
    throw new Error(`Invalid LAS signature: expected 'LASF', received '${magic}'.`);
  }

  // 2. Read LAS Public Header
  const offsetToPointData = view.getUint32(96, true);
  const pointFormat = view.getUint8(104);
  const pointRecordLength = view.getUint16(105, true);
  let pointCount = view.getUint32(107, true);

  // If LAS 1.4 extended point count
  if (pointCount === 0 && buffer.byteLength >= 255) {
    const extendedCount = Number(view.getBigUint64(247, true));
    if (extendedCount > 0) {
      pointCount = extendedCount;
    }
  }

  // Scale and offset factors
  const scaleX = view.getFloat64(131, true);
  const scaleY = view.getFloat64(139, true);
  const scaleZ = view.getFloat64(147, true);
  const offsetX = view.getFloat64(155, true);
  const offsetY = view.getFloat64(163, true);
  const offsetZ = view.getFloat64(171, true);

  // Safeguard pointCount against buffer overrun
  const maxPossiblePoints = Math.floor((buffer.byteLength - offsetToPointData) / pointRecordLength);
  const actualPoints = Math.min(pointCount, maxPossiblePoints);

  if (actualPoints <= 0) {
    throw new Error("LAS buffer contains no point records.");
  }

  // Determine stride for downsampling
  const stride = actualPoints > maxPoints ? Math.ceil(actualPoints / maxPoints) : 1;
  const sampledCount = Math.floor(actualPoints / stride);

  const positions = new Float32Array(sampledCount * 3);

  // Check if format contains RGB color data
  const hasRGB = [2, 3, 5, 7, 8].includes(pointFormat);
  let rgbOffset = -1;
  if (pointFormat === 2) rgbOffset = 20;
  else if (pointFormat === 3) rgbOffset = 28;
  else if (pointFormat === 5) rgbOffset = 28;
  else if (pointFormat === 7 || pointFormat === 8) rgbOffset = 30;

  const colors = hasRGB && rgbOffset >= 0 ? new Float32Array(sampledCount * 3) : undefined;
  let maxColorVal = 0;

  // 3. Decode points with stride directly
  let targetIdx = 0;
  for (let i = 0; i < actualPoints && targetIdx < sampledCount; i += stride) {
    const currentOffset = offsetToPointData + i * pointRecordLength;

    const rawX = view.getInt32(currentOffset, true);
    const rawY = view.getInt32(currentOffset + 4, true);
    const rawZ = view.getInt32(currentOffset + 8, true);

    const outPos = targetIdx * 3;
    positions[outPos] = rawX * scaleX + offsetX;
    positions[outPos + 1] = rawY * scaleY + offsetY;
    positions[outPos + 2] = rawZ * scaleZ + offsetZ;

    if (colors && rgbOffset >= 0) {
      const r = view.getUint16(currentOffset + rgbOffset, true);
      const g = view.getUint16(currentOffset + rgbOffset + 2, true);
      const b = view.getUint16(currentOffset + rgbOffset + 4, true);

      colors[outPos] = r;
      colors[outPos + 1] = g;
      colors[outPos + 2] = b;

      if (r > maxColorVal) maxColorVal = r;
      if (g > maxColorVal) maxColorVal = g;
      if (b > maxColorVal) maxColorVal = b;
    }

    targetIdx++;
  }

  // Normalize colors to 0.0 - 1.0 range
  if (colors && maxColorVal > 0) {
    const divisor = maxColorVal > 255 ? 65535 : 255;
    for (let c = 0; c < colors.length; c++) {
      colors[c] = colors[c] / divisor;
    }
  }

  const bounds = computePointBounds(positions);

  return {
    positions,
    colors,
    pointCount: targetIdx,
    bounds,
    format: "las",
  };
}

/**
 * Chunked streaming parser for ASPRS LAS (.las) files directly from a File or Blob.
 * Slices the file in small 16 MB chunks to completely avoid loading the monolithic
 * 1.3+ GB file into JavaScript RAM, reducing peak memory by over 99%.
 */
export async function parseLASFromFile(
  file: File | Blob,
  options: { maxPoints?: number } = {}
): Promise<PointCloudData> {
  const maxPoints = options.maxPoints ?? 500000;

  // 1. Read header (375 bytes covers LAS 1.0 through LAS 1.4)
  const headerSlice = await file.slice(0, Math.min(375, file.size)).arrayBuffer();
  if (headerSlice.byteLength < 227) {
    throw new Error("File is too small to be a valid LAS file.");
  }
  const view = new DataView(headerSlice);

  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  );

  if (magic !== "LASF") {
    throw new Error(`Invalid LAS signature: expected 'LASF', received '${magic}'.`);
  }

  const offsetToPointData = view.getUint32(96, true);
  const pointFormat = view.getUint8(104);
  const pointRecordLength = view.getUint16(105, true);
  let pointCount = view.getUint32(107, true);

  if (pointCount === 0 && headerSlice.byteLength >= 255) {
    const extendedCount = Number(view.getBigUint64(247, true));
    if (extendedCount > 0) {
      pointCount = extendedCount;
    }
  }

  const scaleX = view.getFloat64(131, true);
  const scaleY = view.getFloat64(139, true);
  const scaleZ = view.getFloat64(147, true);
  const offsetX = view.getFloat64(155, true);
  const offsetY = view.getFloat64(163, true);
  const offsetZ = view.getFloat64(171, true);

  const maxXHeader = view.getFloat64(179, true);
  const minXHeader = view.getFloat64(187, true);
  const maxYHeader = view.getFloat64(195, true);
  const minYHeader = view.getFloat64(203, true);
  const maxZHeader = view.getFloat64(211, true);
  const minZHeader = view.getFloat64(219, true);

  const maxPossiblePoints = Math.floor((file.size - offsetToPointData) / pointRecordLength);
  const actualPoints = Math.min(pointCount, maxPossiblePoints);

  if (actualPoints <= 0) {
    throw new Error("LAS file contains no point records.");
  }

  const stride = actualPoints > maxPoints ? Math.ceil(actualPoints / maxPoints) : 1;
  const pointsToLoad = Math.floor(actualPoints / stride);

  const positions = new Float32Array(pointsToLoad * 3);

  const hasRGB = [2, 3, 5, 7, 8].includes(pointFormat);
  let rgbOffset = -1;
  if (pointFormat === 2) rgbOffset = 20;
  else if (pointFormat === 3) rgbOffset = 28;
  else if (pointFormat === 5) rgbOffset = 28;
  else if (pointFormat === 7 || pointFormat === 8) rgbOffset = 30;

  const colors = hasRGB && rgbOffset >= 0 ? new Float32Array(pointsToLoad * 3) : undefined;
  let maxColorVal = 0;

  // Process in 16 MB chunks
  const CHUNK_SIZE = 16 * 1024 * 1024;
  const recordsPerChunk = Math.max(1, Math.floor(CHUNK_SIZE / pointRecordLength));

  let loadedPoints = 0;
  let currentRecordIndex = 0;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  while (currentRecordIndex < actualPoints && loadedPoints < pointsToLoad) {
    const chunkStartRecord = currentRecordIndex;
    const chunkEndRecord = Math.min(actualPoints, chunkStartRecord + recordsPerChunk);
    const chunkByteStart = offsetToPointData + chunkStartRecord * pointRecordLength;
    const chunkByteEnd = offsetToPointData + chunkEndRecord * pointRecordLength;

    const chunkBlob = file.slice(chunkByteStart, chunkByteEnd);
    const chunkBuffer = await chunkBlob.arrayBuffer();
    const chunkView = new DataView(chunkBuffer);

    for (let r = chunkStartRecord; r < chunkEndRecord && loadedPoints < pointsToLoad; r++) {
      if (r % stride === 0) {
        const recordOffsetInChunk = (r - chunkStartRecord) * pointRecordLength;

        const rawX = chunkView.getInt32(recordOffsetInChunk, true);
        const rawY = chunkView.getInt32(recordOffsetInChunk + 4, true);
        const rawZ = chunkView.getInt32(recordOffsetInChunk + 8, true);

        const x = rawX * scaleX + offsetX;
        const y = rawY * scaleY + offsetY;
        const z = rawZ * scaleZ + offsetZ;

        const outIdx = loadedPoints * 3;
        positions[outIdx] = x;
        positions[outIdx + 1] = y;
        positions[outIdx + 2] = z;

        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;

        if (colors && rgbOffset >= 0) {
          const red = chunkView.getUint16(recordOffsetInChunk + rgbOffset, true);
          const green = chunkView.getUint16(recordOffsetInChunk + rgbOffset + 2, true);
          const blue = chunkView.getUint16(recordOffsetInChunk + rgbOffset + 4, true);

          colors[outIdx] = red;
          colors[outIdx + 1] = green;
          colors[outIdx + 2] = blue;

          if (red > maxColorVal) maxColorVal = red;
          if (green > maxColorVal) maxColorVal = green;
          if (blue > maxColorVal) maxColorVal = blue;
        }

        loadedPoints++;
      }
    }

    currentRecordIndex = chunkEndRecord;
  }

  // Normalize colors to 0.0 - 1.0 range
  if (colors && maxColorVal > 0) {
    const divisor = maxColorVal > 255 ? 65535 : 255;
    for (let c = 0; c < colors.length; c++) {
      colors[c] = colors[c] / divisor;
    }
  }

  const hasValidHeaderBounds =
    !isNaN(minXHeader) && !isNaN(maxXHeader) &&
    minXHeader < maxXHeader && minYHeader < maxYHeader;

  const finalMinX = hasValidHeaderBounds ? minXHeader : (isFinite(minX) ? minX : 0);
  const finalMaxX = hasValidHeaderBounds ? maxXHeader : (isFinite(maxX) ? maxX : 0);
  const finalMinY = hasValidHeaderBounds ? minYHeader : (isFinite(minY) ? minY : 0);
  const finalMaxY = hasValidHeaderBounds ? maxYHeader : (isFinite(maxY) ? maxY : 0);
  const finalMinZ = hasValidHeaderBounds ? minZHeader : (isFinite(minZ) ? minZ : 0);
  const finalMaxZ = hasValidHeaderBounds ? maxZHeader : (isFinite(maxZ) ? maxZ : 0);

  const cx = (finalMinX + finalMaxX) / 2;
  const cy = (finalMinY + finalMaxY) / 2;
  const cz = (finalMinZ + finalMaxZ) / 2;
  const dx = finalMaxX - finalMinX;
  const dy = finalMaxY - finalMinY;
  const dz = finalMaxZ - finalMinZ;
  const radius = Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;

  return {
    positions: loadedPoints === pointsToLoad ? positions : positions.slice(0, loadedPoints * 3),
    colors: colors ? (loadedPoints === pointsToLoad ? colors : colors.slice(0, loadedPoints * 3)) : undefined,
    pointCount: loadedPoints,
    bounds: {
      min: [finalMinX, finalMinY, finalMinZ],
      max: [finalMaxX, finalMaxY, finalMaxZ],
      center: [cx, cy, cz],
      dimensions: [dx, dy, dz],
      radius,
    },
    format: "las",
  };
}

/**
 * Parses compressed .laz (LASzip) LiDAR files using loaders.gl / laz-perf.
 * Decompresses the bitstream and formats points into PointCloudData with downsampling.
 */
export async function parseLAZ(
  buffer: ArrayBuffer,
  options: { maxPoints?: number } = {}
): Promise<PointCloudData> {
  const maxPoints = options.maxPoints ?? 500000;
  const result: any = await loadersParse(buffer, LASLoader, {
    las: { color: true, fp64: false },
    worker: false, // In-thread decoding
  });

  const rawPositions = result.attributes?.POSITION?.value;
  if (!rawPositions) {
    throw new Error("Failed to decompress LAZ file: No POSITION attribute found.");
  }

  const rawPointCount = rawPositions.length / 3;
  let positions: Float32Array;
  let colors: Float32Array | undefined;
  let pointCount = rawPointCount;

  const rawColors = result.attributes?.COLOR_0?.value;

  if (rawPointCount > maxPoints) {
    const stride = Math.ceil(rawPointCount / maxPoints);
    const downsampledCount = Math.floor(rawPointCount / stride);
    positions = new Float32Array(downsampledCount * 3);
    if (rawColors && rawColors.length >= rawPointCount * 3) {
      colors = new Float32Array(downsampledCount * 3);
    }

    const isNormalized = rawColors instanceof Float32Array;
    for (let target = 0, src = 0; src < rawPointCount && target < downsampledCount; src += stride, target++) {
      const srcIdx = src * 3;
      const targetIdx = target * 3;
      positions[targetIdx] = rawPositions[srcIdx];
      positions[targetIdx + 1] = rawPositions[srcIdx + 1];
      positions[targetIdx + 2] = rawPositions[srcIdx + 2];

      if (colors && rawColors) {
        colors[targetIdx] = isNormalized ? rawColors[srcIdx] : rawColors[srcIdx] / 255;
        colors[targetIdx + 1] = isNormalized ? rawColors[srcIdx + 1] : rawColors[srcIdx + 1] / 255;
        colors[targetIdx + 2] = isNormalized ? rawColors[srcIdx + 2] : rawColors[srcIdx + 2] / 255;
      }
    }
    pointCount = downsampledCount;
  } else {
    positions = rawPositions instanceof Float32Array ? rawPositions : new Float32Array(rawPositions);
    if (rawColors && rawColors.length >= pointCount * 3) {
      const isNormalized = rawColors instanceof Float32Array;
      if (isNormalized && rawColors instanceof Float32Array) {
        colors = rawColors;
      } else {
        colors = new Float32Array(pointCount * 3);
        for (let i = 0; i < pointCount * 3; i++) {
          colors[i] = isNormalized ? rawColors[i] : rawColors[i] / 255;
        }
      }
    }
  }

  const bounds = computePointBounds(positions);

  return {
    positions,
    colors,
    pointCount,
    bounds,
    format: "laz",
  };
}

/**
 * Memory-safe streaming parser for massive .xyz files directly from a File or Blob.
 * Slices the file in 4 MB chunks and streams line-by-line with stride downsampling,
 * preventing multi-gigabyte string allocations and V8 memory exhaustion.
 */
export async function parseXYZFromFile(
  file: File | Blob,
  options: { maxPoints?: number } = {}
): Promise<PointCloudData> {
  const maxPoints = options.maxPoints ?? 500000;

  // Read a small 64 KB sample to estimate line count and determine stride upfront
  const sampleSlice = await file.slice(0, Math.min(65536, file.size)).arrayBuffer();
  const sampleText = new TextDecoder().decode(sampleSlice);
  let newlineCount = 0;
  for (let i = 0; i < sampleText.length; i++) {
    if (sampleText.charCodeAt(i) === 10) newlineCount++;
  }
  const estimatedTotalLines = newlineCount > 0
    ? Math.max(1, Math.round((file.size / Math.max(1, sampleSlice.byteLength)) * newlineCount))
    : 1000;

  const stride = estimatedTotalLines > maxPoints ? Math.ceil(estimatedTotalLines / maxPoints) : 1;
  const initialCap = Math.min(maxPoints, Math.max(1024, Math.floor(estimatedTotalLines / stride)));

  let posBuffer = new Float32Array(initialCap * 3);
  let colBuffer = new Float32Array(initialCap * 3);
  let normBuffer = new Float32Array(initialCap * 3);

  let hasColors = false;
  let hasNormals = false;
  let count = 0;
  let lineIdx = 0;

  for await (const line of readLinesFromFile(file, 0)) {
    if (!line || line.charCodeAt(0) === 35 /* '#' */ || line.startsWith("//")) {
      continue;
    }

    lineIdx++;
    if (stride > 1 && lineIdx % stride !== 0) {
      continue;
    }

    const parts = line.split(/[\s,]+/);
    if (parts.length < 3) continue;

    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    const z = parseFloat(parts[2]);

    if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

    if (count >= posBuffer.length / 3) {
      const newCap = (posBuffer.length / 3) * 2;
      const newPos = new Float32Array(newCap * 3);
      newPos.set(posBuffer);
      posBuffer = newPos;

      const newCol = new Float32Array(newCap * 3);
      newCol.set(colBuffer);
      colBuffer = newCol;

      const newNorm = new Float32Array(newCap * 3);
      newNorm.set(normBuffer);
      normBuffer = newNorm;
    }

    const idx = count * 3;
    posBuffer[idx] = x;
    posBuffer[idx + 1] = y;
    posBuffer[idx + 2] = z;

    if (parts.length >= 6) {
      const v3 = parseFloat(parts[3]);
      const v4 = parseFloat(parts[4]);
      const v5 = parseFloat(parts[5]);

      if (!isNaN(v3) && !isNaN(v4) && !isNaN(v5)) {
        if (v3 > 1.0 || v4 > 1.0 || v5 > 1.0) {
          hasColors = true;
          colBuffer[idx] = v3 / 255;
          colBuffer[idx + 1] = v4 / 255;
          colBuffer[idx + 2] = v5 / 255;
        } else if (parts.length >= 7) {
          hasColors = true;
          colBuffer[idx] = v3;
          colBuffer[idx + 1] = v4;
          colBuffer[idx + 2] = v5;
        } else {
          hasNormals = true;
          normBuffer[idx] = v3;
          normBuffer[idx + 1] = v4;
          normBuffer[idx + 2] = v5;
        }
      }
    }

    count++;
  }

  const positions = posBuffer.slice(0, count * 3);
  const colors = hasColors ? colBuffer.slice(0, count * 3) : undefined;
  const normals = hasNormals ? normBuffer.slice(0, count * 3) : undefined;
  const bounds = computePointBounds(positions);

  return {
    positions,
    colors,
    normals,
    pointCount: count,
    bounds,
    format: "xyz",
  };
}

/**
 * Universal dispatcher for reading any uploaded LiDAR or photogrammetry file
 * (.ply, .las, .laz, .xyz), stripping its headers, and outputting PointCloudData.
 * Streams LAS and PLY files directly in chunks to prevent multi-gigabyte memory allocations.
 */
export async function loadPointCloudFile(
  file: File,
  options?: { maxPoints?: number }
): Promise<PointCloudData> {
  const name = file.name.toLowerCase();
  const maxPoints = options?.maxPoints ?? 500000;

  // Stream LAS files directly in chunks without loading the entire 1.3+ GB file as an ArrayBuffer
  if (name.endsWith(".las")) {
    return parseLASFromFile(file, { maxPoints });
  }

  // Stream PLY files directly in chunks without loading the entire 1.3+ GB file as an ArrayBuffer
  if (name.endsWith(".ply")) {
    return parsePLYFromFile(file, { maxPoints });
  }

  // Stream XYZ files directly in chunks without loading multi-gigabyte text strings
  if (name.endsWith(".xyz")) {
    return parseXYZFromFile(file, { maxPoints });
  }

  const buffer = await file.arrayBuffer();

  if (name.endsWith(".laz")) {
    return parseLAZ(buffer, { maxPoints });
  }

  throw new Error(
    `Unsupported point cloud file extension for '${file.name}'. Supported formats: .ply, .las, .laz, .xyz`
  );
}


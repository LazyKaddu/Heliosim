import * as THREE from "three";
import type { GPUGeometryData } from "./GeometryProcessor.ts";

/**
 * WebGPU hardware buffer bundle allocated in GPU VRAM for compute raycasting and rendering passes.
 */
export interface GPUGeometryBuffers {
  /** Storage buffer containing packed triangles (for Möller–Trumbore raycasting). */
  triangleStorageBuffer: GPUBuffer;

  /** Vertex buffer for rasterization and vertex shader passes. */
  vertexBuffer: GPUBuffer;

  /** Index buffer for triangle assembly. */
  indexBuffer: GPUBuffer;

  /**
   * Shared thermal accumulation storage buffer (Float32Array initialized to zero).
   * Both the compute shader and the render material reference this exact memory block.
   */
  thermalStorageBuffer: GPUBuffer;

  /**
   * Storage buffer containing packed 32-byte Linear BVH nodes for raytracing acceleration.
   */
  bvhStorageBuffer: GPUBuffer;

  /** Number of triangles in the storage buffer. */
  triangleCount: number;

  /** Number of vertices. */
  vertexCount: number;
}

/**
 * Solar ephemeris uniforms passed to the raytracing compute shader.
 */
export interface SunUniforms {
  /** Normalized unit sun direction vector [x, y, z]. */
  direction: THREE.Vector3;

  /** Direct Normal Irradiance in W/m². */
  dni: number;

  /** Time step in hours or seconds for cumulative integration. Default: 1.0. */
  timeStep?: number;

  /** Surface albedo / reflectance factor for multi-bounce scattering (0.0 to 1.0). Default: 0.3. */
  albedo?: number;

  /** Maximum number of ray bounces for indirect radiative transfer. Default: 5. */
  maxBounces?: number;
}

/**
 * Safe WebGPU buffer usage flags with runtime fallback constants.
 */
export const BufferUsage = {
  MAP_READ: typeof GPUBufferUsage !== "undefined" ? GPUBufferUsage.MAP_READ : 0x0001,
  MAP_WRITE: typeof GPUBufferUsage !== "undefined" ? GPUBufferUsage.MAP_WRITE : 0x0002,
  COPY_SRC: typeof GPUBufferUsage !== "undefined" ? GPUBufferUsage.COPY_SRC : 0x0004,
  COPY_DST: typeof GPUBufferUsage !== "undefined" ? GPUBufferUsage.COPY_DST : 0x0008,
  INDEX: typeof GPUBufferUsage !== "undefined" ? GPUBufferUsage.INDEX : 0x0010,
  VERTEX: typeof GPUBufferUsage !== "undefined" ? GPUBufferUsage.VERTEX : 0x0020,
  UNIFORM: typeof GPUBufferUsage !== "undefined" ? GPUBufferUsage.UNIFORM : 0x0040,
  STORAGE: typeof GPUBufferUsage !== "undefined" ? GPUBufferUsage.STORAGE : 0x0080,
  INDIRECT: typeof GPUBufferUsage !== "undefined" ? GPUBufferUsage.INDIRECT : 0x0100,
  QUERY_RESOLVE: typeof GPUBufferUsage !== "undefined" ? GPUBufferUsage.QUERY_RESOLVE : 0x0200,
};

/**
 * Safe WebGPU map mode flags.
 */
export const MapMode = {
  READ: typeof GPUMapMode !== "undefined" ? GPUMapMode.READ : 0x0001,
  WRITE: typeof GPUMapMode !== "undefined" ? GPUMapMode.WRITE : 0x0002,
};

let cachedDevice: GPUDevice | null = null;

/**
 * Checks whether WebGPU is supported by the current browser / webview environment.
 */
export function isWebGPUSupported(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && navigator.gpu !== undefined;
}

/**
 * Requests and initializes the WebGPU adapter and device.
 * Caches the active GPUDevice instance and handles device loss lifecycle.
 *
 * @param options Optional GPURequestAdapterOptions (e.g. powerPreference: 'high-performance')
 * @returns Active GPUDevice
 */
export async function getWebGPUDevice(
  options: GPURequestAdapterOptions = { powerPreference: "high-performance" }
): Promise<GPUDevice> {
  if (cachedDevice) {
    return cachedDevice;
  }

  if (!isWebGPUSupported()) {
    throw new Error(
      "WebGPU is not supported in this environment. Please ensure hardware acceleration and WebGPU flags are enabled."
    );
  }

  const adapter = await navigator.gpu.requestAdapter(options);
  if (!adapter) {
    throw new Error("Failed to acquire WebGPU adapter with requested options.");
  }

  const device = await adapter.requestDevice();

  device.lost.then((info) => {
    console.warn(`WebGPU device lost (${info.reason}): ${info.message}`);
    cachedDevice = null;
  });

  cachedDevice = device;
  return device;
}

/**
 * Creates the shared thermal accumulation storage buffer.
 *
 * Initialized to zero, scaled to the number of triangles in the mesh (1 f32 per triangle).
 * Configured with usage flags so that both the compute shader and render material reference
 * the exact same physical memory block in unified VRAM without IPC overhead.
 *
 * @param device Active GPUDevice
 * @param triangleCount Number of triangles in the mesh
 * @returns Allocated and zero-initialized GPUBuffer
 */
export function createThermalStorageBuffer(
  device: GPUDevice,
  triangleCount: number
): GPUBuffer {
  // Sized to triangleCount * 4 bytes, with a minimum 64-byte alignment
  const byteLength = Math.max(64, triangleCount * 4);

  const buffer = device.createBuffer({
    label: "heliosim-thermal-accumulation-buffer",
    size: byteLength,
    usage:
      BufferUsage.STORAGE |
      BufferUsage.COPY_SRC |
      BufferUsage.COPY_DST |
      BufferUsage.VERTEX,
  });

  // Zero-initialize the entire buffer
  const initialZeros = new Float32Array(byteLength / 4);
  device.queue.writeBuffer(buffer, 0, initialZeros.buffer);

  return buffer;
}

/**
 * Creates and populates the triangle storage buffer containing packed 64-byte triangle records
 * formatted for Möller–Trumbore raycasting compute kernels.
 *
 * @param device Active GPUDevice
 * @param triangleBuffer Contiguous Float32Array of packed triangles
 * @returns GPUBuffer containing triangle geometry
 */
export function createTriangleStorageBuffer(
  device: GPUDevice,
  triangleBuffer: Float32Array
): GPUBuffer {
  const byteLength = Math.max(64, triangleBuffer.byteLength);

  const buffer = device.createBuffer({
    label: "heliosim-triangles-storage-buffer",
    size: byteLength,
    usage: BufferUsage.STORAGE | BufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(
    buffer,
    0,
    triangleBuffer.buffer,
    triangleBuffer.byteOffset,
    triangleBuffer.byteLength
  );

  return buffer;
}

/**
 * Creates a 32-byte uniform buffer for solar ephemeris uniforms (sun direction, DNI, time step)
 * aligned to WGSL std140 / uniform layout conventions.
 *
 * Memory Layout:
 * - vec4<f32>(dir.x, dir.y, dir.z, 0.0) -> offset 0 (16 bytes)
 * - vec4<f32>(dni, timeStep, 0.0, 0.0)  -> offset 16 (16 bytes)
 * Total: 32 bytes
 *
 * @param device Active GPUDevice
 * @param uniforms Optional initial solar uniform values
 * @returns Allocated GPUBuffer
 */
export function createSunUniformBuffer(
  device: GPUDevice,
  uniforms?: SunUniforms
): GPUBuffer {
  const buffer = device.createBuffer({
    label: "heliosim-sun-uniform-buffer",
    size: 32,
    usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST,
  });

  if (uniforms) {
    updateSunUniformBuffer(device, buffer, uniforms);
  }

  return buffer;
}

/**
 * Updates the sun uniform buffer in VRAM with current solar position and irradiance.
 *
 * @param device Active GPUDevice
 * @param buffer Sun uniform GPUBuffer
 * @param uniforms Updated sun direction vector, DNI, and timeStep
 */
export function updateSunUniformBuffer(
  device: GPUDevice,
  buffer: GPUBuffer,
  uniforms: SunUniforms
): void {
  const data = new Float32Array(8);
  // vec4<f32> sunDirection
  data[0] = uniforms.direction.x;
  data[1] = uniforms.direction.y;
  data[2] = uniforms.direction.z;
  data[3] = 0.0;

  // vec4<f32> sunParams: dni, timeStep, albedo, maxBounces
  data[4] = uniforms.dni;
  data[5] = uniforms.timeStep ?? 1.0;
  data[6] = uniforms.albedo ?? 0.3;
  data[7] = uniforms.maxBounces ?? 5.0;

  device.queue.writeBuffer(buffer, 0, data.buffer);
}

/**
 * Creates and populates the BVH storage buffer containing packed 32-byte BVHNode records
 * formatted for hardware-accelerated ray traversal in compute kernels.
 *
 * @param device Active GPUDevice
 * @param bvhNodes Contiguous Float32Array of packed 32-byte BVH nodes
 * @returns Allocated GPUBuffer
 */
export function createBVHStorageBuffer(
  device: GPUDevice,
  bvhNodes: Float32Array
): GPUBuffer {
  const byteLength = Math.max(64, bvhNodes.byteLength);

  const buffer = device.createBuffer({
    label: "heliosim-bvh-storage-buffer",
    size: byteLength,
    usage: BufferUsage.STORAGE | BufferUsage.COPY_DST,
  });

  if (bvhNodes.byteLength > 0) {
    device.queue.writeBuffer(
      buffer,
      0,
      bvhNodes.buffer,
      bvhNodes.byteOffset,
      bvhNodes.byteLength
    );
  }

  return buffer;
}

/**
 * Instantiates the complete set of hardware buffers in GPU unified memory
 * (triangles, vertices, indices, and the shared thermal accumulation buffer).
 *
 * @param device Active GPUDevice
 * @param data Pre-processed geometry data from GeometryProcessor
 * @returns GPUGeometryBuffers bundle
 */
export function createGPUGeometryBuffers(
  device: GPUDevice,
  data: GPUGeometryData
): GPUGeometryBuffers {
  // 1. Packed Triangles Storage Buffer (Möller–Trumbore raycasting)
  const triangleStorageBuffer = createTriangleStorageBuffer(device, data.triangleBuffer);

  // 2. Vertex Buffer (rasterization / vertex attributes)
  const vertexBuffer = device.createBuffer({
    label: "heliosim-vertex-buffer",
    size: Math.max(16, data.positions.byteLength),
    usage: BufferUsage.VERTEX | BufferUsage.STORAGE | BufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(
    vertexBuffer,
    0,
    data.positions.buffer,
    data.positions.byteOffset,
    data.positions.byteLength
  );

  // 3. Index Buffer
  const indexBuffer = device.createBuffer({
    label: "heliosim-index-buffer",
    size: Math.max(16, data.indices.byteLength),
    usage: BufferUsage.INDEX | BufferUsage.STORAGE | BufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(
    indexBuffer,
    0,
    data.indices.buffer,
    data.indices.byteOffset,
    data.indices.byteLength
  );

  // 4. Shared Thermal Storage Buffer (initialized to zero)
  const thermalStorageBuffer = createThermalStorageBuffer(device, data.triangleCount);

  // 5. BVH Acceleration Structure Storage Buffer
  const bvhStorageBuffer = createBVHStorageBuffer(device, data.bvhNodes);

  return {
    triangleStorageBuffer,
    vertexBuffer,
    indexBuffer,
    thermalStorageBuffer,
    bvhStorageBuffer,
    triangleCount: data.triangleCount,
    vertexCount: data.vertexCount,
  };
}

/**
 * Resets the shared thermal accumulation buffer back to zero in VRAM.
 * Used when clearing simulation runs or changing diurnal date/time periods.
 *
 * @param device Active GPUDevice
 * @param buffer Thermal storage GPUBuffer
 * @param triangleCount Number of triangles in the buffer
 */
export function resetThermalBuffer(
  device: GPUDevice,
  buffer: GPUBuffer,
  triangleCount: number
): void {
  const byteLength = Math.max(64, triangleCount * 4);
  const zeros = new Float32Array(byteLength / 4);
  device.queue.writeBuffer(buffer, 0, zeros.buffer);
}

/**
 * Reads back the thermal accumulation values from VRAM into CPU memory via a staging buffer.
 * Used for computing HUD statistics (min, max, average irradiance) or exporting analysis datasets.
 *
 * @param device Active GPUDevice
 * @param thermalBuffer Source GPUBuffer containing accumulated thermal data
 * @param triangleCount Number of triangles (floats) to read back
 * @returns Float32Array containing accumulated thermal values per triangle
 */
export async function readThermalBuffer(
  device: GPUDevice,
  thermalBuffer: GPUBuffer,
  triangleCount: number
): Promise<Float32Array> {
  const byteLength = Math.max(64, triangleCount * 4);

  // Create temporary CPU-readable staging buffer
  const stagingBuffer = device.createBuffer({
    label: "heliosim-thermal-readback-staging",
    size: byteLength,
    usage: BufferUsage.MAP_READ | BufferUsage.COPY_DST,
  });

  const commandEncoder = device.createCommandEncoder();
  commandEncoder.copyBufferToBuffer(thermalBuffer, 0, stagingBuffer, 0, byteLength);
  device.queue.submit([commandEncoder.finish()]);

  await stagingBuffer.mapAsync(MapMode.READ);
  const copyArray = new Float32Array(triangleCount);
  const mappedRange = stagingBuffer.getMappedRange(0, byteLength);
  const mappedArray = new Float32Array(mappedRange);

  copyArray.set(mappedArray.subarray(0, triangleCount));
  stagingBuffer.unmap();
  stagingBuffer.destroy();

  return copyArray;
}

/**
 * Explicitly releases and destroys hardware GPU buffers, freeing GPU VRAM allocations.
 *
 * @param buffers GPUGeometryBuffers bundle to dispose
 */
export function destroyBuffers(buffers: GPUGeometryBuffers): void {
  try {
    buffers.triangleStorageBuffer.destroy();
    buffers.vertexBuffer.destroy();
    buffers.indexBuffer.destroy();
    buffers.thermalStorageBuffer.destroy();
    buffers.bvhStorageBuffer.destroy();
  } catch (err) {
    console.warn("Error destroying GPU buffers:", err);
  }
}

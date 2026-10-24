import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import {
  isWebGPUSupported,
  createThermalStorageBuffer,
  createTriangleStorageBuffer,
  createSunUniformBuffer,
  updateSunUniformBuffer,
  createBVHStorageBuffer,
  createGPUGeometryBuffers,
  resetThermalBuffer,
  destroyBuffers,
  BufferUsage,
} from "../WebGPUContext.ts";
import type { GPUGeometryData } from "../GeometryProcessor.ts";

/**
 * Creates a mock WebGPU device for testing memory layouts and queue operations in Node.
 */
function createMockGPUDevice() {
  const writeBufferCalls: Array<{ buffer: any; offset: number; data: ArrayBuffer }> = [];

  const device = {
    createBuffer: vi.fn(({ size, usage, label }: { size: number; usage: number; label?: string }) => ({
      size,
      usage,
      label,
      destroy: vi.fn(),
    })),
    queue: {
      writeBuffer: vi.fn((buffer: any, offset: number, data: ArrayBuffer) => {
        writeBufferCalls.push({ buffer, offset, data });
      }),
    },
    _writeBufferCalls: writeBufferCalls,
  };

  return device as unknown as GPUDevice & { _writeBufferCalls: typeof writeBufferCalls };
}

describe("WebGPUContext - Storage Buffer Lifecycle & Zero-Copy Sharing", () => {
  describe("WebGPU Support Detection", () => {
    it("returns a boolean for isWebGPUSupported without throwing", () => {
      const supported = isWebGPUSupported();
      expect(typeof supported).toBe("boolean");
    });
  });

  describe("createThermalStorageBuffer", () => {
    it("allocates buffer scaled to triangle count and initialized to zero", () => {
      const device = createMockGPUDevice();
      const triangleCount = 10000;
      const expectedByteLength = 10000 * 4; // 40,000 bytes

      const buffer = createThermalStorageBuffer(device, triangleCount);

      expect(device.createBuffer).toHaveBeenCalledTimes(1);
      expect(buffer.size).toBe(expectedByteLength);
      expect(buffer.label).toBe("heliosim-thermal-accumulation-buffer");

      // Verify usage flags contain STORAGE, COPY_SRC, COPY_DST, and VERTEX
      expect(buffer.usage & BufferUsage.STORAGE).toBeTruthy();
      expect(buffer.usage & BufferUsage.COPY_SRC).toBeTruthy();
      expect(buffer.usage & BufferUsage.COPY_DST).toBeTruthy();
      expect(buffer.usage & BufferUsage.VERTEX).toBeTruthy();

      // Verify zero-initialization writeBuffer was called
      expect(device.queue.writeBuffer).toHaveBeenCalledTimes(1);
      const call = device._writeBufferCalls[0];
      const writtenFloats = new Float32Array(call.data);
      expect(writtenFloats.length).toBe(triangleCount);
      expect(writtenFloats.every((v) => v === 0)).toBe(true);
    });

    it("enforces minimum 64-byte alignment for very small meshes", () => {
      const device = createMockGPUDevice();
      const buffer = createThermalStorageBuffer(device, 2); // 2 * 4 = 8 bytes < 64

      expect(buffer.size).toBe(64);
    });
  });

  describe("createTriangleStorageBuffer", () => {
    it("allocates and writes packed triangle data to VRAM", () => {
      const device = createMockGPUDevice();
      // 2 triangles * 16 floats = 32 floats (128 bytes)
      const mockTriangleData = new Float32Array(32);
      mockTriangleData[0] = 1.0;
      mockTriangleData[15] = 5.0; // Area of first triangle

      const buffer = createTriangleStorageBuffer(device, mockTriangleData);

      expect(buffer.size).toBe(128);
      expect(buffer.usage & BufferUsage.STORAGE).toBeTruthy();
      expect(buffer.usage & BufferUsage.COPY_DST).toBeTruthy();

      expect(device.queue.writeBuffer).toHaveBeenCalledTimes(1);
    });
  });

  describe("createSunUniformBuffer & updateSunUniformBuffer", () => {
    it("formats sun direction and DNI into 32-byte std140 uniform layout", () => {
      const device = createMockGPUDevice();
      const uniforms = {
        direction: new THREE.Vector3(0.6, 0.8, 0.0),
        dni: 920.5,
        timeStep: 0.5,
      };

      const buffer = createSunUniformBuffer(device, uniforms);

      expect(buffer.size).toBe(32);
      expect(buffer.usage & BufferUsage.UNIFORM).toBeTruthy();
      expect(buffer.usage & BufferUsage.COPY_DST).toBeTruthy();

      // Inspect written bytes
      const call = device._writeBufferCalls[0];
      const floats = new Float32Array(call.data);
      expect(floats.length).toBe(8);

      // vec4 sunDirection: (x, y, z, 0.0)
      expect(floats[0]).toBeCloseTo(0.6, 4);
      expect(floats[1]).toBeCloseTo(0.8, 4);
      expect(floats[2]).toBeCloseTo(0.0, 4);
      expect(floats[3]).toBe(0.0);

      // vec4 sunParams: (dni, timeStep, albedo, maxBounces)
      expect(floats[4]).toBeCloseTo(920.5, 2);
      expect(floats[5]).toBeCloseTo(0.5, 2);
      expect(floats[6]).toBeCloseTo(0.3, 4);
      expect(floats[7]).toBe(5.0);
    });

    it("updates existing sun uniform buffer via updateSunUniformBuffer", () => {
      const device = createMockGPUDevice();
      const buffer = createSunUniformBuffer(device);

      updateSunUniformBuffer(device, buffer, {
        direction: new THREE.Vector3(0.0, 1.0, 0.0),
        dni: 1000.0,
      });

      const call = device._writeBufferCalls[device._writeBufferCalls.length - 1];
      const floats = new Float32Array(call.data);
      expect(floats[1]).toBeCloseTo(1.0, 4); // Y is 1.0 (overhead)
      expect(floats[4]).toBeCloseTo(1000.0, 2); // DNI
      expect(floats[5]).toBe(1.0); // Default timeStep is 1.0
      expect(floats[6]).toBeCloseTo(0.3, 4); // Default albedo is 0.3
      expect(floats[7]).toBe(5.0); // Default maxBounces is 5.0
    });

    it("writes custom albedo and maxBounces to uniform buffer", () => {
      const device = createMockGPUDevice();
      const buffer = createSunUniformBuffer(device);

      updateSunUniformBuffer(device, buffer, {
        direction: new THREE.Vector3(0, 1, 0),
        dni: 850.0,
        timeStep: 0.5,
        albedo: 0.25,
        maxBounces: 6,
      });

      const call = device._writeBufferCalls[device._writeBufferCalls.length - 1];
      const floats = new Float32Array(call.data);
      expect(floats[4]).toBeCloseTo(850.0, 2);
      expect(floats[5]).toBe(0.5);
      expect(floats[6]).toBe(0.25);
      expect(floats[7]).toBe(6.0);
    });
  });

  describe("createBVHStorageBuffer", () => {
    it("allocates BVH storage buffer with 32-byte nodes and writes to queue", () => {
      const device = createMockGPUDevice();
      const mockBVH = new Float32Array(16); // 2 nodes = 64 bytes
      mockBVH[0] = -10;
      mockBVH[4] = 10;

      const buffer = createBVHStorageBuffer(device, mockBVH);

      expect(device.createBuffer).toHaveBeenCalled();
      expect(device._writeBufferCalls.length).toBeGreaterThan(0);
      expect(buffer).toBeDefined();
    });
  });

  describe("createGPUGeometryBuffers", () => {
    it("instantiates the complete hardware buffer bundle for a mesh", () => {
      const device = createMockGPUDevice();

      const mockData: GPUGeometryData = {
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        indices: new Uint32Array([0, 1, 2]),
        triangleBuffer: new Float32Array(16),
        bvhNodes: new Float32Array(8),
        bvhNodeCount: 1,
        triangleCount: 1,
        vertexCount: 3,
        boundingBox: {
          min: [0, 0, 0],
          max: [1, 1, 0],
          center: [0.5, 0.5, 0],
          dimensions: [1, 1, 0],
          radius: 0.7,
        },
        totalArea: 0.5,
      };

      const buffers = createGPUGeometryBuffers(device, mockData);

      expect(buffers.triangleCount).toBe(1);
      expect(buffers.vertexCount).toBe(3);
      expect(buffers.triangleStorageBuffer).toBeDefined();
      expect(buffers.vertexBuffer).toBeDefined();
      expect(buffers.indexBuffer).toBeDefined();
      expect(buffers.thermalStorageBuffer).toBeDefined();
      expect(buffers.bvhStorageBuffer).toBeDefined();
    });
  });

  describe("resetThermalBuffer and destroyBuffers", () => {
    it("resetThermalBuffer re-zeros accumulation in VRAM", () => {
      const device = createMockGPUDevice();
      const buffer = createThermalStorageBuffer(device, 50);

      resetThermalBuffer(device, buffer, 50);

      const lastCall = device._writeBufferCalls[device._writeBufferCalls.length - 1];
      const floats = new Float32Array(lastCall.data);
      expect(floats.every((v) => v === 0)).toBe(true);
    });

    it("destroyBuffers frees all buffer instances", () => {
      const device = createMockGPUDevice();
      const mockData: GPUGeometryData = {
        positions: new Float32Array(9),
        normals: new Float32Array(9),
        indices: new Uint32Array(3),
        triangleBuffer: new Float32Array(16),
        bvhNodes: new Float32Array(8),
        bvhNodeCount: 1,
        triangleCount: 1,
        vertexCount: 3,
        boundingBox: {
          min: [0, 0, 0],
          max: [1, 1, 0],
          center: [0.5, 0.5, 0],
          dimensions: [1, 1, 0],
          radius: 0.7,
        },
        totalArea: 0.5,
      };

      const buffers = createGPUGeometryBuffers(device, mockData);
      destroyBuffers(buffers);

      expect(buffers.triangleStorageBuffer.destroy).toHaveBeenCalledTimes(1);
      expect(buffers.vertexBuffer.destroy).toHaveBeenCalledTimes(1);
      expect(buffers.indexBuffer.destroy).toHaveBeenCalledTimes(1);
      expect(buffers.thermalStorageBuffer.destroy).toHaveBeenCalledTimes(1);
      expect(buffers.bvhStorageBuffer.destroy).toHaveBeenCalledTimes(1);
    });
  });
});

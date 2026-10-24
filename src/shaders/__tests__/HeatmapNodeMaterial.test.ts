import { describe, it, expect } from 'vitest';
import { StorageBufferAttribute } from 'three/webgpu';
import {
  HeatmapNodeMaterial,
  createHeatmapNodeMaterial,
  DEFAULT_HEATMAP_COLORS,
  DEFAULT_MIN_THERMAL,
  DEFAULT_MAX_THERMAL,
} from '../HeatmapNodeMaterial';

describe('HeatmapNodeMaterial', () => {
  it('exports default constants correctly', () => {
    expect(DEFAULT_HEATMAP_COLORS.shade).toBe(0x0033cc);
    expect(DEFAULT_HEATMAP_COLORS.cool).toBe(0x00c8ff);
    expect(DEFAULT_HEATMAP_COLORS.moderate).toBe(0x22cc44);
    expect(DEFAULT_HEATMAP_COLORS.warm).toBe(0xffcc00);
    expect(DEFAULT_HEATMAP_COLORS.hot).toBe(0xff2200);

    expect(DEFAULT_MIN_THERMAL).toBe(0.0);
    expect(DEFAULT_MAX_THERMAL).toBe(1000.0);
  });

  it('instantiates with default parameters', () => {
    const mat = new HeatmapNodeMaterial();

    expect(mat.isMeshStandardNodeMaterial).toBe(true);
    expect(mat.roughness).toBe(0.8);
    expect(mat.metalness).toBe(0.1);
    expect(mat.minThermal).toBe(DEFAULT_MIN_THERMAL);
    expect(mat.maxThermal).toBe(DEFAULT_MAX_THERMAL);
    expect(mat.colorNode).toBeDefined();
    expect(mat.colorNode).not.toBeNull();

    const data = mat.getThermalData();
    expect(data).toBeInstanceOf(Float32Array);
    expect(data.length).toBe(1);
    expect(mat.thermalAttribute).toBeInstanceOf(StorageBufferAttribute);
  });

  it('initializes with custom parameters and triangle count', () => {
    const mat = new HeatmapNodeMaterial({
      triangleCount: 50,
      minThermal: 10.0,
      maxThermal: 850.0,
      roughness: 0.5,
      metalness: 0.2,
      flatShading: true,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });

    expect(mat.roughness).toBe(0.5);
    expect(mat.metalness).toBe(0.2);
    expect(mat.flatShading).toBe(true);
    expect(mat.wireframe).toBe(true);
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBe(0.9);
    expect(mat.minThermal).toBe(10.0);
    expect(mat.maxThermal).toBe(850.0);

    const data = mat.getThermalData();
    expect(data.length).toBe(50);
  });

  it('initializes with a provided Float32Array', () => {
    const initialData = new Float32Array([100, 250, 500, 900]);
    const mat = new HeatmapNodeMaterial({ thermalData: initialData });

    expect(mat.getThermalData().length).toBe(4);
    expect(mat.getThermalData()[1]).toBe(250);
    expect(mat.getThermalData()[3]).toBe(900);
  });

  it('initializes with a provided StorageBufferAttribute', () => {
    const buffer = new StorageBufferAttribute(new Float32Array([10, 20, 30]), 1);
    const mat = new HeatmapNodeMaterial({ thermalData: buffer });

    expect(mat.thermalAttribute).toBe(buffer);
    expect(mat.getThermalData().length).toBe(3);
    expect(mat.getThermalData()[0]).toBe(10);
  });

  it('updates dynamic min and max thermal range', () => {
    const mat = new HeatmapNodeMaterial();

    mat.setMinThermal(20.0);
    expect(mat.minThermal).toBe(20.0);

    mat.setMaxThermal(750.0);
    expect(mat.maxThermal).toBe(750.0);

    mat.setThermalRange(50.0, 1200.0);
    expect(mat.minThermal).toBe(50.0);
    expect(mat.maxThermal).toBe(1200.0);

    mat.minThermal = 15.0;
    mat.maxThermal = 950.0;
    expect(mat.minThermal).toBe(15.0);
    expect(mat.maxThermal).toBe(950.0);
  });

  it('updates thermal data in-place when buffer size matches', () => {
    const mat = new HeatmapNodeMaterial({
      thermalData: new Float32Array([0, 0, 0]),
    });

    const initialVersion = mat.thermalAttribute.version;
    const newData = new Float32Array([120, 340, 560]);
    mat.setThermalData(newData);

    expect(mat.getThermalData()[0]).toBe(120);
    expect(mat.getThermalData()[1]).toBe(340);
    expect(mat.getThermalData()[2]).toBe(560);
    expect(mat.thermalAttribute.version).toBeGreaterThan(initialVersion);
  });

  it('reallocates storage buffer attribute when new data size differs', () => {
    const mat = new HeatmapNodeMaterial({
      thermalData: new Float32Array([1, 2]),
    });

    const oldAttr = mat.thermalAttribute;
    const largerData = new Float32Array([10, 20, 30, 40, 50]);
    mat.setThermalData(largerData);

    expect(mat.thermalAttribute).not.toBe(oldAttr);
    expect(mat.getThermalData().length).toBe(5);
    expect(mat.getThermalData()[4]).toBe(50);
    expect(mat.colorNode).toBeDefined();
  });

  it('allows replacing thermal data with StorageBufferAttribute', () => {
    const mat = new HeatmapNodeMaterial();
    const newAttr = new StorageBufferAttribute(new Float32Array([15, 25]), 1);

    mat.setThermalData(newAttr);
    expect(mat.thermalAttribute).toBe(newAttr);
    expect(mat.getThermalData().length).toBe(2);

    const anotherAttr = new StorageBufferAttribute(new Float32Array([5, 10, 15]), 1);
    mat.thermalAttribute = anotherAttr;
    expect(mat.thermalAttribute).toBe(anotherAttr);
    expect(mat.getThermalData().length).toBe(3);
  });

  it('updates individual triangle thermal readings', () => {
    const mat = new HeatmapNodeMaterial({
      thermalData: new Float32Array([0, 0, 0, 0]),
    });

    const initialVersion = mat.thermalAttribute.version;
    mat.updateThermalValue(2, 450.5);

    expect(mat.getThermalData()[2]).toBe(450.5);
    expect(mat.thermalAttribute.version).toBeGreaterThan(initialVersion);

    // Out of bounds check does not throw
    expect(() => mat.updateThermalValue(-1, 100)).not.toThrow();
    expect(() => mat.updateThermalValue(10, 100)).not.toThrow();
  });

  it('supports custom color stops and dynamic update', () => {
    const mat = new HeatmapNodeMaterial({
      colors: {
        shade: '#0000ff',
        hot: '#ff0000',
      },
    });

    expect(mat.colorStops.shade).toBe('#0000ff');
    expect(mat.colorStops.hot).toBe('#ff0000');
    expect(mat.colorStops.cool).toBe(DEFAULT_HEATMAP_COLORS.cool);

    mat.setColorStops({ moderate: 0x00ff00 });
    expect(mat.colorStops.moderate).toBe(0x00ff00);
    expect(mat.colorNode).toBeDefined();
  });

  it('creates material via factory function createHeatmapNodeMaterial', () => {
    const mat = createHeatmapNodeMaterial({
      minThermal: 200,
      maxThermal: 800,
    });

    expect(mat).toBeInstanceOf(HeatmapNodeMaterial);
    expect(mat.minThermal).toBe(200);
    expect(mat.maxThermal).toBe(800);
  });
});

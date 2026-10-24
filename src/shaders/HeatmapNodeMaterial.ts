import { MeshStandardNodeMaterial, StorageBufferAttribute } from 'three/webgpu';
import {
  storage,
  float,
  color,
  mix,
  clamp,
  smoothstep,
  uniform,
  Fn,
  vertexIndex,
  uint,
} from 'three/tsl';

/**
 * Color stop configuration for the thermal heatmap ramp.
 * Accepts hex numbers (e.g. 0x0033cc) or CSS hex strings (e.g. '#0033cc').
 */
export interface HeatmapColorStops {
  /** Low irradiance / deep shade stop (default: 0x0033cc - deep blue) */
  shade?: number | string;
  /** Cool irradiance stop (default: 0x00c8ff - cyan) */
  cool?: number | string;
  /** Moderate irradiance stop (default: 0x22cc44 - emerald green) */
  moderate?: number | string;
  /** Warm irradiance stop (default: 0xffcc00 - amber yellow) */
  warm?: number | string;
  /** Peak solar irradiance / direct sunlight stop (default: 0xff2200 - fiery red/orange) */
  hot?: number | string;
}

/**
 * Default color palette for the thermal heatmap ramp.
 */
export const DEFAULT_HEATMAP_COLORS: Required<HeatmapColorStops> = {
  shade: 0x0033cc,     // Deep blue (shade / 0 W/m²)
  cool: 0x00c8ff,      // Cyan
  moderate: 0x22cc44,  // Emerald green
  warm: 0xffcc00,      // Warm amber yellow
  hot: 0xff2200,       // Fiery red/orange (direct peak sunlight)
};

export const DEFAULT_MIN_THERMAL = 0.0;
export const DEFAULT_MAX_THERMAL = 1000.0;

/**
 * Initialization parameters for HeatmapNodeMaterial.
 */
export interface HeatmapNodeMaterialParameters {
  /** Thermal buffer array or existing StorageBufferAttribute */
  thermalData?: Float32Array | StorageBufferAttribute;
  /** Number of triangles to allocate if thermalData is omitted (default: 1) */
  triangleCount?: number;
  /** Minimum thermal value for normalization range (default: 0.0) */
  minThermal?: number;
  /** Maximum thermal value for normalization range (default: 1000.0) */
  maxThermal?: number;
  /** Custom color stops for the gradient ramp */
  colors?: HeatmapColorStops;
  /** Surface roughness (0.0 - 1.0, default: 0.8) */
  roughness?: number;
  /** Surface metalness (0.0 - 1.0, default: 0.1) */
  metalness?: number;
  /** Whether to render flat shaded facets (default: false) */
  flatShading?: boolean;
  /** Whether to render as wireframe (default: false) */
  wireframe?: boolean;
  /** Transparency flag */
  transparent?: boolean;
  /** Material opacity (0.0 - 1.0) */
  opacity?: number;
}

/**
 * HeatmapNodeMaterial
 * 
 * Replaces the standard Three.js material by leveraging Three Shading Language (TSL)
 * and WebGPU Storage Buffers. It binds to the `thermal_heatmap` storage buffer populated
 * by the GPU raytracer compute shader (`raytracer.wgsl`), calculates vertex-to-triangle
 * indices, normalizes irradiance against dynamic min/max thresholds, and injects a 5-stop
 * thermal color ramp directly into the material's `colorNode`.
 */
export class HeatmapNodeMaterial extends MeshStandardNodeMaterial {
  private _thermalAttribute: StorageBufferAttribute;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _storageNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _minThermalUniform: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _maxThermalUniform: any;
  private _colorStops: Required<HeatmapColorStops>;

  constructor(parameters: HeatmapNodeMaterialParameters = {}) {
    super();

    // Configure PBR physical properties
    this.roughness = parameters.roughness !== undefined ? parameters.roughness : 0.8;
    this.metalness = parameters.metalness !== undefined ? parameters.metalness : 0.1;
    if (parameters.flatShading !== undefined) this.flatShading = parameters.flatShading;
    if (parameters.wireframe !== undefined) this.wireframe = parameters.wireframe;
    if (parameters.transparent !== undefined) this.transparent = parameters.transparent;
    if (parameters.opacity !== undefined) this.opacity = parameters.opacity;

    // Resolve color stops
    this._colorStops = {
      shade: parameters.colors?.shade ?? DEFAULT_HEATMAP_COLORS.shade,
      cool: parameters.colors?.cool ?? DEFAULT_HEATMAP_COLORS.cool,
      moderate: parameters.colors?.moderate ?? DEFAULT_HEATMAP_COLORS.moderate,
      warm: parameters.colors?.warm ?? DEFAULT_HEATMAP_COLORS.warm,
      hot: parameters.colors?.hot ?? DEFAULT_HEATMAP_COLORS.hot,
    };

    // Initialize uniforms for dynamic thermal re-scaling
    const minVal = parameters.minThermal ?? DEFAULT_MIN_THERMAL;
    const maxVal = parameters.maxThermal ?? DEFAULT_MAX_THERMAL;
    this._minThermalUniform = uniform(minVal);
    this._maxThermalUniform = uniform(maxVal);

    // Initialize thermal buffer attribute
    if (parameters.thermalData instanceof StorageBufferAttribute) {
      this._thermalAttribute = parameters.thermalData;
    } else if (parameters.thermalData instanceof Float32Array) {
      this._thermalAttribute = new StorageBufferAttribute(parameters.thermalData, 1);
    } else {
      const count = Math.max(1, parameters.triangleCount ?? 1);
      this._thermalAttribute = new StorageBufferAttribute(new Float32Array(count), 1);
    }

    // Build and attach the TSL color node
    this.buildColorNode();
  }

  /**
   * Constructs the TSL shader graph that samples the storage buffer and generates
   * the piecewise smoothstep color ramp injected into `this.colorNode`.
   */
  public buildColorNode(): void {
    this._storageNode = storage(this._thermalAttribute, 'float', this._thermalAttribute.count);

    const heatmapColorFn = Fn(() => {
      // Each triangle consists of 3 vertices; calculate triangle index
      const triIdx = vertexIndex.div(uint(3));
      const thermalVal = this._storageNode.element(triIdx);

      // Dynamic normalization range clamped to [0.0, 1.0]
      const range = this._maxThermalUniform.sub(this._minThermalUniform).max(float(0.0001));
      const t = clamp(thermalVal.sub(this._minThermalUniform).div(range), float(0.0), float(1.0));

      // Color stop nodes
      const cBlue = color(this._colorStops.shade);
      const cCyan = color(this._colorStops.cool);
      const cGreen = color(this._colorStops.moderate);
      const cYellow = color(this._colorStops.warm);
      const cRed = color(this._colorStops.hot);

      // Continuous 5-stop smooth gradient without branching
      // [0.00 - 0.25]: Blue -> Cyan
      const step1 = smoothstep(float(0.0), float(0.25), t);
      const col1 = mix(cBlue, cCyan, step1);

      // [0.25 - 0.50]: Cyan -> Green
      const step2 = smoothstep(float(0.25), float(0.50), t);
      const col2 = mix(col1, cGreen, step2);

      // [0.50 - 0.75]: Green -> Yellow
      const step3 = smoothstep(float(0.50), float(0.75), t);
      const col3 = mix(col2, cYellow, step3);

      // [0.75 - 1.00]: Yellow -> Fiery Red/Orange
      const step4 = smoothstep(float(0.75), float(1.00), t);
      const finalCol = mix(col3, cRed, step4);

      return finalCol;
    });

    this.colorNode = heatmapColorFn();
    this.needsUpdate = true;
  }

  /**
   * Overwrite thermal buffer data. If buffer length matches, updates in place;
   * otherwise reallocates the storage buffer attribute and updates the node graph.
   */
  public setThermalData(data: Float32Array | StorageBufferAttribute): void {
    if (data instanceof StorageBufferAttribute) {
      this._thermalAttribute = data;
      this.buildColorNode();
      return;
    }

    if (data.length === this._thermalAttribute.array.length) {
      (this._thermalAttribute.array as Float32Array).set(data);
      this._thermalAttribute.needsUpdate = true;
    } else {
      this._thermalAttribute = new StorageBufferAttribute(data, 1);
      this.buildColorNode();
    }
  }

  /**
   * Returns the underlying thermal Float32Array data.
   */
  public getThermalData(): Float32Array {
    return this._thermalAttribute.array as Float32Array;
  }

  /**
   * Updates an individual triangle's thermal reading.
   */
  public updateThermalValue(triangleIndex: number, value: number): void {
    const arr = this._thermalAttribute.array as Float32Array;
    if (triangleIndex >= 0 && triangleIndex < arr.length) {
      arr[triangleIndex] = value;
      this._thermalAttribute.needsUpdate = true;
    }
  }

  /**
   * Directly get the WebGPU StorageBufferAttribute.
   */
  public get thermalAttribute(): StorageBufferAttribute {
    return this._thermalAttribute;
  }

  /**
   * Directly set the WebGPU StorageBufferAttribute.
   */
  public set thermalAttribute(attr: StorageBufferAttribute) {
    this._thermalAttribute = attr;
    this.buildColorNode();
  }

  /**
   * Set the minimum thermal threshold for normalization.
   */
  public setMinThermal(val: number): void {
    this._minThermalUniform.value = val;
  }

  /**
   * Get the minimum thermal threshold.
   */
  public get minThermal(): number {
    return this._minThermalUniform.value as number;
  }

  public set minThermal(val: number) {
    this.setMinThermal(val);
  }

  /**
   * Set the maximum thermal threshold for normalization.
   */
  public setMaxThermal(val: number): void {
    this._maxThermalUniform.value = val;
  }

  /**
   * Get the maximum thermal threshold.
   */
  public get maxThermal(): number {
    return this._maxThermalUniform.value as number;
  }

  public set maxThermal(val: number) {
    this.setMaxThermal(val);
  }

  /**
   * Set both minimum and maximum thresholds in a single call.
   */
  public setThermalRange(min: number, max: number): void {
    this.setMinThermal(min);
    this.setMaxThermal(max);
  }

  /**
   * Updates the color stop palette and rebuilds the shader node graph.
   */
  public setColorStops(stops: Partial<HeatmapColorStops>): void {
    this._colorStops = {
      ...this._colorStops,
      ...stops,
    };
    this.buildColorNode();
  }

  /**
   * Returns current active color stops.
   */
  public get colorStops(): Required<HeatmapColorStops> {
    return { ...this._colorStops };
  }
}

/**
 * Factory helper for creating HeatmapNodeMaterial instances.
 */
export function createHeatmapNodeMaterial(
  parameters?: HeatmapNodeMaterialParameters
): HeatmapNodeMaterial {
  return new HeatmapNodeMaterial(parameters);
}

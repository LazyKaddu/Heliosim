/**
 * Common data representation for stripped LiDAR point clouds and photogrammetry meshes.
 * Independent of the original file format (.ply, .las, .laz, .xyz).
 */
export interface PointCloudData {
  /** Contiguous flat array of coordinates [x0, y0, z0, x1, y1, z1, ...] */
  positions: Float32Array;

  /** Optional surface normals [nx0, ny0, nz0, ...] */
  normals?: Float32Array;

  /** Optional normalized RGB colors [r0, g0, b0, ...] where each component is 0.0 - 1.0 */
  colors?: Float32Array;

  /** Optional sensor intensity values [i0, i1, ...] */
  intensities?: Float32Array;

  /** Pre-existing triangle indices if the file is a meshed PLY [i0, i1, i2, ...] */
  indices?: Uint32Array;

  /** Total number of points */
  pointCount: number;

  /** Axis-aligned bounding box and geometric envelope */
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
    dimensions: [number, number, number];
    radius: number;
  };

  /** Original source file format */
  format: "ply" | "las" | "laz" | "xyz";
}

/**
 * Options for converting PointCloudData into a renderable Three.js BufferGeometry with faces.
 */
export interface MeshConversionOptions {
  /**
   * Explicit radius in meters for generated surfel quads.
   * If omitted, an adaptive radius is computed from point density.
   */
  surfelRadius?: number;

  /**
   * If true, centers the geometry at local origin (0, 0, 0).
   * Original geospatial translation is preserved in geometry.userData.geographicOffset.
   * Default: true.
   */
  centerAtOrigin?: boolean;

  /**
   * Maximum number of points to mesh. Massive scans exceeding this threshold
   * will be uniformly downsampled to protect memory and maintain 60 FPS rendering.
   * Default: 500,000 points (2,000,000 vertices).
   */
  maxPoints?: number;

  /**
   * Maximum edge length in meters for connecting adjacent points into triangles.
   * Edges longer than this threshold will not be created, preventing bridging across
   * scan boundaries or empty space voids. If omitted, an adaptive threshold is computed.
   */
  maxEdgeLength?: number;

  /**
   * Rendering and geometry conversion mode.
   * "pointcloud": native Three.js points (clean 3D coordinates, no artificial triangles).
   * "mesh": solid surfel surface quads.
   */
  renderMode?: "pointcloud" | "mesh";
}

export type SimulationMode = "annual" | "diurnal";
export type AnnualPeriod = "year" | "summer" | "winter" | "equinox";
export type AnnualFidelity = "standard" | "high";
export type ColorPalette = "solar" | "turbo" | "magma" | "viridis";
export type SidebarTab = "location" | "model" | "heatmap" | "analytics";

export interface MeshStatistics {
  triangles: number;
  vertices: number;
  bounds: {
    x: number;
    y: number;
    z: number;
  };
}

export interface SimulationConfig {
  // Geographic
  latitude: number;
  longitude: number;
  cityName: string;

  // Temporal & Simulation Mode
  mode: SimulationMode;
  date: string; // YYYY-MM-DD
  timeOfDay: number; // 0.0 - 24.0 (decimal hours)
  isPlaying: boolean;
  playbackSpeed: number; // 1x, 5x, 15x, 60x

  // Annual Settings
  annualPeriod: AnnualPeriod;
  annualFidelity: AnnualFidelity;
  isSimulatingAnnual: boolean;
  annualProgress: number; // 0 - 100

  // Thermal Heatmap & Shader
  showHeatmap: boolean;
  colorPalette: ColorPalette;
  minThermal: number; // W/m² (diurnal) or kWh/m² (annual)
  maxThermal: number; // W/m² or kWh/m²
  opacity: number; // 0.0 - 1.0
  albedo: number; // 0.0 - 1.0 (surface reflectance)
  maxBounces: number; // 1 - 5

  // Viewport
  showGrid: boolean;
  showSunSphere: boolean;
  wireframe: boolean;

  // Point Cloud & Model Display Options
  renderMode?: "pointcloud" | "mesh";
  pointSize?: number; // Point radius in meters for point cloud rendering
  orientZUp?: boolean; // If true, rotates GIS Z-up coordinate system to Three.js Y-up

  // 3D Model Assets
  activeModelUrl: string | null;
  activeModelName: string;
  meshStats: MeshStatistics | null;

  // UI Active Navigation Tab
  activeTab: SidebarTab;
}

export const INITIAL_SIMULATION_CONFIG: SimulationConfig = {
  latitude: 35.6762,
  longitude: 139.6503,
  cityName: "Tokyo",

  mode: "diurnal",
  date: new Date().toISOString().split("T")[0],
  timeOfDay: 12.0,
  isPlaying: false,
  playbackSpeed: 1,

  annualPeriod: "year",
  annualFidelity: "standard",
  isSimulatingAnnual: false,
  annualProgress: 0,

  showHeatmap: true,
  colorPalette: "solar",
  minThermal: 0,
  maxThermal: 1000,
  opacity: 0.9,
  albedo: 0.3,
  maxBounces: 3,

  showGrid: true,
  showSunSphere: true,
  wireframe: false,

  renderMode: "pointcloud",
  pointSize: 0.08,
  orientZUp: false,

  activeModelUrl: null,
  activeModelName: "Default Scene",
  meshStats: {
    triangles: 12,
    vertices: 24,
    bounds: { x: 1.5, y: 1.5, z: 1.5 },
  },

  activeTab: "location",
};

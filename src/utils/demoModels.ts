import * as THREE from "three";

export interface DemoPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  vertexCount: number;
  meshCount: number;
  createScene: () => THREE.Group;
}

export interface CityPreset {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  description: string;
}

export const CITY_PRESETS: CityPreset[] = [
  {
    name: "Tokyo",
    country: "Japan",
    latitude: 35.6762,
    longitude: 139.6503,
    description: "High-density urban canyons (Shinjuku / Shibuya)",
  },
  {
    name: "New York",
    country: "USA",
    latitude: 40.7128,
    longitude: -74.006,
    description: "Deep grid-based solar shadows (Manhattanhenge)",
  },
  {
    name: "London",
    country: "UK",
    latitude: 51.5074,
    longitude: -0.1278,
    description: "Temperate maritime climate with low winter sun angles",
  },
  {
    name: "Cairo",
    country: "Egypt",
    latitude: 30.0444,
    longitude: 31.2357,
    description: "Subtropical desert with high direct normal irradiance (DNI)",
  },
  {
    name: "Dubai",
    country: "UAE",
    latitude: 25.2048,
    longitude: 55.2708,
    description: "Intense solar radiation on modern architectural glazed towers",
  },
  {
    name: "Sydney",
    country: "Australia",
    latitude: -33.8688,
    longitude: 151.2093,
    description: "Southern hemisphere solar orientation (north-facing irradiance)",
  },
  {
    name: "Singapore",
    country: "Singapore",
    latitude: 1.3521,
    longitude: 103.8198,
    description: "Equatorial solar path with near-zenith midday sun",
  },
];

/**
 * Creates a procedural urban canyon featuring a street grid, varied skyscrapers,
 * setbacks, and rooftop HVAC units to test raycasting and shadows.
 */
export function createUrbanCanyonScene(): THREE.Group {
  const group = new THREE.Group();
  group.name = "UrbanCanyonScene";

  // Ground Plane (Street grid & sidewalks)
  const groundGeo = new THREE.PlaneGeometry(80, 80, 16, 16);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x1e222b,
    roughness: 0.85,
    metalness: 0.1,
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  // Road markings / street grid
  const roadMat = new THREE.MeshBasicMaterial({ color: 0x2d3342 });
  const roadX = new THREE.Mesh(new THREE.PlaneGeometry(80, 8), roadMat);
  roadX.rotateX(-Math.PI / 2);
  roadX.position.y = 0.01;
  group.add(roadX);

  const roadZ = new THREE.Mesh(new THREE.PlaneGeometry(8, 80), roadMat);
  roadZ.rotateX(-Math.PI / 2);
  roadZ.position.y = 0.015;
  group.add(roadZ);

  // Materials for buildings
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x71798e,
    roughness: 0.7,
    metalness: 0.2,
  });

  const glassTowerMat = new THREE.MeshStandardMaterial({
    color: 0x486581,
    roughness: 0.25,
    metalness: 0.65,
  });

  const warmFacadeMat = new THREE.MeshStandardMaterial({
    color: 0x826a57,
    roughness: 0.8,
    metalness: 0.1,
  });

  const rooftopHvacMat = new THREE.MeshStandardMaterial({
    color: 0x3e4554,
    roughness: 0.6,
    metalness: 0.4,
  });

  // Building specifications: [x, z, width, height, depth, material]
  const buildingsConfig: Array<{
    x: number;
    z: number;
    w: number;
    h: number;
    d: number;
    mat: THREE.Material;
    setback?: boolean;
  }> = [
    // Quadrant 1 (North-East)
    { x: 16, z: 16, w: 14, h: 28, d: 14, mat: glassTowerMat, setback: true },
    { x: 16, z: 30, w: 10, h: 16, d: 8, mat: concreteMat },
    { x: 30, z: 16, w: 8, h: 20, d: 10, mat: warmFacadeMat },

    // Quadrant 2 (North-West)
    { x: -16, z: 16, w: 12, h: 36, d: 12, mat: concreteMat, setback: true },
    { x: -28, z: 16, w: 8, h: 18, d: 10, mat: warmFacadeMat },
    { x: -16, z: 28, w: 10, h: 22, d: 8, mat: glassTowerMat },

    // Quadrant 3 (South-West)
    { x: -18, z: -18, w: 16, h: 24, d: 14, mat: warmFacadeMat, setback: true },
    { x: -18, z: -30, w: 12, h: 14, d: 8, mat: concreteMat },
    { x: -30, z: -18, w: 8, h: 19, d: 12, mat: glassTowerMat },

    // Quadrant 4 (South-East - Central Plaza & High Tower)
    { x: 18, z: -18, w: 14, h: 42, d: 14, mat: glassTowerMat, setback: true },
    { x: 28, z: -28, w: 10, h: 15, d: 10, mat: concreteMat },
  ];

  buildingsConfig.forEach((b) => {
    // Main building volume
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Setback top floor
    if (b.setback) {
      const sbHeight = b.h * 0.25;
      const sbGeo = new THREE.BoxGeometry(b.w * 0.75, sbHeight, b.d * 0.75);
      const sbMesh = new THREE.Mesh(sbGeo, b.mat);
      sbMesh.position.set(b.x, b.h + sbHeight / 2, b.z);
      sbMesh.castShadow = true;
      sbMesh.receiveShadow = true;
      group.add(sbMesh);

      // Rooftop HVAC unit
      const hvacGeo = new THREE.BoxGeometry(b.w * 0.3, 1.5, b.d * 0.3);
      const hvacMesh = new THREE.Mesh(hvacGeo, rooftopHvacMat);
      hvacMesh.position.set(b.x + 1, b.h + sbHeight + 0.75, b.z - 1);
      hvacMesh.castShadow = true;
      hvacMesh.receiveShadow = true;
      group.add(hvacMesh);
    } else {
      // Small rooftop elevator shaft
      const shaftGeo = new THREE.BoxGeometry(b.w * 0.35, 2, b.d * 0.35);
      const shaftMesh = new THREE.Mesh(shaftGeo, rooftopHvacMat);
      shaftMesh.position.set(b.x, b.h + 1, b.z);
      shaftMesh.castShadow = true;
      shaftMesh.receiveShadow = true;
      group.add(shaftMesh);
    }
  });

  return group;
}

/**
 * Creates a procedural rooftop solar photovoltaic array scene
 * with multiple tilted panel rows to demonstrate inter-row solar self-shading.
 */
export function createSolarRooftopScene(): THREE.Group {
  const group = new THREE.Group();
  group.name = "SolarRooftopScene";

  // Flat industrial rooftop base
  const roofGeo = new THREE.BoxGeometry(50, 6, 40);
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x333b4d,
    roughness: 0.9,
    metalness: 0.05,
  });
  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.position.y = 3;
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  group.add(roofMesh);

  // Parapet borders around roof
  const parapetMat = new THREE.MeshStandardMaterial({
    color: 0x485268,
    roughness: 0.7,
  });
  const parapetFront = new THREE.Mesh(new THREE.BoxGeometry(51, 1.5, 1), parapetMat);
  parapetFront.position.set(0, 6.75, 20);
  parapetFront.castShadow = true;
  group.add(parapetFront);

  const parapetBack = new THREE.Mesh(new THREE.BoxGeometry(51, 1.5, 1), parapetMat);
  parapetBack.position.set(0, 6.75, -20);
  parapetBack.castShadow = true;
  group.add(parapetBack);

  // Solar Photovoltaic Panels
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x0f2942, // Monocrystalline silicon blue-black
    roughness: 0.2,
    metalness: 0.8,
  });
  const rackingMat = new THREE.MeshStandardMaterial({
    color: 0x8c96a8,
    metalness: 0.9,
    roughness: 0.3,
  });

  const tiltAngle = (30 * Math.PI) / 180; // 30° optimal solar tilt
  const rows = 5;
  const panelsPerRow = 8;
  const panelWidth = 4;
  const panelHeight = 2.4;

  for (let r = 0; r < rows; r++) {
    const zPos = -12 + r * 6; // 6m row spacing to test shadow occlusion
    for (let p = 0; p < panelsPerRow; p++) {
      const xPos = -18 + p * 4.8;

      // Panel surface
      const pGeo = new THREE.PlaneGeometry(panelWidth, panelHeight);
      const pMesh = new THREE.Mesh(pGeo, panelMat);
      pMesh.rotation.x = -Math.PI / 2 + tiltAngle; // Tilted toward South
      pMesh.position.set(xPos, 6.8 + Math.sin(tiltAngle) * (panelHeight / 2), zPos);
      pMesh.castShadow = true;
      pMesh.receiveShadow = true;
      group.add(pMesh);

      // Aluminum mounting rack
      const rackGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.4);
      const rackMesh = new THREE.Mesh(rackGeo, rackingMat);
      rackMesh.position.set(xPos, 6.7, zPos - 0.8);
      rackMesh.castShadow = true;
      group.add(rackMesh);
    }
  }

  return group;
}

export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: "urban_canyon",
    name: "Urban Canyon District",
    category: "High-Rise City Grid",
    description: "Multi-block downtown towers and street canyon for shadow raycasting",
    vertexCount: 18420,
    meshCount: 26,
    createScene: createUrbanCanyonScene,
  },
  {
    id: "solar_rooftop",
    name: "Commercial Solar Array",
    category: "Photovoltaic Installation",
    description: "Industrial flat roof with 40 tilted PV modules demonstrating inter-row shading",
    vertexCount: 12600,
    meshCount: 44,
    createScene: createSolarRooftopScene,
  },
];

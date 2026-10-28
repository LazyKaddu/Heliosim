import { Suspense, useState, useEffect, useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";

import {
  SimulationConfig,
  INITIAL_SIMULATION_CONFIG,
} from "../types/simulation";
import { Sidebar } from "../components/sidebar/Sidebar";
import { isWebGPUSupported } from "../core/WebGPUContext";
import { getSolarPosition, dateToDayOfYear } from "../core/SolarMath";
import { createUrbanCanyonScene, createSolarRooftopScene } from "../utils/demoModels";

function Simulator() {
  const [config, setConfig] = useState<SimulationConfig>(INITIAL_SIMULATION_CONFIG);
  const [webGpuAvailable, setWebGpuAvailable] = useState<boolean>(false);
  const [presetScene, setPresetScene] = useState<THREE.Group | null>(null);

  useEffect(() => {
    setWebGpuAvailable(isWebGPUSupported());
  }, []);

  const updateConfig = (patch: Partial<SimulationConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  // Diurnal animation loop (advances time of day when isPlaying is true)
  useEffect(() => {
    if (!config.isPlaying) return;

    const interval = setInterval(() => {
      setConfig((prev) => {
        let nextTime = prev.timeOfDay + (0.1 * prev.playbackSpeed);
        if (nextTime >= 24) nextTime = 0;
        return { ...prev, timeOfDay: nextTime };
      });
    }, 100);

    return () => clearInterval(interval);
  }, [config.isPlaying, config.playbackSpeed]);

  // Compute live sun position and direction
  const solarEphemeris = useMemo(() => {
    const selectedDate = new Date(config.date);
    const dayOfYear = dateToDayOfYear(selectedDate);
    return getSolarPosition(
      config.latitude,
      config.longitude,
      dayOfYear,
      config.timeOfDay
    );
  }, [config.latitude, config.longitude, config.date, config.timeOfDay]);

  // Scaled 3D position vector pointing to the sun
  const sunPosition = useMemo(() => {
    const dir = solarEphemeris.direction;
    const distance = 25;
    return new THREE.Vector3(dir.x * distance, dir.y * distance, dir.z * distance);
  }, [solarEphemeris]);

  // Handler for demo presets
  const handleSelectPresetScene = (presetId: string) => {
    if (presetId === "urban-canyon") {
      const scene = createUrbanCanyonScene();
      setPresetScene(scene);
      updateConfig({
        activeModelName: "Urban Canyon",
        meshStats: {
          triangles: 144,
          vertices: 288,
          bounds: { x: 40, y: 35, z: 40 },
        },
      });
    } else if (presetId === "solar-rooftop") {
      const scene = createSolarRooftopScene();
      setPresetScene(scene);
      updateConfig({
        activeModelName: "Solar Rooftop",
        meshStats: {
          triangles: 96,
          vertices: 192,
          bounds: { x: 30, y: 15, z: 30 },
        },
      });
    }
  };

  // Monochrome material color for the sample mesh
  const materialColor = useMemo(() => {
    return "#c0c0c0";
  }, []);

  return (
    <div className="flex h-screen w-screen bg-black text-white select-none overflow-hidden">
      {/* Left (76%): Main 3D Simulator Viewport */}
      <div className="flex-1 relative h-full overflow-hidden bg-black">
        <Canvas
          camera={{ position: [8, 8, 8], fov: 45 }}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            outputColorSpace: THREE.SRGBColorSpace,
          }}
        >
          {/* Explicit black background */}
          <color attach="background" args={["#000000"]} />

          {/* Global Illuminance: Ambient + Skylight / Ground Hemisphere */}
          <ambientLight intensity={solarEphemeris.isDaylight ? 0.6 : 0.15} />
          <hemisphereLight
            color={solarEphemeris.isDaylight ? "#ffffff" : "#404040"}
            groundColor="#1a1a1a"
            intensity={solarEphemeris.isDaylight ? 0.8 : 0.2}
          />

          {/* Dynamic Physical Sun Light */}
          {solarEphemeris.isDaylight && (
            <directionalLight
              position={[sunPosition.x, Math.max(0.1, sunPosition.y), sunPosition.z]}
              intensity={Math.max(0.2, (solarEphemeris.dni / 1000) * 2.0)}
              castShadow
            />
          )}

          {/* Sun Sphere Visualizer */}
          {config.showSunSphere && solarEphemeris.isDaylight && (
            <mesh position={[sunPosition.x, sunPosition.y, sunPosition.z]}>
              <sphereGeometry args={[0.8, 16, 16]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          )}

          {/* Image-Based Lighting (IBL) for PBR reflections */}
          <Suspense fallback={null}>
            <Environment preset="city" />
          </Suspense>

          {/* Spatial Ground Grid */}
          {config.showGrid && (
            <gridHelper args={[40, 40, "#444444", "#1a1a1a"]} />
          )}

          {/* 3D Scene Geometry: Either Loaded Preset or Default Target */}
          {presetScene ? (
            <primitive object={presetScene} />
          ) : (
            <mesh position={[0, 1.0, 0]}>
              <boxGeometry args={[2, 2, 2]} />
              <meshStandardMaterial
                color={materialColor}
                roughness={0.25}
                metalness={0.15}
                wireframe={config.wireframe}
                opacity={config.opacity}
                transparent={config.opacity < 1.0}
              />
            </mesh>
          )}

          {/* Orbit Controls */}
          <OrbitControls makeDefault />
        </Canvas>

        {/* Floating Viewport Telemetry Badge (Top Left) */}
        <div className="absolute top-4 left-4 z-10 bg-black/90 border border-[#262626] px-3.5 py-2 font-mono text-xs backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 ${
                solarEphemeris.isDaylight ? "bg-white" : "bg-neutral-600"
              }`}
            />
            <span className="font-semibold text-white tracking-wider">
              {config.cityName.toUpperCase()}
            </span>
            <span className="text-neutral-400">
              • {solarEphemeris.isDaylight ? "DAYLIGHT" : "NIGHT"}
            </span>
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">
            Sun: El {solarEphemeris.elevationDeg.toFixed(1)}° | Az {solarEphemeris.azimuthDeg.toFixed(1)}° | DNI {solarEphemeris.dni.toFixed(0)} W/m²
          </div>
        </div>
      </div>

      {/* Right (24%): Options Panel */}
      <Sidebar
        config={config}
        onChange={updateConfig}
        webGpuAvailable={webGpuAvailable}
        onSelectPresetScene={handleSelectPresetScene}
      />
    </div>
  );
}

export default Simulator;

import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, Center, Html } from "@react-three/drei";
import * as THREE from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { XYZLoader } from "three/examples/jsm/loaders/XYZLoader.js";
import { useLocation, useSearchParams, Link } from "react-router-dom";

interface LocationState {
  modelUrl?: string;
  textureUrl?: string;
  modelName?: string;
  textureName?: string;
}

interface ModelStats {
  meshes: number;
  vertices: number;
}

/**
 * Applies a texture to a Three.js material.
 * Detects if the material is a custom ShaderMaterial (with uniforms like uTexture, map, tDiffuse)
 * or a standard material, updating it accordingly.
 */
function applyTextureToMaterial(material: THREE.Material, texture: THREE.Texture): void {
  const isShader =
    (material as THREE.ShaderMaterial).isShaderMaterial ||
    material instanceof THREE.ShaderMaterial;
  const shaderMat = material as THREE.ShaderMaterial;

  if (isShader && shaderMat.uniforms) {
    const candidateKeys = [
      "uTexture",
      "map",
      "tDiffuse",
      "texture",
      "diffuseMap",
      "u_texture",
      "uMap",
      "textureMap",
    ];

    let applied = false;
    for (const key of candidateKeys) {
      if (shaderMat.uniforms[key]) {
        shaderMat.uniforms[key].value = texture;
        applied = true;
        break;
      }
    }

    if (!applied) {
      // Search uniforms for any texture holder or null target
      for (const [key, uniform] of Object.entries(shaderMat.uniforms)) {
        if (
          uniform &&
          (uniform.value instanceof THREE.Texture ||
            uniform.value === null ||
            /tex|map/i.test(key))
        ) {
          uniform.value = texture;
          applied = true;
          break;
        }
      }
    }

    if ("map" in shaderMat) {
      (shaderMat as unknown as { map: THREE.Texture }).map = texture;
    }
    shaderMat.needsUpdate = true;
    return;
  }

  // Standard Three.js material (MeshStandardMaterial, MeshBasicMaterial, etc.)
  if ("map" in material) {
    (material as THREE.MeshStandardMaterial).map = texture;
    material.needsUpdate = true;
  }
}

/**
 * GLTF / GLB Loader component.
 */
function GLTFModelViewer({
  modelUrl,
  textureUrl,
  onModelLoaded,
}: {
  modelUrl: string;
  textureUrl?: string;
  onModelLoaded?: (stats: ModelStats) => void;
}) {
  const gltf = useGLTF(modelUrl);
  const scene = gltf.scene as THREE.Group;
  const [loadedTexture, setLoadedTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!textureUrl) {
      setLoadedTexture(null);
      return;
    }

    let isMounted = true;
    const loader = new THREE.TextureLoader();

    loader.load(
      textureUrl,
      (tex) => {
        if (!isMounted) {
          tex.dispose();
          return;
        }
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.needsUpdate = true;
        setLoadedTexture(tex);
      },
      undefined,
      (err) => {
        console.error("Failed to load texture from textureUrl:", textureUrl, err);
      }
    );

    return () => {
      isMounted = false;
    };
  }, [textureUrl]);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    let meshCount = 0;
    let vertexCount = 0;

    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshCount++;
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (mesh.geometry && mesh.geometry.attributes.position) {
          vertexCount += mesh.geometry.attributes.position.count;
        }

        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((mat) => mat.clone());
        } else if (mesh.material) {
          mesh.material = mesh.material.clone();
        }
      }
    });

    if (onModelLoaded) {
      onModelLoaded({ meshes: meshCount, vertices: vertexCount });
    }

    return clone;
  }, [scene, onModelLoaded]);

  useEffect(() => {
    if (!clonedScene || !loadedTexture) return;

    clonedScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => applyTextureToMaterial(mat, loadedTexture));
        } else if (mesh.material) {
          applyTextureToMaterial(mesh.material, loadedTexture);
        }
      }
    });
  }, [clonedScene, loadedTexture]);

  return (
    <Center top>
      <primitive object={clonedScene} />
    </Center>
  );
}

/**
 * PLY Loader component (.ply LiDAR point cloud & mesh).
 */
function PLYModelViewer({
  modelUrl,
  textureUrl,
  onModelLoaded,
}: {
  modelUrl: string;
  textureUrl?: string;
  onModelLoaded?: (stats: ModelStats) => void;
}) {
  const [object, setObject] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loader = new PLYLoader();

    loader.load(
      modelUrl,
      (geometry) => {
        if (!isMounted) return;
        geometry.computeVertexNormals();
        const vertexCount = geometry.attributes.position ? geometry.attributes.position.count : 0;

        let obj: THREE.Object3D;
        if (geometry.index) {
          const material = new THREE.MeshStandardMaterial({
            color: 0xd4d4d8,
            roughness: 0.5,
            metalness: 0.1,
            vertexColors: !!geometry.attributes.color,
          });
          obj = new THREE.Mesh(geometry, material);
          obj.castShadow = true;
          obj.receiveShadow = true;
        } else {
          const material = new THREE.PointsMaterial({
            size: 0.05,
            vertexColors: !!geometry.attributes.color,
            color: geometry.attributes.color ? 0xffffff : 0xf59e0b,
          });
          obj = new THREE.Points(geometry, material);
        }

        setObject(obj);
        if (onModelLoaded) {
          onModelLoaded({ meshes: 1, vertices: vertexCount });
        }
      },
      undefined,
      (err) => console.error("Error loading PLY file:", err)
    );

    return () => {
      isMounted = false;
    };
  }, [modelUrl, onModelLoaded]);

  // Apply texture if mesh
  useEffect(() => {
    if (!object || !textureUrl || !(object instanceof THREE.Mesh)) return;
    const loader = new THREE.TextureLoader();
    loader.load(textureUrl, (tex) => {
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.needsUpdate = true;
      applyTextureToMaterial(object.material, tex);
    });
  }, [object, textureUrl]);

  if (!object) return null;

  return (
    <Center top>
      <primitive object={object} />
    </Center>
  );
}

/**
 * XYZ Loader component (.xyz LiDAR point cloud).
 */
function XYZModelViewer({
  modelUrl,
  onModelLoaded,
}: {
  modelUrl: string;
  onModelLoaded?: (stats: ModelStats) => void;
}) {
  const [points, setPoints] = useState<THREE.Points | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loader = new XYZLoader();

    loader.load(
      modelUrl,
      (geometry) => {
        if (!isMounted) return;
        const vertexCount = geometry.attributes.position ? geometry.attributes.position.count : 0;
        const material = new THREE.PointsMaterial({
          size: 0.05,
          vertexColors: !!geometry.attributes.color,
          color: geometry.attributes.color ? 0xffffff : 0xf59e0b,
        });
        const pts = new THREE.Points(geometry, material);
        setPoints(pts);

        if (onModelLoaded) {
          onModelLoaded({ meshes: 1, vertices: vertexCount });
        }
      },
      undefined,
      (err) => console.error("Error loading XYZ file:", err)
    );

    return () => {
      isMounted = false;
    };
  }, [modelUrl, onModelLoaded]);

  if (!points) return null;

  return (
    <Center top>
      <primitive object={points} />
    </Center>
  );
}

/**
 * Universal LiDAR & 3D Model Viewer dispatcher.
 */
function ModelWithTexture({
  modelUrl,
  modelName,
  textureUrl,
  onModelLoaded,
}: {
  modelUrl: string;
  modelName?: string;
  textureUrl?: string;
  onModelLoaded?: (stats: ModelStats) => void;
}) {
  const identifier = (modelName || modelUrl).toLowerCase();

  if (identifier.endsWith(".ply")) {
    return <PLYModelViewer modelUrl={modelUrl} textureUrl={textureUrl} onModelLoaded={onModelLoaded} />;
  }
  if (identifier.endsWith(".xyz")) {
    return <XYZModelViewer modelUrl={modelUrl} onModelLoaded={onModelLoaded} />;
  }

  return <GLTFModelViewer modelUrl={modelUrl} textureUrl={textureUrl} onModelLoaded={onModelLoaded} />;
}

/**
 * High-tech loading indicator displayed inside the Canvas during asset loading.
 */
function CanvasLoader() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-3 bg-neutral-900/90 backdrop-blur-md px-6 py-4 rounded-xl border border-neutral-700/60 shadow-2xl">
        <div className="w-8 h-8 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono text-neutral-300 tracking-wider">
          LOADING LIDAR ASSETS...
        </span>
      </div>
    </Html>
  );
}

const Simulator: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const state = location.state as LocationState | null;
  const initialModel = state?.modelUrl || searchParams.get("model") || searchParams.get("modelUrl") || "";
  const initialTexture = state?.textureUrl || searchParams.get("texture") || searchParams.get("textureUrl") || "";

  const [modelUrl, setModelUrl] = useState<string>(initialModel);
  const [textureUrl, setTextureUrl] = useState<string>(initialTexture);
  const [modelName, setModelName] = useState<string>(state?.modelName || (initialModel ? "LiDAR Dataset" : ""));
  const [textureName, setTextureName] = useState<string>(state?.textureName || (initialTexture ? "Companion Texture" : ""));
  const [modelStats, setModelStats] = useState<ModelStats | null>(null);

  // Viewport Settings
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [lightIntensity, setLightIntensity] = useState<number>(1.5);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // File Inputs
  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const textureInputRef = useRef<HTMLInputElement | null>(null);

  // Handle local LiDAR upload
  const handleModelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setModelUrl(url);
      setModelName(file.name);
    }
  };

  // Handle local Texture upload
  const handleTextureFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setTextureUrl(url);
      setTextureName(file.name);
    }
  };

  // Drag and drop handlers for Canvas area
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const name = file.name.toLowerCase();
      if (
        name.endsWith(".ply") ||
        name.endsWith(".xyz") ||
        name.endsWith(".glb") ||
        name.endsWith(".gltf")
      ) {
        setModelUrl(URL.createObjectURL(file));
        setModelName(file.name);
      } else if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp")) {
        setTextureUrl(URL.createObjectURL(file));
        setTextureName(file.name);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="relative w-screen h-screen bg-neutral-950 text-neutral-100 flex overflow-hidden font-sans select-none">
      {/* Hidden file inputs */}
      <input
        ref={modelInputRef}
        type="file"
        accept=".ply,.xyz,.glb,.gltf"
        className="hidden"
        onChange={handleModelFileChange}
      />
      <input
        ref={textureInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleTextureFileChange}
      />

      {/* Sidebar */}
      <div
        className={`relative z-20 flex flex-col h-full bg-neutral-900/95 backdrop-blur-md border-r border-neutral-800 transition-all duration-300 ease-in-out ${
          isSidebarOpen ? "w-80" : "w-16"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800/80">
          {isSidebarOpen ? (
            <div className="flex items-center space-x-3">
              <Link
                to="/"
                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition"
                title="Back to Home"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="font-bold text-sm tracking-wider text-white uppercase">HELIOSIM</h1>
                <p className="text-[10px] text-amber-400 font-mono">LIDAR SIMULATOR VIEWPORT</p>
              </div>
            </div>
          ) : (
            <Link
              to="/"
              className="mx-auto p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition"
              title="Back to Home"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
          )}

          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition"
            title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            <svg
              className={`w-4 h-4 transform transition-transform ${isSidebarOpen ? "" : "rotate-180"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Sidebar Content */}
        {isSidebarOpen && (
          <div className="flex-1 overflow-y-auto p-4 space-y-6 text-xs">
            {/* 3D Model Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-300 uppercase tracking-wider text-[11px]">
                  LiDAR / 3D Data
                </span>
                {modelUrl && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                    LOADED
                  </span>
                )}
              </div>

              {modelUrl ? (
                <div className="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800 space-y-2">
                  <div className="truncate font-mono text-[11px] text-neutral-200" title={modelName || modelUrl}>
                    {modelName || modelUrl}
                  </div>
                  <button
                    onClick={() => modelInputRef.current?.click()}
                    className="w-full py-1.5 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-center transition font-medium"
                  >
                    Replace LiDAR File (.ply, .xyz, .glb)
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => modelInputRef.current?.click()}
                  className="w-full py-3 px-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-xl text-center transition font-medium flex items-center justify-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>Select .ply or .xyz File</span>
                </button>
              )}
            </div>

            {/* Texture Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-300 uppercase tracking-wider text-[11px]">
                  Texture Map
                </span>
                {textureUrl ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                    APPLIED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-neutral-800 text-neutral-400 font-mono">
                    NONE
                  </span>
                )}
              </div>

              {textureUrl ? (
                <div className="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800 space-y-2">
                  <div className="truncate font-mono text-[11px] text-neutral-200" title={textureName || textureUrl}>
                    {textureName || textureUrl}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => textureInputRef.current?.click()}
                      className="flex-1 py-1.5 px-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-center transition font-medium"
                    >
                      Replace
                    </button>
                    <button
                      onClick={() => {
                        setTextureUrl("");
                        setTextureName("");
                      }}
                      className="py-1.5 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-center transition border border-red-500/20"
                      title="Clear Texture"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => textureInputRef.current?.click()}
                  className="w-full py-2 px-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 rounded-xl text-center transition font-medium flex items-center justify-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Attach Texture File</span>
                </button>
              )}
            </div>

            {/* Model Geometry Stats */}
            {modelStats && (
              <div className="p-3 bg-neutral-950/40 rounded-xl border border-neutral-800/80 space-y-2 font-mono">
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider block">
                  Mesh Inspector
                </span>
                <div className="flex justify-between text-neutral-300">
                  <span>Meshes:</span>
                  <span className="text-white font-semibold">{modelStats.meshes}</span>
                </div>
                <div className="flex justify-between text-neutral-300">
                  <span>Vertices:</span>
                  <span className="text-white font-semibold">
                    {modelStats.vertices.toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            {/* Viewport Settings */}
            <div className="space-y-3 pt-2 border-t border-neutral-800">
              <span className="font-semibold text-neutral-300 uppercase tracking-wider text-[11px] block">
                Viewport Settings
              </span>

              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Ground Grid</span>
                <button
                  onClick={() => setShowGrid(!showGrid)}
                  className={`w-9 h-5 rounded-full transition-colors relative ${
                    showGrid ? "bg-amber-500" : "bg-neutral-700"
                  }`}
                >
                  <span
                    className={`block w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                      showGrid ? "left-5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-neutral-400 text-[11px]">
                  <span>Light Intensity</span>
                  <span className="font-mono text-neutral-200">{lightIntensity.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={lightIntensity}
                  onChange={(e) => setLightIntensity(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Manual URL Input Option */}
            <div className="space-y-2 pt-2 border-t border-neutral-800">
              <span className="font-semibold text-neutral-400 uppercase tracking-wider text-[10px] block">
                Direct URL Inputs
              </span>
              <input
                type="text"
                placeholder="LiDAR File URL (.ply, .xyz, .glb)..."
                value={modelUrl.startsWith("blob:") ? "" : modelUrl}
                onChange={(e) => {
                  setModelUrl(e.target.value);
                  setModelName("Remote LiDAR Data");
                }}
                className="w-full px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-200 font-mono text-[10px] focus:outline-none focus:border-amber-500"
              />
              <input
                type="text"
                placeholder="Texture Image URL..."
                value={textureUrl.startsWith("blob:") ? "" : textureUrl}
                onChange={(e) => {
                  setTextureUrl(e.target.value);
                  setTextureName("Remote URL");
                }}
                className="w-full px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-200 font-mono text-[10px] focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Main 3D Viewport */}
      <div
        className="flex-1 relative w-full h-full overflow-hidden"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {modelUrl ? (
          <Canvas
            className="w-full h-full"
            camera={{ position: [5, 5, 8], fov: 45 }}
            shadows
            gl={{
              antialias: true,
              toneMapping: THREE.ACESFilmicToneMapping,
              outputColorSpace: THREE.SRGBColorSpace,
            }}
          >
            <ambientLight intensity={0.5 * lightIntensity} />
            <directionalLight
              position={[10, 15, 10]}
              intensity={lightIntensity}
              castShadow
              shadow-mapSize-width={2048}
              shadow-mapSize-height={2048}
            />
            <hemisphereLight groundColor="#1e1e24" color="#ffffff" intensity={0.4} />

            {showGrid && (
              <gridHelper
                args={[50, 50, "#f59e0b", "#3f3f46"]}
                position={[0, -0.01, 0]}
              />
            )}

            <Suspense fallback={<CanvasLoader />}>
              <ModelWithTexture
                key={modelUrl}
                modelUrl={modelUrl}
                modelName={modelName}
                textureUrl={textureUrl}
                onModelLoaded={setModelStats}
              />
            </Suspense>

            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.05}
              minDistance={0.5}
              maxDistance={500}
            />
          </Canvas>
        ) : (
          /* Empty State Dropzone */
          <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-radial from-neutral-900 to-neutral-950">
            <div className="max-w-md w-full border-2 border-dashed border-neutral-800 hover:border-amber-500/50 rounded-3xl p-8 text-center transition-all bg-neutral-900/40 backdrop-blur-sm space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>

              <div>
                <h2 className="text-lg font-bold text-white tracking-wide">
                  Load LiDAR / 3D Simulation Data
                </h2>
                <p className="text-xs text-neutral-400 mt-1">
                  Drag and drop a <span className="font-mono text-amber-400 font-semibold">.ply</span> or{" "}
                  <span className="font-mono text-amber-400 font-semibold">.xyz</span> file here, or choose from your computer.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={() => modelInputRef.current?.click()}
                  className="flex-1 py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold rounded-xl text-xs transition shadow-lg shadow-amber-500/20"
                >
                  Browse LiDAR File (.ply / .xyz)
                </button>
                <button
                  onClick={() => textureInputRef.current?.click()}
                  className="flex-1 py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold rounded-xl text-xs transition border border-neutral-700"
                >
                  Select Texture
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Viewport Floating HUD Badge */}
        {modelUrl && (
          <div className="absolute top-4 right-4 z-10 flex items-center space-x-3 bg-neutral-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-neutral-800 text-[11px] font-mono text-neutral-300">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>INTERACTIVE 3D VIEWPORT</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Simulator;
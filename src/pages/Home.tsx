import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

const Home: React.FC = () => {
  const navigate = useNavigate();

  // Selected files & URLs
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [textureFile, setTextureFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Hidden input refs
  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const textureInputRef = useRef<HTMLInputElement | null>(null);

  // Format file sizes into KB / MB
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Handle LiDAR file selection (.ply, .xyz, .glb, .gltf)
  const handleModelSelected = (file: File) => {
    const name = file.name.toLowerCase();
    if (
      name.endsWith(".ply") ||
      name.endsWith(".xyz") ||
      name.endsWith(".glb") ||
      name.endsWith(".gltf")
    ) {
      setModelFile(file);
      setErrorMessage(null);
    } else {
      setErrorMessage("Please select a valid LiDAR file (.ply or .xyz)");
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);

    for (const file of files) {
      const name = file.name.toLowerCase();
      if (
        name.endsWith(".ply") ||
        name.endsWith(".xyz") ||
        name.endsWith(".glb") ||
        name.endsWith(".gltf")
      ) {
        handleModelSelected(file);
      } else if (
        name.endsWith(".png") ||
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg") ||
        name.endsWith(".webp")
      ) {
        setTextureFile(file);
      }
    }
  };

  // Proceed to Simulator
  const handleProceedToSimulator = () => {
    // Generate object URLs for selected files
    const modelUrl = modelFile ? URL.createObjectURL(modelFile) : undefined;
    const textureUrl = textureFile ? URL.createObjectURL(textureFile) : undefined;

    navigate("/simulator", {
      state: {
        modelUrl,
        modelName: modelFile?.name,
        textureUrl,
        textureName: textureFile?.name,
      },
    });
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans select-none antialiased">
      {/* Hidden File Inputs */}
      <input
        ref={modelInputRef}
        type="file"
        accept=".ply,.xyz,.glb,.gltf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleModelSelected(file);
        }}
      />
      <input
        ref={textureInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setTextureFile(file);
        }}
      />

      {/* Top Header: HELIOSIM */}
      <header className="w-full border-b border-neutral-800/80 bg-neutral-900/60 backdrop-blur-md sticky top-0 z-30 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center shadow-lg shadow-amber-500/20 text-neutral-950 font-black text-lg">
              <svg className="w-5 h-5 text-neutral-950" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base tracking-wider text-white">HELIOSIM</span>
                <span className="px-2 py-0.5 text-[10px] font-mono font-medium rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20">
                  SOLAR-THERMAL
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 font-mono">
                Urban Raycasting & Photogrammetry Engine
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4 text-xs font-mono text-neutral-400">
            <span className="hidden sm:inline-flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Native Tauri Shell</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="max-w-2xl w-full space-y-8">
          {/* Header Title & Tagline */}
          <div className="text-center space-y-3">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Urban Solar-Thermal Ingestion
            </h1>
            <p className="text-sm sm:text-base text-neutral-400 max-w-lg mx-auto">
              Upload your drone LiDAR point cloud or mesh data (<span className="text-amber-400 font-mono">.ply</span>,{" "}
              <span className="text-amber-400 font-mono">.xyz</span>) to begin real-time solar raycasting simulation.
            </p>
          </div>

          {/* Upload Box Container */}
          <div className="bg-neutral-900/80 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm space-y-6">
            {/* Primary LiDAR Upload Dropzone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => modelInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-200 group ${
                isDragging
                  ? "border-amber-400 bg-amber-500/10 scale-[1.01]"
                  : modelFile
                  ? "border-emerald-500/50 bg-emerald-500/5 hover:border-emerald-400"
                  : "border-neutral-700 hover:border-amber-500/60 hover:bg-neutral-800/40"
              }`}
            >
              {modelFile ? (
                /* Selected File State */
                <div className="space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-300 font-semibold">
                      LiDAR Data Ready
                    </span>
                    <h3 className="text-base font-semibold text-white mt-2 truncate max-w-sm mx-auto font-mono">
                      {modelFile.name}
                    </h3>
                    <p className="text-xs text-neutral-400 mt-0.5 font-mono">
                      {formatFileSize(modelFile.size)}
                    </p>
                  </div>
                  <p className="text-[11px] text-neutral-400 group-hover:text-amber-400 transition-colors">
                    Click or drop another file to replace
                  </p>
                </div>
              ) : (
                /* Empty Upload Prompt */
                <div className="space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto group-hover:scale-105 transition-transform">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white group-hover:text-amber-300 transition-colors">
                      Upload LiDAR Point Cloud / Mesh
                    </h3>
                    <p className="text-xs text-neutral-400 mt-1">
                      Drag & drop your <span className="font-mono text-amber-400 font-medium">.ply</span> or{" "}
                      <span className="font-mono text-amber-400 font-medium">.xyz</span> file here, or{" "}
                      <span className="text-amber-400 underline font-medium">browse files</span>
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-neutral-400">
                    <span className="bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700 text-amber-400 font-semibold">.PLY</span>
                    <span className="bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700 text-amber-400 font-semibold">.XYZ</span>
                    <span className="bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700">.GLB</span>
                    <span className="bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700">.GLTF</span>
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs text-center font-mono">
                {errorMessage}
              </div>
            )}

            {/* Optional Texture Map Attachment Slot */}
            <div className="flex items-center justify-between p-3.5 bg-neutral-950/60 rounded-xl border border-neutral-800 text-xs">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-neutral-200">
                    {textureFile ? textureFile.name : "Companion Texture / Heatmap"}
                  </p>
                  <p className="text-[11px] text-neutral-400 font-mono">
                    {textureFile ? formatFileSize(textureFile.size) : "Optional orthophoto or false-color map"}
                  </p>
                </div>
              </div>

              {textureFile ? (
                <button
                  type="button"
                  onClick={() => setTextureFile(null)}
                  className="px-2.5 py-1 text-xs text-red-400 hover:text-red-300 font-medium"
                >
                  Remove
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => textureInputRef.current?.click()}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-medium border border-neutral-700 transition"
                >
                  Attach Texture
                </button>
              )}
            </div>

            {/* Action Button: Proceed to Simulator */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleProceedToSimulator}
                className="w-full py-4 px-6 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-neutral-950 font-bold text-sm tracking-wide rounded-2xl shadow-xl shadow-amber-500/20 transition-all duration-150 transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex items-center justify-center space-x-2"
              >
                <span>Proceed to Simulator</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
              {!modelFile && (
                <p className="text-[11px] text-neutral-400 text-center mt-2 font-mono">
                  You can also proceed directly and upload files inside the simulator.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Home;
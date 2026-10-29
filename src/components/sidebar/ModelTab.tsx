import { useRef } from "react";
import { Box, Typography, Button, Switch, Slider } from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { SimulationConfig } from "../../types/simulation";

interface ModelTabProps {
  config: SimulationConfig;
  onChange: (patch: Partial<SimulationConfig>) => void;
  onLoadCustomFile?: (file: File) => void;
  onSelectPresetScene?: (presetId: string) => void;
  isLoading?: boolean;
  error?: string | null;
}

export function ModelTab({
  config,
  onChange,
  onLoadCustomFile,
  onSelectPresetScene,
  isLoading = false,
  error = null,
}: ModelTabProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      onChange({ activeModelName: file.name });
      if (onLoadCustomFile) onLoadCustomFile(file);
      // Reset input value so the browser does not retain the File object in DOM memory
      e.target.value = "";
    }
  };

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* 1. File Upload Dropzone */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #262626",
            pb: 0.75,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "#ffffff",
              fontSize: "0.6875rem",
            }}
          >
            LIDAR POINT CLOUD INGESTION
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: "#737373", fontSize: "0.625rem" }}
          >
            .ply / .las / .laz / .xyz
          </Typography>
        </Box>

        <input
          ref={fileInputRef}
          type="file"
          accept=".ply,.las,.laz,.xyz,.glb,.gltf,.obj"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        <Box
          onClick={() => !isLoading && fileInputRef.current?.click()}
          sx={{
            cursor: isLoading ? "wait" : "pointer",
            p: 3,
            textAlign: "center",
            border: "1px dashed",
            borderColor: isLoading ? "#ffffff" : "#333333",
            bgcolor: isLoading ? "#141414" : "#050505",
            transition: "all 0.2s",
            "&:hover": {
              borderColor: "#ffffff",
              bgcolor: "#0f0f0f",
            },
          }}
        >
          <CloudUploadIcon
            sx={{
              fontSize: 28,
              color: isLoading ? "#ffffff" : "#8a8a8a",
              mb: 1,
              animation: isLoading ? "pulse 1.5s infinite" : "none",
            }}
          />
          <Typography
            variant="caption"
            sx={{ display: "block", color: "#ffffff", fontWeight: 600, fontSize: "0.75rem" }}
          >
            {isLoading ? "CONVERTING POINT CLOUD..." : "LOAD 3D LIDAR / MESH"}
          </Typography>
          <Typography
            variant="caption"
            sx={{ display: "block", color: "#737373", fontSize: "0.625rem", mt: 0.5 }}
          >
            {isLoading
              ? "Stripping headers and generating 3D surface mesh"
              : "Click to browse .ply, .las, .laz, or .xyz file"}
          </Typography>
        </Box>

        {error && (
          <Box sx={{ p: 1, bgcolor: "#3b0000", border: "1px solid #7f1d1d" }}>
            <Typography variant="caption" sx={{ color: "#fca5a5", fontSize: "0.6875rem" }}>
              {error}
            </Typography>
          </Box>
        )}

        {/* Active asset */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            p: 1.25,
            bgcolor: "#0a0a0a",
            border: "1px solid #262626",
          }}
        >
          <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.625rem" }}>
            ACTIVE
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: "#ffffff", fontWeight: 600, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {config.activeModelName}
          </Typography>
        </Box>
      </Box>

      {/* 2. Demo Presets */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, pt: 1, borderTop: "1px solid #262626" }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "#ffffff",
            fontSize: "0.6875rem",
          }}
        >
          DEMO ENVIRONMENTS
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Button
            fullWidth
            variant="outlined"
            onClick={() => {
              onChange({ activeModelName: "Urban Canyon" });
              onSelectPresetScene?.("urban-canyon");
            }}
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              p: 1.25,
              borderColor: "#262626",
              bgcolor: "#0a0a0a",
            }}
          >
            <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 700, fontSize: "0.75rem" }}>
              Urban Canyon
            </Typography>
            <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.625rem" }}>
              High-density towers casting deep mutual solar shadows
            </Typography>
          </Button>

          <Button
            fullWidth
            variant="outlined"
            onClick={() => {
              onChange({ activeModelName: "Solar Rooftop" });
              onSelectPresetScene?.("solar-rooftop");
            }}
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              p: 1.25,
              borderColor: "#262626",
              bgcolor: "#0a0a0a",
            }}
          >
            <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 700, fontSize: "0.75rem" }}>
              Solar Rooftop
            </Typography>
            <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.625rem" }}>
              Commercial flat roof with parapets and HVAC obstacles
            </Typography>
          </Button>
        </Box>
      </Box>

      {/* 3. Geometry Telemetry */}
      {config.meshStats && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, pt: 1, borderTop: "1px solid #262626" }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "#ffffff",
              fontSize: "0.6875rem",
            }}
          >
            MESH TELEMETRY
          </Typography>

          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, p: 1.5, bgcolor: "#0a0a0a", border: "1px solid #262626" }}>
            <Box>
              <Typography variant="caption" sx={{ color: "#525252", fontSize: "0.5625rem", display: "block" }}>
                TRIANGLES
              </Typography>
              <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 600 }}>
                {config.meshStats.triangles.toLocaleString()}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: "#525252", fontSize: "0.5625rem", display: "block" }}>
                VERTICES
              </Typography>
              <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 600 }}>
                {config.meshStats.vertices.toLocaleString()}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: "#525252", fontSize: "0.5625rem", display: "block" }}>
                BOUNDS (X × Z)
              </Typography>
              <Typography variant="caption" sx={{ color: "#a3a3a3" }}>
                {config.meshStats.bounds.x.toFixed(1)}m × {config.meshStats.bounds.z.toFixed(1)}m
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: "#525252", fontSize: "0.5625rem", display: "block" }}>
                HEIGHT (Y)
              </Typography>
              <Typography variant="caption" sx={{ color: "#a3a3a3" }}>
                {config.meshStats.bounds.y.toFixed(1)}m
              </Typography>
            </Box>
          </Box>
        </Box>
      )}

      {/* 4. Point Cloud & Display Mode */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, pt: 1, borderTop: "1px solid #262626" }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "#ffffff",
            fontSize: "0.6875rem",
          }}
        >
          DISPLAY MODE & ORIENTATION
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
            <Button
              size="small"
              variant={config.renderMode !== "mesh" ? "contained" : "outlined"}
              onClick={() => onChange({ renderMode: "pointcloud" })}
              sx={{
                bgcolor: config.renderMode !== "mesh" ? "#ffffff" : "#0a0a0a",
                color: config.renderMode !== "mesh" ? "#000000" : "#a3a3a3",
                borderColor: "#262626",
                fontSize: "0.6875rem",
                fontWeight: 700,
                "&:hover": {
                  bgcolor: config.renderMode !== "mesh" ? "#e5e5e5" : "#171717",
                },
              }}
            >
              Point Cloud
            </Button>
            <Button
              size="small"
              variant={config.renderMode === "mesh" ? "contained" : "outlined"}
              onClick={() => onChange({ renderMode: "mesh" })}
              sx={{
                bgcolor: config.renderMode === "mesh" ? "#ffffff" : "#0a0a0a",
                color: config.renderMode === "mesh" ? "#000000" : "#a3a3a3",
                borderColor: "#262626",
                fontSize: "0.6875rem",
                fontWeight: 700,
                "&:hover": {
                  bgcolor: config.renderMode === "mesh" ? "#e5e5e5" : "#171717",
                },
              }}
            >
              Surface Mesh
            </Button>
          </Box>

          {config.renderMode !== "mesh" && (
            <Box sx={{ p: 1, border: "1px solid #262626", bgcolor: "#050505" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.625rem" }}>
                  POINT SIZE
                </Typography>
                <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 600, fontSize: "0.625rem" }}>
                  {(config.pointSize ?? 0.08).toFixed(2)}m
                </Typography>
              </Box>
              <Slider
                size="small"
                min={0.01}
                max={0.5}
                step={0.01}
                value={config.pointSize ?? 0.08}
                onChange={(_, v) => onChange({ pointSize: v as number })}
                sx={{
                  color: "#ffffff",
                  height: 3,
                  "& .MuiSlider-thumb": { width: 10, height: 10 },
                }}
              />
            </Box>
          )}

          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 1, border: "1px solid #262626", bgcolor: "#050505" }}>
            <Box>
              <Typography variant="caption" sx={{ color: "#ffffff", fontSize: "0.6875rem", display: "block" }}>
                Z-Up (GIS LiDAR)
              </Typography>
              <Typography variant="caption" sx={{ color: "#525252", fontSize: "0.5625rem" }}>
                Rotate Elevation from Z to Y
              </Typography>
            </Box>
            <Switch
              size="small"
              checked={Boolean(config.orientZUp)}
              onChange={(e) => onChange({ orientZUp: e.target.checked })}
            />
          </Box>
        </Box>
      </Box>

      {/* 5. Viewport Overlays */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, pt: 1, borderTop: "1px solid #262626" }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "#ffffff",
            fontSize: "0.6875rem",
          }}
        >
          VIEWPORT OVERLAYS
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 1, border: "1px solid #262626", bgcolor: "#050505" }}>
            <Typography variant="caption" sx={{ color: "#ffffff", fontSize: "0.6875rem" }}>
              Ground Spatial Grid
            </Typography>
            <Switch
              size="small"
              checked={config.showGrid}
              onChange={(e) => onChange({ showGrid: e.target.checked })}
            />
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 1, border: "1px solid #262626", bgcolor: "#050505" }}>
            <Typography variant="caption" sx={{ color: "#ffffff", fontSize: "0.6875rem" }}>
              Solar Vector Sphere
            </Typography>
            <Switch
              size="small"
              checked={config.showSunSphere}
              onChange={(e) => onChange({ showSunSphere: e.target.checked })}
            />
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 1, border: "1px solid #262626", bgcolor: "#050505" }}>
            <Typography variant="caption" sx={{ color: "#ffffff", fontSize: "0.6875rem" }}>
              Mesh Wireframe
            </Typography>
            <Switch
              size="small"
              checked={config.wireframe}
              onChange={(e) => onChange({ wireframe: e.target.checked })}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

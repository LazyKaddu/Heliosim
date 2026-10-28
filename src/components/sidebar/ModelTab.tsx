import { useRef } from "react";
import { Box, Typography, Button, Switch } from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { SimulationConfig } from "../../types/simulation";

interface ModelTabProps {
  config: SimulationConfig;
  onChange: (patch: Partial<SimulationConfig>) => void;
  onLoadCustomFile?: (file: File) => void;
  onSelectPresetScene?: (presetId: string) => void;
}

export function ModelTab({
  config,
  onChange,
  onLoadCustomFile,
  onSelectPresetScene,
}: ModelTabProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      onChange({ activeModelName: file.name });
      if (onLoadCustomFile) onLoadCustomFile(file);
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
            3D MESH INGESTION
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: "#737373", fontSize: "0.625rem" }}
          >
            .glb / .gltf / .obj
          </Typography>
        </Box>

        <input
          ref={fileInputRef}
          type="file"
          accept=".glb,.gltf,.obj,.ply,.xyz"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        <Box
          onClick={() => fileInputRef.current?.click()}
          sx={{
            cursor: "pointer",
            p: 3,
            textAlign: "center",
            border: "1px dashed #333333",
            bgcolor: "#050505",
            transition: "all 0.2s",
            "&:hover": {
              borderColor: "#ffffff",
              bgcolor: "#0f0f0f",
            },
          }}
        >
          <CloudUploadIcon sx={{ fontSize: 28, color: "#8a8a8a", mb: 1 }} />
          <Typography
            variant="caption"
            sx={{ display: "block", color: "#ffffff", fontWeight: 600, fontSize: "0.75rem" }}
          >
            LOAD 3D LIDAR / MESH
          </Typography>
          <Typography
            variant="caption"
            sx={{ display: "block", color: "#737373", fontSize: "0.625rem", mt: 0.5 }}
          >
            Click to browse photogrammetry file
          </Typography>
        </Box>

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

      {/* 4. Viewport Overlays */}
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

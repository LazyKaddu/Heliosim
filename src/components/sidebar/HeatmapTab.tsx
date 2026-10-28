import { Box, Typography, Button, Switch, Slider } from "@mui/material";
import { ColorPalette, SimulationConfig } from "../../types/simulation";

interface HeatmapTabProps {
  config: SimulationConfig;
  onChange: (patch: Partial<SimulationConfig>) => void;
}

const PALETTES: { id: ColorPalette; name: string; gradient: string }[] = [
  {
    id: "solar",
    name: "Solar Spectral",
    gradient: "linear-gradient(to right, #001f3f, #0074d9, #2ecc40, #ffdc00, #ff4136)",
  },
  {
    id: "turbo",
    name: "Turbo Scale",
    gradient: "linear-gradient(to right, #30123b, #4185f4, #2ba548, #eab308, #d9381e)",
  },
  {
    id: "magma",
    name: "Magma Radiance",
    gradient: "linear-gradient(to right, #000004, #51127c, #b73779, #fc8961, #fcfdbf)",
  },
  {
    id: "viridis",
    name: "Viridis Sequential",
    gradient: "linear-gradient(to right, #440154, #3b528b, #21918c, #5ec962, #fde725)",
  },
];

export function HeatmapTab({ config, onChange }: HeatmapTabProps) {
  const isAnnual = config.mode === "annual";
  const unit = isAnnual ? "kWh/m²" : "W/m²";

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* 1. Master Heatmap Switch */}
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
            HEATMAP ENGINE
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: "#737373", fontSize: "0.625rem" }}
          >
            TSL Material
          </Typography>
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            p: 1.5,
            border: "1px solid #262626",
            bgcolor: "#050505",
          }}
        >
          <Box>
            <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 600, display: "block" }}>
              Surface Thermal Overlay
            </Typography>
            <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.625rem" }}>
              Project solar raycast flux to mesh
            </Typography>
          </Box>
          <Switch
            checked={config.showHeatmap}
            onChange={(e) => onChange({ showHeatmap: e.target.checked })}
          />
        </Box>
      </Box>

      {/* 2. Color Ramp Palette */}
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
          COLOR SPECTRUM
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {PALETTES.map((palette) => {
            const isSelected = config.colorPalette === palette.id;
            return (
              <Box
                key={palette.id}
                component="button"
                onClick={() => onChange({ colorPalette: palette.id })}
                sx={{
                  p: 1.25,
                  textAlign: "left",
                  bgcolor: isSelected ? "#141414" : "#050505",
                  border: isSelected ? "1px solid #ffffff" : "1px solid #262626",
                  cursor: "pointer",
                  "&:hover": { borderColor: "#525252" },
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: isSelected ? "#ffffff" : "#8a8a8a",
                      fontWeight: isSelected ? 700 : 500,
                      fontSize: "0.6875rem",
                    }}
                  >
                    {palette.name}
                  </Typography>
                  {isSelected && (
                    <Typography variant="caption" sx={{ color: "#ffffff", fontSize: "0.5625rem", fontWeight: 700 }}>
                      ACTIVE
                    </Typography>
                  )}
                </Box>
                <Box
                  sx={{
                    width: "100%",
                    height: 10,
                    background: palette.gradient,
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                />
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* 3. Normalization Thresholds */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1, borderTop: "1px solid #262626" }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "#ffffff",
              fontSize: "0.6875rem",
            }}
          >
            NORMALIZATION ({unit})
          </Typography>
          <Button
            size="small"
            variant="text"
            onClick={() => onChange({ minThermal: 0, maxThermal: isAnnual ? 1800 : 1000 })}
            sx={{ p: 0, minWidth: 0, fontSize: "0.625rem", color: "#a3a3a3", "&:hover": { color: "#ffffff" } }}
          >
            Reset
          </Button>
        </Box>

        {/* Min Threshold */}
        <Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.625rem" }}>
              MIN VALUE (0% EXPOSURE)
            </Typography>
            <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 600 }}>
              {config.minThermal} {unit}
            </Typography>
          </Box>
          <Slider
            min={0}
            max={isAnnual ? 500 : 300}
            step={10}
            value={config.minThermal}
            onChange={(_, val) => onChange({ minThermal: val as number })}
          />
        </Box>

        {/* Max Threshold */}
        <Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.625rem" }}>
              MAX VALUE (100% EXPOSURE)
            </Typography>
            <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 600 }}>
              {config.maxThermal} {unit}
            </Typography>
          </Box>
          <Slider
            min={isAnnual ? 500 : 300}
            max={isAnnual ? 3000 : 1500}
            step={25}
            value={config.maxThermal}
            onChange={(_, val) => onChange({ maxThermal: val as number })}
          />
        </Box>

        {/* Opacity */}
        <Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.625rem" }}>
              SURFACE OPACITY
            </Typography>
            <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 600 }}>
              {Math.round(config.opacity * 100)}%
            </Typography>
          </Box>
          <Slider
            min={0.1}
            max={1.0}
            step={0.05}
            value={config.opacity}
            onChange={(_, val) => onChange({ opacity: val as number })}
          />
        </Box>
      </Box>

      {/* 4. Radiative Transfer Physics */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1, borderTop: "1px solid #262626" }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "#ffffff",
            fontSize: "0.6875rem",
          }}
        >
          RADIATIVE PARAMETERS
        </Typography>

        <Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.625rem" }}>
              SURFACE ALBEDO
            </Typography>
            <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 600 }}>
              {config.albedo.toFixed(2)}
            </Typography>
          </Box>
          <Slider
            min={0.0}
            max={0.8}
            step={0.05}
            value={config.albedo}
            onChange={(_, val) => onChange({ albedo: val as number })}
          />
        </Box>

        <Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.625rem" }}>
              MAX RAY BOUNCES
            </Typography>
            <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 600 }}>
              {config.maxBounces}
            </Typography>
          </Box>
          <Slider
            min={1}
            max={5}
            step={1}
            value={config.maxBounces}
            onChange={(_, val) => onChange({ maxBounces: val as number })}
          />
        </Box>
      </Box>
    </Box>
  );
}

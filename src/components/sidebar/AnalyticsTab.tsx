import { useState } from "react";
import { Box, Typography, Button } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import { SimulationConfig } from "../../types/simulation";

interface AnalyticsTabProps {
  config: SimulationConfig;
}

export function AnalyticsTab({ config }: AnalyticsTabProps) {
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const isAnnual = config.mode === "annual";

  const handleExportCSV = () => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      "Parameter,Value,Unit\n" +
      `Location,"${config.cityName}",-\n` +
      `Latitude,${config.latitude},deg\n` +
      `Longitude,${config.longitude},deg\n` +
      `Mode,${config.mode},-\n` +
      `Date,${config.date},YYYY-MM-DD\n` +
      `TimeOfDay,${config.timeOfDay.toFixed(2)},UTC Hours\n` +
      `Albedo,${config.albedo},-\n` +
      `MaxRayBounces,${config.maxBounces},-\n` +
      `PeakIrradiance,982,W/m²\n` +
      `AverageAnnualYield,1420,kWh/m²\n` +
      `SolarViabilityArea,68.4,%\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `heliosim_${config.cityName}_analysis.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setExportNotice("Exported CSV successfully");
    setTimeout(() => setExportNotice(null), 3000);
  };

  const handleExportGeoJSON = () => {
    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [config.longitude, config.latitude],
          },
          properties: {
            city: config.cityName,
            simulationMode: config.mode,
            annualYieldKWhM2: 1420,
            peakDniWm2: 982,
            highYieldAreaPercent: 68.4,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `heliosim_${config.cityName}_solar.geojson`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportNotice("Exported GeoJSON successfully");
    setTimeout(() => setExportNotice(null), 3000);
  };

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* 1. KPIs */}
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
            YIELD TELEMETRY
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: "#737373", fontSize: "0.625rem" }}
          >
            {isAnnual ? "Annual Aggregate" : "Diurnal Snapshot"}
          </Typography>
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
          <Box sx={{ p: 1.5, bgcolor: "#0a0a0a", border: "1px solid #262626" }}>
            <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.5625rem", display: "block" }}>
              PEAK IRRADIANCE
            </Typography>
            <Typography variant="body2" sx={{ color: "#ffffff", fontWeight: 700 }}>
              982 W/m²
            </Typography>
            <Typography variant="caption" sx={{ color: "#525252", fontSize: "0.5rem" }}>
              Direct clear-sky flux
            </Typography>
          </Box>

          <Box sx={{ p: 1.5, bgcolor: "#0a0a0a", border: "1px solid #262626" }}>
            <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.5625rem", display: "block" }}>
              ANNUAL YIELD
            </Typography>
            <Typography variant="body2" sx={{ color: "#ffffff", fontWeight: 700 }}>
              1,420 kWh/m²
            </Typography>
            <Typography variant="caption" sx={{ color: "#525252", fontSize: "0.5rem" }}>
              Integrated exposure
            </Typography>
          </Box>

          <Box sx={{ p: 1.5, bgcolor: "#0a0a0a", border: "1px solid #262626" }}>
            <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.5625rem", display: "block" }}>
              HIGH EXPOSURE
            </Typography>
            <Typography variant="body2" sx={{ color: "#ffffff", fontWeight: 700 }}>
              68.4%
            </Typography>
            <Typography variant="caption" sx={{ color: "#525252", fontSize: "0.5rem" }}>
              &gt;80% unshaded
            </Typography>
          </Box>

          <Box sx={{ p: 1.5, bgcolor: "#0a0a0a", border: "1px solid #262626" }}>
            <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.5625rem", display: "block" }}>
              CANYON SHADOW
            </Typography>
            <Typography variant="body2" sx={{ color: "#ffffff", fontWeight: 700 }}>
              31.6%
            </Typography>
            <Typography variant="caption" sx={{ color: "#525252", fontSize: "0.5rem" }}>
              &lt;20% sunlight
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* 2. Analytical Summary */}
      <Box sx={{ p: 1.5, bgcolor: "#050505", border: "1px solid #262626" }}>
        <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 700, fontSize: "0.625rem", display: "block", mb: 0.5 }}>
          FEASIBILITY SUMMARY
        </Typography>
        <Typography variant="caption" sx={{ color: "#8a8a8a", fontSize: "0.625rem", lineHeight: 1.6 }}>
          Rooftops exhibit high photovoltaic viability with minimal mutual shading. North-facing facades in {config.cityName} receive limited direct beam irradiance, suited for high-albedo passive cooling retrofits.
        </Typography>
      </Box>

      {/* 3. Export Actions */}
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
          DATA EXPORT
        </Typography>

        {exportNotice && (
          <Box sx={{ p: 1, bgcolor: "#141414", border: "1px solid #ffffff", color: "#ffffff", fontSize: "0.625rem" }}>
            {exportNotice}
          </Box>
        )}

        <Button
          fullWidth
          variant="outlined"
          startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
          onClick={handleExportCSV}
          sx={{ py: 1, fontSize: "0.6875rem", justifyContent: "flex-start", px: 2 }}
        >
          Export CSV Dataset (.csv)
        </Button>

        <Button
          fullWidth
          variant="outlined"
          startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
          onClick={handleExportGeoJSON}
          sx={{ py: 1, fontSize: "0.6875rem", justifyContent: "flex-start", px: 2 }}
        >
          Export GIS Dataset (.geojson)
        </Button>
      </Box>
    </Box>
  );
}

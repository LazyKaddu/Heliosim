import { ThemeProvider, Box, Typography } from "@mui/material";
import { monoTheme } from "../../theme/monoTheme";
import { SimulationConfig } from "../../types/simulation";
import { SidebarHeader } from "./SidebarHeader";
import { LocationSunTab } from "./LocationSunTab";
import { ModelTab } from "./ModelTab";
import { HeatmapTab } from "./HeatmapTab";
import { AnalyticsTab } from "./AnalyticsTab";

interface SidebarProps {
  config: SimulationConfig;
  onChange: (patch: Partial<SimulationConfig>) => void;
  webGpuAvailable: boolean;
  onLoadCustomFile?: (file: File) => void;
  onSelectPresetScene?: (presetId: string) => void;
  isLoadingModel?: boolean;
  modelError?: string | null;
}

export function Sidebar({
  config,
  onChange,
  webGpuAvailable,
  onLoadCustomFile,
  onSelectPresetScene,
  isLoadingModel = false,
  modelError = null,
}: SidebarProps) {
  return (
    <ThemeProvider theme={monoTheme}>
      <Box
        component="aside"
        sx={{
          width: "24%",
          minWidth: 340,
          maxWidth: 460,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          bgcolor: "#000000",
          borderLeft: "1px solid #262626",
          userSelect: "none",
          overflow: "hidden",
        }}
      >
        {/* Top Header & Tabs */}
        <SidebarHeader
          activeTab={config.activeTab}
          onTabChange={(tab) => onChange({ activeTab: tab })}
          webGpuAvailable={webGpuAvailable}
        />

        {/* Scrollable Body */}
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            bgcolor: "#000000",
          }}
        >
          {config.activeTab === "location" && (
            <LocationSunTab config={config} onChange={onChange} />
          )}
          {config.activeTab === "model" && (
            <ModelTab
              config={config}
              onChange={onChange}
              onLoadCustomFile={onLoadCustomFile}
              onSelectPresetScene={onSelectPresetScene}
              isLoading={isLoadingModel}
              error={modelError}
            />
          )}
          {config.activeTab === "heatmap" && (
            <HeatmapTab config={config} onChange={onChange} />
          )}
          {config.activeTab === "analytics" && (
            <AnalyticsTab config={config} />
          )}
        </Box>

        {/* Bottom Status Footer */}
        <Box
          sx={{
            px: 2,
            py: 1.25,
            borderTop: "1px solid #1a1a1a",
            bgcolor: "#050505",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ width: 6, height: 6, bgcolor: "#ffffff" }} />
            <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 600, fontSize: "0.6875rem" }}>
              {config.cityName}
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.625rem" }}>
            {config.mode === "annual" ? "ANNUAL (kWh/m²)" : "DIURNAL (W/m²)"}
          </Typography>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

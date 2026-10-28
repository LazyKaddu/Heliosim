import { Box, Typography, Tabs, Tab } from "@mui/material";
import { SidebarTab } from "../../types/simulation";

interface SidebarHeaderProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  webGpuAvailable: boolean;
}

export function SidebarHeader({
  activeTab,
  onTabChange,
  webGpuAvailable,
}: SidebarHeaderProps) {
  return (
    <Box sx={{ borderBottom: "1px solid #262626", bgcolor: "#000000" }}>
      {/* Top Branding & Engine Status */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.25,
          borderBottom: "1px solid #1a1a1a",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ width: 8, height: 8, bgcolor: "#ffffff" }} />
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              letterSpacing: "0.15em",
              color: "#ffffff",
              fontSize: "0.75rem",
            }}
          >
            HELIOSIM
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: "#525252", fontSize: "0.625rem" }}
          >
            v0.1.0
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            sx={{
              width: 6,
              height: 6,
              bgcolor: webGpuAvailable ? "#ffffff" : "#737373",
            }}
          />
          <Typography
            variant="caption"
            sx={{
              fontSize: "0.625rem",
              color: "#8a8a8a",
              letterSpacing: "0.08em",
            }}
          >
            {webGpuAvailable ? "WEBGPU" : "WEBGL2"}
          </Typography>
        </Box>
      </Box>

      {/* MUI Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, val) => onTabChange(val as SidebarTab)}
        variant="fullWidth"
      >
        <Tab value="location" label="SUN & MAP" />
        <Tab value="model" label="3D MODEL" />
        <Tab value="heatmap" label="HEATMAP" />
        <Tab value="analytics" label="METRICS" />
      </Tabs>
    </Box>
  );
}

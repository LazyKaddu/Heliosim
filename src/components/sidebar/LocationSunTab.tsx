import { useState, useMemo } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Slider,
  Select,
  MenuItem,
  FormControl,
} from "@mui/material";
import MapIcon from "@mui/icons-material/Map";
import {
  SimulationConfig,
  AnnualPeriod,
  AnnualFidelity,
} from "../../types/simulation";
import { getSolarPosition, dateToDayOfYear } from "../../core/SolarMath";
import { CITY_PRESETS } from "../../utils/demoModels";
import { MapPickerModal } from "../map/MapPickerModal";

interface LocationSunTabProps {
  config: SimulationConfig;
  onChange: (patch: Partial<SimulationConfig>) => void;
}

export function LocationSunTab({ config, onChange }: LocationSunTabProps) {
  const [isMapOpen, setIsMapOpen] = useState(false);

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

  const formatTime = (decimalHours: number): string => {
    const hours = Math.floor(decimalHours);
    const minutes = Math.floor((decimalHours - hours) * 60);
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`;
  };

  const handleRunAnnualSimulation = () => {
    onChange({ isSimulatingAnnual: true, annualProgress: 0 });
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      if (progress >= 100) {
        clearInterval(interval);
        onChange({ isSimulatingAnnual: false, annualProgress: 100 });
      } else {
        onChange({ annualProgress: progress });
      }
    }, 120);
  };

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* 1. Geographic Location & Coordinates */}
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
            GEOGRAPHIC LOCATION
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: "#737373", fontSize: "0.625rem" }}
          >
            {config.cityName}
          </Typography>
        </Box>

        {/* Map Picker Trigger Button */}
        <Button
          fullWidth
          variant="outlined"
          startIcon={<MapIcon sx={{ fontSize: 16 }} />}
          onClick={() => setIsMapOpen(true)}
          sx={{
            py: 1,
            borderColor: "#333333",
            bgcolor: "#0a0a0a",
            color: "#ffffff",
            "&:hover": { borderColor: "#ffffff", bgcolor: "#141414" },
          }}
        >
          Open Interactive Map
        </Button>

        {/* Lat / Long Coordinates Input */}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
          <Box>
            <Typography
              variant="caption"
              sx={{ color: "#737373", fontSize: "0.625rem", display: "block", mb: 0.5 }}
            >
              LATITUDE (°N)
            </Typography>
            <TextField
              size="small"
              fullWidth
              type="number"
              value={config.latitude}
              onChange={(e) =>
                onChange({
                  latitude: parseFloat(e.target.value) || 0,
                  cityName: "Custom Coordinates",
                })
              }
            />
          </Box>
          <Box>
            <Typography
              variant="caption"
              sx={{ color: "#737373", fontSize: "0.625rem", display: "block", mb: 0.5 }}
            >
              LONGITUDE (°E)
            </Typography>
            <TextField
              size="small"
              fullWidth
              type="number"
              value={config.longitude}
              onChange={(e) =>
                onChange({
                  longitude: parseFloat(e.target.value) || 0,
                  cityName: "Custom Coordinates",
                })
              }
            />
          </Box>
        </Box>

        {/* City Presets Chips */}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, pt: 0.5 }}>
          {CITY_PRESETS.map((city) => {
            const isSelected = config.cityName === city.name;
            return (
              <Box
                key={city.name}
                component="button"
                onClick={() =>
                  onChange({
                    latitude: city.latitude,
                    longitude: city.longitude,
                    cityName: city.name,
                  })
                }
                sx={{
                  px: 1,
                  py: 0.25,
                  fontSize: "0.625rem",
                  fontFamily: '"JetBrains Mono", monospace',
                  cursor: "pointer",
                  bgcolor: isSelected ? "#ffffff" : "#0d0d0d",
                  color: isSelected ? "#000000" : "#8a8a8a",
                  border: isSelected ? "1px solid #ffffff" : "1px solid #262626",
                  "&:hover": {
                    borderColor: "#666666",
                    color: isSelected ? "#000000" : "#ffffff",
                  },
                }}
              >
                {city.name}
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* 2. Simulation Mode Selector */}
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
          SIMULATION MODE
        </Typography>

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.5, bgcolor: "#0a0a0a", p: 0.5, border: "1px solid #262626" }}>
          <Box
            component="button"
            onClick={() => onChange({ mode: "diurnal" })}
            sx={{
              py: 0.75,
              fontSize: "0.6875rem",
              fontFamily: '"JetBrains Mono", monospace',
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              bgcolor: config.mode === "diurnal" ? "#ffffff" : "transparent",
              color: config.mode === "diurnal" ? "#000000" : "#737373",
              "&:hover": {
                color: config.mode === "diurnal" ? "#000000" : "#ffffff",
              },
            }}
          >
            TODAY / DIURNAL
          </Box>
          <Box
            component="button"
            onClick={() => onChange({ mode: "annual" })}
            sx={{
              py: 0.75,
              fontSize: "0.6875rem",
              fontFamily: '"JetBrains Mono", monospace',
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              bgcolor: config.mode === "annual" ? "#ffffff" : "transparent",
              color: config.mode === "annual" ? "#000000" : "#737373",
              "&:hover": {
                color: config.mode === "annual" ? "#000000" : "#ffffff",
              },
            }}
          >
            ANNUAL ACCUMULATE
          </Box>
        </Box>
      </Box>

      {/* 3. Conditional Mode Controls */}
      {config.mode === "diurnal" ? (
        <Box sx={{ p: 1.5, border: "1px solid #262626", bgcolor: "#050505", display: "flex", flexDirection: "column", gap: 2 }}>
          {/* Date Picker */}
          <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.625rem" }}>
                CALENDAR DATE
              </Typography>
              <Typography
                variant="caption"
                onClick={() => onChange({ date: new Date().toISOString().split("T")[0] })}
                sx={{ color: "#ffffff", fontSize: "0.625rem", cursor: "pointer", textDecoration: "underline" }}
              >
                Set Today
              </Typography>
            </Box>
            <TextField
              size="small"
              fullWidth
              type="date"
              value={config.date}
              onChange={(e) => onChange({ date: e.target.value })}
            />
          </Box>

          {/* Time of Day Slider */}
          <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.625rem" }}>
                TIME OF DAY (UTC)
              </Typography>
              <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 700 }}>
                {formatTime(config.timeOfDay)}
              </Typography>
            </Box>
            <Slider
              min={0}
              max={24}
              step={0.1}
              value={config.timeOfDay}
              onChange={(_, val) => onChange({ timeOfDay: val as number })}
            />
            <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
              <Typography variant="caption" sx={{ color: "#525252", fontSize: "0.5625rem" }}>00:00</Typography>
              <Typography variant="caption" sx={{ color: "#525252", fontSize: "0.5625rem" }}>12:00</Typography>
              <Typography variant="caption" sx={{ color: "#525252", fontSize: "0.5625rem" }}>24:00</Typography>
            </Box>
          </Box>

          {/* Controls */}
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              fullWidth
              variant={config.isPlaying ? "contained" : "outlined"}
              onClick={() => onChange({ isPlaying: !config.isPlaying })}
              sx={{
                py: 0.75,
                fontSize: "0.6875rem",
                bgcolor: config.isPlaying ? "#ffffff" : "#0d0d0d",
                color: config.isPlaying ? "#000000" : "#ffffff",
              }}
            >
              {config.isPlaying ? "PAUSE SUN" : "PLAY SUN LOOP"}
            </Button>
            <Button
              variant="outlined"
              onClick={() => onChange({ timeOfDay: 12.0 })}
              sx={{ px: 2, fontSize: "0.6875rem" }}
            >
              NOON
            </Button>
          </Box>
        </Box>
      ) : (
        <Box sx={{ p: 1.5, border: "1px solid #262626", bgcolor: "#050505", display: "flex", flexDirection: "column", gap: 2 }}>
          {/* Period Selector */}
          <Box>
            <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.625rem", display: "block", mb: 0.5 }}>
              INTEGRATION PERIOD
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={config.annualPeriod}
                onChange={(e) => onChange({ annualPeriod: e.target.value as AnnualPeriod })}
              >
                <MenuItem value="year">Full Calendar Year (365 Days)</MenuItem>
                <MenuItem value="summer">Summer Solstice Season</MenuItem>
                <MenuItem value="winter">Winter Solstice Season</MenuItem>
                <MenuItem value="equinox">Spring / Autumn Equinoxes</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Fidelity */}
          <Box>
            <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.625rem", display: "block", mb: 0.5 }}>
              COMPUTATION RESOLUTION
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={config.annualFidelity}
                onChange={(e) => onChange({ annualFidelity: e.target.value as AnnualFidelity })}
              >
                <MenuItem value="standard">Standard (12 Sample Months × Hourly)</MenuItem>
                <MenuItem value="high">High Precision (52 Weekly Steps × Hourly)</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Run Button */}
          <Button
            fullWidth
            variant="contained"
            disabled={config.isSimulatingAnnual}
            onClick={handleRunAnnualSimulation}
            sx={{ py: 1, fontSize: "0.6875rem" }}
          >
            {config.isSimulatingAnnual
              ? `SIMULATING (${config.annualProgress}%)...`
              : "RUN ANNUAL SIMULATION"}
          </Button>

          {config.isSimulatingAnnual && (
            <Box sx={{ width: "100%", height: 3, bgcolor: "#262626", overflow: "hidden" }}>
              <Box sx={{ width: `${config.annualProgress}%`, height: "100%", bgcolor: "#ffffff", transition: "width 0.15s" }} />
            </Box>
          )}
        </Box>
      )}

      {/* 4. Solar Ephemeris Telemetry */}
      <Box sx={{ p: 1.5, border: "1px solid #262626", bgcolor: "#0a0a0a", display: "flex", flexDirection: "column", gap: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #1a1a1a", pb: 0.5 }}>
          <Typography variant="caption" sx={{ color: "#737373", fontSize: "0.625rem" }}>
            SOLAR POSITION (SPA)
          </Typography>
          <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 700, fontSize: "0.625rem" }}>
            {solarEphemeris.isDaylight ? "● DAYLIGHT" : "○ NIGHT"}
          </Typography>
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
          <Box>
            <Typography variant="caption" sx={{ color: "#525252", fontSize: "0.5625rem", display: "block" }}>
              ELEVATION
            </Typography>
            <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 600 }}>
              {solarEphemeris.elevationDeg.toFixed(1)}°
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: "#525252", fontSize: "0.5625rem", display: "block" }}>
              AZIMUTH
            </Typography>
            <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 600 }}>
              {solarEphemeris.azimuthDeg.toFixed(1)}°
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: "#525252", fontSize: "0.5625rem", display: "block" }}>
              DNI FLUX
            </Typography>
            <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 600 }}>
              {solarEphemeris.dni.toFixed(0)} W/m²
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: "#525252", fontSize: "0.5625rem", display: "block" }}>
              ZENITH
            </Typography>
            <Typography variant="caption" sx={{ color: "#ffffff", fontWeight: 600 }}>
              {solarEphemeris.zenithDeg.toFixed(1)}°
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Map Modal */}
      <MapPickerModal
        isOpen={isMapOpen}
        initialLat={config.latitude}
        initialLng={config.longitude}
        initialCity={config.cityName}
        onSelect={(lat, lng, city) =>
          onChange({ latitude: lat, longitude: lng, cityName: city })
        }
        onClose={() => setIsMapOpen(false)}
      />
    </Box>
  );
}

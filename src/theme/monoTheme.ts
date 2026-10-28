import { createTheme } from "@mui/material/styles";

export const monoTheme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#000000",
      paper: "#0a0a0a",
    },
    primary: {
      main: "#ffffff",
      light: "#f5f5f5",
      dark: "#d4d4d4",
      contrastText: "#000000",
    },
    secondary: {
      main: "#737373",
      light: "#a3a3a3",
      dark: "#404040",
      contrastText: "#ffffff",
    },
    text: {
      primary: "#ffffff",
      secondary: "#8a8a8a",
      disabled: "#525252",
    },
    divider: "#262626",
  },
  typography: {
    fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
    fontSize: 12,
    button: {
      textTransform: "none",
      fontWeight: 600,
      letterSpacing: "0.05em",
    },
  },
  shape: {
    borderRadius: 0, // Sharp square technical corners
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          border: "1px solid #333333",
          backgroundColor: "#0d0d0d",
          color: "#ffffff",
          "&:hover": {
            backgroundColor: "#1a1a1a",
            borderColor: "#666666",
          },
        },
        contained: {
          backgroundColor: "#ffffff",
          color: "#000000",
          border: "1px solid #ffffff",
          "&:hover": {
            backgroundColor: "#e5e5e5",
            borderColor: "#ffffff",
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 36,
          borderBottom: "1px solid #262626",
          backgroundColor: "#050505",
        },
        indicator: {
          backgroundColor: "#ffffff",
          height: 2,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 36,
          padding: "6px 12px",
          fontSize: "0.6875rem",
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: "#737373",
          "&.Mui-selected": {
            color: "#ffffff",
            backgroundColor: "#0d0d0d",
          },
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: "#ffffff",
          height: 3,
        },
        track: {
          border: "none",
          backgroundColor: "#ffffff",
        },
        rail: {
          opacity: 0.3,
          backgroundColor: "#737373",
        },
        thumb: {
          height: 12,
          width: 12,
          backgroundColor: "#ffffff",
          borderRadius: 0, // square thumb
          "&:focus, &:hover, &.Mui-active, &.Mui-focusVisible": {
            boxShadow: "0 0 0 4px rgba(255, 255, 255, 0.16)",
          },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          width: 36,
          height: 20,
          padding: 0,
        },
        switchBase: {
          padding: 2,
          "&.Mui-checked": {
            transform: "translateX(16px)",
            color: "#000000",
            "& + .MuiSwitch-track": {
              backgroundColor: "#ffffff",
              opacity: 1,
              border: 0,
            },
          },
        },
        thumb: {
          width: 16,
          height: 16,
          borderRadius: 0, // square thumb
          backgroundColor: "#ffffff",
        },
        track: {
          borderRadius: 0,
          opacity: 1,
          backgroundColor: "#262626",
          border: "1px solid #404040",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          fontSize: "0.75rem",
          backgroundColor: "#050505",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "#262626",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#525252",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#ffffff",
            borderWidth: 1,
          },
        },
        input: {
          padding: "6px 10px",
          color: "#ffffff",
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        select: {
          padding: "6px 10px",
          color: "#ffffff",
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: "0.75rem",
          fontFamily: '"JetBrains Mono", monospace',
          "&.Mui-selected": {
            backgroundColor: "#1a1a1a",
          },
          "&:hover": {
            backgroundColor: "#141414",
          },
        },
      },
    },
  },
});

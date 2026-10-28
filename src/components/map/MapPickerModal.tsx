import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { CITY_PRESETS } from "../../utils/demoModels";

interface MapPickerModalProps {
  isOpen: boolean;
  initialLat: number;
  initialLng: number;
  initialCity: string;
  onSelect: (lat: number, lng: number, city: string) => void;
  onClose: () => void;
}

// Fix Leaflet's default marker icon issue with bundlers (Vite/Webpack)
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

export function MapPickerModal({
  isOpen,
  initialLat,
  initialLng,
  initialCity,
  onSelect,
  onClose,
}: MapPickerModalProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [lat, setLat] = useState<number>(initialLat);
  const [lng, setLng] = useState<number>(initialLng);
  const [cityName, setCityName] = useState<string>(initialCity);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Reset coordinates on open
    setLat(initialLat);
    setLng(initialLng);
    setCityName(initialCity);
    setSearchError(null);

    // Timeout ensures DOM node has dimensions after render
    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;

      // Clean up previous instance if exists
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 9,
        zoomControl: true,
      });

      // CartoDB Dark Matter tile layer for a sleek dark GIS workstation look
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a> &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
          maxZoom: 19,
          subdomains: "abcd",
        }
      ).addTo(map);

      // Marker
      const marker = L.marker([initialLat, initialLng], {
        draggable: true,
      }).addTo(map);

      // Handle map click
      map.on("click", (e: L.LeafletMouseEvent) => {
        const newLat = parseFloat(e.latlng.lat.toFixed(4));
        const newLng = parseFloat(e.latlng.lng.toFixed(4));
        setLat(newLat);
        setLng(newLng);
        marker.setLatLng([newLat, newLng]);
        setCityName(`Location (${newLat}°, ${newLng}°)`);
      });

      // Handle marker drag
      marker.on("dragend", () => {
        const position = marker.getLatLng();
        const newLat = parseFloat(position.lat.toFixed(4));
        const newLng = parseFloat(position.lng.toFixed(4));
        setLat(newLat);
        setLng(newLng);
        setCityName(`Location (${newLat}°, ${newLng}°)`);
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;
      map.invalidateSize();
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen, initialLat, initialLng, initialCity]);

  // Geocoding search using OpenStreetMap Nominatim
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&limit=1`,
        {
          headers: {
            "Accept-Language": "en",
          },
        }
      );
      const data = await res.json();

      if (data && data.length > 0) {
        const result = data[0];
        const newLat = parseFloat(parseFloat(result.lat).toFixed(4));
        const newLng = parseFloat(parseFloat(result.lon).toFixed(4));
        const displayName = result.display_name.split(",")[0] || searchQuery;

        setLat(newLat);
        setLng(newLng);
        setCityName(displayName);

        if (mapInstanceRef.current && markerRef.current) {
          mapInstanceRef.current.setView([newLat, newLng], 12);
          markerRef.current.setLatLng([newLat, newLng]);
        }
      } else {
        setSearchError("Location not found. Please try another query.");
      }
    } catch {
      setSearchError("Failed to reach geocoding service. You can click directly on the map.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectPreset = (preset: (typeof CITY_PRESETS)[0]) => {
    setLat(preset.latitude);
    setLng(preset.longitude);
    setCityName(preset.name);

    if (mapInstanceRef.current && markerRef.current) {
      mapInstanceRef.current.setView([preset.latitude, preset.longitude], 11);
      markerRef.current.setLatLng([preset.latitude, preset.longitude]);
    }
  };

  const handleConfirm = () => {
    onSelect(lat, lng, cityName);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="flex flex-col w-full max-w-4xl h-[85vh] bg-[#000000] border border-[#262626] rounded-none shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a1a1a] bg-[#050505]">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 bg-white"></span>
            <div>
              <h2 className="text-sm font-semibold tracking-wider uppercase text-white font-mono">
                Geographic Location Picker
              </h2>
              <p className="text-xs text-neutral-400">
                Click anywhere on the globe or search a city to set solar coordinates
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white px-2.5 py-1 text-xs font-mono border border-[#262626] hover:border-white transition"
          >
            ESC / Close
          </button>
        </div>

        {/* Search & City Presets Bar */}
        <div className="p-4 border-b border-[#1a1a1a] bg-[#080808] space-y-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              placeholder="Search city, neighborhood, or address (e.g. Cairo, Paris, Shinjuku)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-black border border-[#262626] px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white font-mono"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="px-4 py-2 bg-white hover:bg-neutral-200 disabled:bg-neutral-800 text-black text-xs font-semibold uppercase tracking-wider font-mono transition"
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </form>

          {searchError && (
            <div className="text-xs text-neutral-300 font-mono">{searchError}</div>
          )}

          {/* Quick Preset Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-mono text-neutral-400 mr-1">Presets:</span>
            {CITY_PRESETS.slice(0, 7).map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`px-2 py-1 text-[11px] font-mono transition border ${
                  cityName === preset.name
                    ? "border-white text-black bg-white"
                    : "border-[#262626] text-neutral-300 hover:border-white bg-[#0f0f0f]"
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Leaflet Map Canvas */}
        <div className="flex-1 relative bg-black">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Floating Selected Coordinates HUD on Map */}
          <div className="absolute bottom-4 left-4 z-[1000] bg-black/90 border border-[#262626] px-4 py-2 font-mono text-xs text-white backdrop-blur-md shadow-lg pointer-events-none">
            <div className="text-white font-semibold">{cityName}</div>
            <div className="text-neutral-400">
              Lat: <span className="text-white">{lat.toFixed(4)}°</span> | Long:{" "}
              <span className="text-white">{lng.toFixed(4)}°</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#1a1a1a] bg-[#050505]">
          <div className="text-xs font-mono text-neutral-400">
            Click map to reposition pin. Coordinates will synchronize with ephemeris.
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-mono text-neutral-300 hover:text-white border border-[#262626] hover:border-white transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-5 py-2 text-xs font-mono font-semibold uppercase tracking-wider bg-white hover:bg-neutral-200 text-black shadow-lg transition"
            >
              Apply Coordinates
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

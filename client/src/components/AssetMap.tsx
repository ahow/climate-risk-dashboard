import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for default marker icons in Leaflet
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface Asset {
  id: number;
  facilityName: string;
  latitude: number | null;
  longitude: number | null;
  expectedAnnualLoss?: number;
  hazardBreakdown?: {
    flood?: number;
    wildfire?: number;
    heatStress?: number;
    extremePrecipitation?: number;
    hurricane?: number;
    drought?: number;
  };
}

interface AssetMapProps {
  assets: Asset[];
  companyName: string;
}

export function AssetMap({ assets, companyName }: AssetMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Filter assets with valid coordinates
    const validAssets = assets.filter(
      (asset) => asset.latitude !== null && asset.longitude !== null
    );

    if (validAssets.length === 0) return;

    // Initialize map if not already created
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current).setView([0, 0], 2);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(mapRef.current);
    }

    // Clear existing markers
    mapRef.current.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        mapRef.current?.removeLayer(layer);
      }
    });

    // Add markers for each asset
    const bounds = L.latLngBounds([]);
    validAssets.forEach((asset) => {
      if (asset.latitude === null || asset.longitude === null) return;

      const lat = asset.latitude;
      const lng = asset.longitude;
      bounds.extend([lat, lng]);

      // Create custom icon based on risk level
      const loss = asset.expectedAnnualLoss || 0;
      let markerColor = "#10b981"; // green for low risk
      if (loss > 100000) markerColor = "#ef4444"; // red for high risk
      else if (loss > 50000) markerColor = "#f59e0b"; // orange for medium risk

      const customIcon = L.divIcon({
        className: "custom-marker",
        html: `<div style="background-color: ${markerColor}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      // Create popup content
      const hazards = asset.hazardBreakdown || {};
      const hazardList = Object.entries(hazards)
        .filter(([_, value]) => {
          const annualLoss = (value as any)?.annual_loss;
          return annualLoss && annualLoss > 0;
        })
        .map(([key, value]) => {
          const annualLoss = (value as any)?.annual_loss || 0;
          const label = key
            .replace(/([A-Z])/g, " $1")
            .replace(/_/g, " ")
            .replace(/^./, (str) => str.toUpperCase());
          return `<li>${label}: $${annualLoss.toLocaleString()}</li>`;
        })
        .join("");

      const popupContent = `
        <div style="min-width: 200px;">
          <h3 style="margin: 0 0 8px 0; font-weight: bold; font-size: 14px;">${asset.facilityName}</h3>
          <p style="margin: 4px 0; font-size: 12px;"><strong>Coordinates:</strong> ${lat.toFixed(4)}, ${lng.toFixed(4)}</p>
          <p style="margin: 4px 0; font-size: 12px;"><strong>Total Annual Loss:</strong> $${loss.toLocaleString()}</p>
          ${hazardList ? `<p style="margin: 8px 0 4px 0; font-size: 12px; font-weight: bold;">Risk Breakdown:</p><ul style="margin: 0; padding-left: 20px; font-size: 11px;">${hazardList}</ul>` : ""}
        </div>
      `;

      const marker = L.marker([lat, lng], { icon: customIcon }).addTo(mapRef.current!);
      marker.bindPopup(popupContent);
    });

    // Fit map to show all markers
    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
    }

    // Cleanup function
    return () => {
      // Don't destroy the map on every render, only when component unmounts
    };
  }, [assets]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const validAssets = assets.filter(
    (asset) => asset.latitude !== null && asset.longitude !== null
  );

  if (validAssets.length === 0) {
    return (
      <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center">
        <p className="text-gray-600">No asset locations available to display on map</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        ref={mapContainerRef}
        className="w-full h-96 rounded-lg border border-gray-300 shadow-sm"
      />
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-white"></div>
          <span>Low Risk (&lt;$50k)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-orange-500 border-2 border-white"></div>
          <span>Medium Risk ($50k-$100k)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-white"></div>
          <span>High Risk (&gt;$100k)</span>
        </div>
      </div>
    </div>
  );
}


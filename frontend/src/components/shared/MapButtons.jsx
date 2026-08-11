import React from "react";
import { Button } from "@/components/ui/button";

// Waze SVG icon (no lucide equivalent)
function WazeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 3.542 1.542 6.722 3.984 8.91L3 21l2.09-.984C7.028 21.27 9.405 22 12 22c6.627 0 12-4.925 12-11S18.627 0 12 0zm.18 18.8a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8zm3.9 0a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8zm1.62-4.5c-.36.54-1.08.9-1.98.9H8.28c-.9 0-1.62-.36-1.98-.9-.18-.27-.18-.63 0-.9.9-1.44 2.52-2.4 4.68-2.4s3.78.96 4.68 2.4c.18.27.18.63 0 .9zM7.5 11a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
    </svg>
  );
}

export default function MapButtons({ venue_name, venue_address, venue_map_url, className = "" }) {
  const query = encodeURIComponent([venue_name, venue_address].filter(Boolean).join(", "));
  const googleMapsUrl = venue_map_url || `https://www.google.com/maps/search/?api=1&query=${query}`;
  const wazeUrl = `https://waze.com/ul?q=${query}&navigate=yes`;

  return (
    <div className={`flex gap-2 flex-wrap ${className}`}>
      <a href={googleMapsUrl} target="_blank" rel="noreferrer">
        <Button variant="outline" size="sm" className="gap-2 rounded-xl h-9">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#4285F4"/>
          </svg>
          Google Maps
        </Button>
      </a>
      <a href={wazeUrl} target="_blank" rel="noreferrer">
        <Button variant="outline" size="sm" className="gap-2 rounded-xl h-9">
          <WazeIcon className="w-4 h-4 text-[#33CCFF]" />
          Waze
        </Button>
      </a>
    </div>
  );
}
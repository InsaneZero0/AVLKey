import React from "react";

export function MapEmbed({ address, height = 220 }) {
  if (!address || !address.trim()) return null;
  const q = encodeURIComponent(address);
  return (
    <iframe
      title="Mapa de ubicación"
      src={`https://maps.google.com/maps?q=${q}&z=15&output=embed`}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      style={{ width: "100%", height, border: 0, borderRadius: 12 }}
      data-testid="property-map"
    />
  );
}

import clsx from "clsx";

/**
 * A small, key-free map preview (OpenStreetMap embed) with a marker at the given
 * coordinates. Shown once an address has resolved to a location.
 */
export function MapPreview({
  lat,
  lon,
  className,
  height = 160,
}: {
  lat: number;
  lon: number;
  className?: string;
  height?: number;
}) {
  const d = 0.008; // ~800m padding around the marker
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  const src =
    "https://www.openstreetmap.org/export/embed.html" +
    `?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lon}`;
  return (
    <iframe
      title="Location map"
      src={src}
      loading="lazy"
      style={{ height }}
      className={clsx(
        "w-full rounded-lg border border-slate-200",
        className,
      )}
    />
  );
}

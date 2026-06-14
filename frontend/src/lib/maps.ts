/**
 * Build navigation/search URLs for a free-text location (address or place name).
 * These open the respective map app on mobile and a web map on desktop.
 */
export function googleMapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function wazeUrl(query: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
}

export function appleMapsUrl(query: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
}

export const MAP_PROVIDERS = [
  { key: "google", url: googleMapsUrl },
  { key: "waze", url: wazeUrl },
  { key: "apple", url: appleMapsUrl },
] as const;

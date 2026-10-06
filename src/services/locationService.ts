import { civicAreas } from "@/lib/civic-data";

export type LocationMeta = {
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  area: string;
  ward: string;
  timestamp: string;
  source: "gps" | "manual" | "fallback";
};

export type Coordinates = Pick<LocationMeta, "latitude" | "longitude"> & {
  accuracy?: number;
  timestamp: number;
};

export class LocationServiceError extends Error {
  code: "denied" | "unavailable" | "timeout" | "unsupported";

  constructor(code: LocationServiceError["code"], message: string) {
    super(message);
    this.name = "LocationServiceError";
    this.code = code;
  }
}

export function getCurrentLocation(): Promise<Coordinates> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(
      new LocationServiceError("unsupported", "Location is not supported by this browser."),
    );
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        }),
      (error) => {
        const code =
          error.code === error.PERMISSION_DENIED
            ? "denied"
            : error.code === error.TIMEOUT
              ? "timeout"
              : "unavailable";
        reject(new LocationServiceError(code, "Location is unavailable."));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

function distanceInKm(
  latitude: number,
  longitude: number,
  targetLatitude: number,
  targetLongitude: number,
) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371;
  const deltaLat = radians(targetLatitude - latitude);
  const deltaLng = radians(targetLongitude - longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(latitude)) * Math.cos(radians(targetLatitude)) * Math.sin(deltaLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getNearestCivicArea(latitude: number, longitude: number) {
  return civicAreas.reduce(
    (nearest, area) => {
      const distance = distanceInKm(latitude, longitude, area.latitude, area.longitude);
      return distance < nearest.distance ? { area, distance } : nearest;
    },
    { area: civicAreas[0], distance: Number.POSITIVE_INFINITY },
  );
}

export function getWard(latitude: number, longitude: number) {
  return getNearestCivicArea(latitude, longitude).area.ward;
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<Partial<LocationMeta>> {
  const nearest = getNearestCivicArea(latitude, longitude).area;
  if (typeof fetch === "undefined") return { ...nearest };

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18`,
      {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error("Reverse geocoding unavailable");
    const result = (await response.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const address = result.address ?? {};
    return {
      address: result.display_name ?? nearest.address,
      city: address.city ?? address.town ?? address.village ?? nearest.city,
      area: address.suburb ?? address.neighbourhood ?? nearest.area,
      ward: address.city_district ?? nearest.ward,
    };
  } catch {
    return { ...nearest };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function resolveLocation(
  latitude: number,
  longitude: number,
  source: LocationMeta["source"],
): Promise<LocationMeta> {
  const nearest = getNearestCivicArea(latitude, longitude).area;
  const geocoded = await reverseGeocode(latitude, longitude);
  return {
    latitude,
    longitude,
    address: geocoded.address ?? nearest.address,
    city: geocoded.city ?? nearest.city,
    area: geocoded.area ?? nearest.area,
    ward: geocoded.ward ?? nearest.ward,
    timestamp: new Date().toISOString(),
    source,
  };
}

export function fallbackLocation(): LocationMeta {
  const area = civicAreas[0];
  return {
    latitude: area.latitude,
    longitude: area.longitude,
    address: area.address,
    city: area.city,
    area: area.area,
    ward: area.ward,
    timestamp: new Date().toISOString(),
    source: "fallback",
  };
}

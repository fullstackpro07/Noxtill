const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** Real spherical "destination point given distance and bearing" formula — standard great-circle navigation math, not an approximation. */
export function destinationPoint(
  origin: { lat: number; lng: number },
  bearingDegrees: number,
  distanceKm: number,
): { lat: number; lng: number } {
  const angularDistance = distanceKm / EARTH_RADIUS_KM;
  const bearing = toRadians(bearingDegrees);
  const lat1 = toRadians(origin.lat);
  const lng1 = toRadians(origin.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: toDegrees(lat2), lng: toDegrees(lng2) };
}

/**
 * A real compass-rose grid: the center point plus `ringPoints` points evenly spaced around it at
 * `radiusKm` — the standard layout local-rank-tracking tools use (e.g. a 3x3-equivalent "9-point"
 * grid is `ringPoints: 8`).
 */
export function buildGrid(
  center: { lat: number; lng: number },
  radiusKm: number,
  ringPoints: number,
): { lat: number; lng: number }[] {
  const points = [center];
  for (let i = 0; i < ringPoints; i++) {
    const bearing = (360 / ringPoints) * i;
    points.push(destinationPoint(center, bearing, radiusKm));
  }
  return points;
}

/**
 * Pure route geometry. No DOM, no MapLibre — everything here is a deterministic
 * function of its inputs so it can be table-tested in isolation (see geo.test.ts).
 *
 * The map adapter (map.ts) wraps `buildRouteGeometry` and adds the MapLibre
 * `LngLatBounds`, which is the only part that needs the maplibregl global.
 */

/** A geographic coordinate as a `[lng, lat]` pair (GeoJSON order). */
export type Coord = [number, number];

/** A kilometre marker: the whole-km label and its interpolated position. */
export interface KmPoint {
  km: number;
  lngLat: Coord;
}

export interface RouteGeometry {
  /** The original polyline vertices, unchanged. */
  coords: Coord[];
  /** Total route length in kilometres. */
  totalKm: number;
  /** Length of each segment (coords[i] -> coords[i+1]) in km. */
  segLens: number[];
  /** Cumulative km at each vertex; `cumKm[0] === 0`, `cumKm.at(-1) === totalKm`. */
  cumKm: number[];
  /** Position at progress `t` in [0,1] along the total distance. */
  pointAtT(t: number): Coord;
  /** Polyline from the start to progress `t`, with an interpolated tail at the cut. */
  sliceAtT(t: number): Coord[];
  /** One marker at each whole kilometre (1km, 2km, …). */
  kmPoints: KmPoint[];
}

/** Great-circle distance between two `[lng, lat]` points, in kilometres. */
export function haversine(a: Coord, b: Coord): number {
  const R = 6371;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Linear interpolation between `a` and `b` at `t`. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Symmetric cubic ease-in-out over `t` in [0,1]. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Precompute everything the animation needs from a raw coordinate array:
 * per-segment lengths, cumulative distances, interpolation helpers, and
 * whole-kilometre markers. Pure — bounds are added by the map adapter.
 */
export function buildRouteGeometry(coords: Coord[]): RouteGeometry {
  // Per-segment lengths + cumulative km at each vertex.
  const segLens: number[] = [];
  const cumKm: number[] = [0];
  let totalKm = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = haversine(coords[i - 1], coords[i]);
    segLens.push(d);
    totalKm += d;
    cumKm.push(totalKm);
  }

  function pointAtT(t: number): Coord {
    if (t <= 0) return coords[0];
    if (t >= 1) return coords[coords.length - 1];
    const target = t * totalKm;
    let acc = 0;
    for (let i = 0; i < segLens.length; i++) {
      if (acc + segLens[i] >= target) {
        const f = (target - acc) / segLens[i];
        return [
          lerp(coords[i][0], coords[i + 1][0], f),
          lerp(coords[i][1], coords[i + 1][1], f),
        ];
      }
      acc += segLens[i];
    }
    return coords[coords.length - 1];
  }

  // Build the polyline slice from 0 to t (0..1), keeping all intermediate
  // GPX vertices and adding a final interpolated point at the cut.
  function sliceAtT(t: number): Coord[] {
    if (t <= 0) return [coords[0], coords[0]];
    if (t >= 1) return coords.slice();
    const target = t * totalKm;
    const out: Coord[] = [];
    for (let i = 0; i < coords.length; i++) {
      if (cumKm[i] <= target) out.push(coords[i]);
      else break;
    }
    // Add an interpolated tail at the exact cut for smooth animation.
    const lastIdx = out.length - 1;
    const segStart = cumKm[lastIdx];
    const segEnd = cumKm[lastIdx + 1];
    if (segEnd != null && segEnd > segStart) {
      const f = (target - segStart) / (segEnd - segStart);
      out.push([
        lerp(coords[lastIdx][0], coords[lastIdx + 1][0], f),
        lerp(coords[lastIdx][1], coords[lastIdx + 1][1], f),
      ]);
    }
    // A LineString must have at least 2 distinct points to render.
    if (out.length < 2) out.push(out[0]);
    return out;
  }

  // KM markers — interpolate to the exact 1.0 km, 2.0 km, … position
  // along the polyline. The line is drawn 6px wide so the dot reads as
  // sitting cleanly on it. Nearest-vertex snapping was up to 15 m off
  // the true km, which was visible at zoom 13.
  const kmPoints: KmPoint[] = [];
  {
    const whole = Math.floor(totalKm);
    for (let k = 1; k <= whole; k++) {
      // Walk segments to find the one containing the k-th km mark.
      let lngLat: Coord = coords[coords.length - 1];
      for (let i = 0; i < segLens.length; i++) {
        if (cumKm[i] + segLens[i] >= k) {
          const f = (k - cumKm[i]) / segLens[i];
          lngLat = [
            lerp(coords[i][0], coords[i + 1][0], f),
            lerp(coords[i][1], coords[i + 1][1], f),
          ];
          break;
        }
      }
      kmPoints.push({ km: k, lngLat });
    }
  }

  return { coords, totalKm, segLens, cumKm, pointAtT, sliceAtT, kmPoints };
}

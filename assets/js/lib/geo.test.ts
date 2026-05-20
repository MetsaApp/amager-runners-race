import { describe, it, expect } from "vitest";
import {
  haversine,
  lerp,
  easeInOut,
  buildRouteGeometry,
  type Coord,
} from "./geo";

describe("haversine", () => {
  // Reference distances. One degree of latitude ≈ 111.19 km on a 6371 km
  // sphere — that pins the radius/units. The others are small local hops.
  const cases: Array<{ name: string; a: Coord; b: Coord; km: number }> = [
    { name: "identical points → 0", a: [12.5, 55.6], b: [12.5, 55.6], km: 0 },
    { name: "1° of latitude ≈ 111.19 km", a: [0, 0], b: [0, 1], km: 111.195 },
    { name: "1° of longitude at equator ≈ 111.19 km", a: [0, 0], b: [1, 0], km: 111.195 },
    {
      name: "Amager start hop (~0.08 km)",
      a: [12.64287, 55.64732],
      b: [12.64237, 55.64803],
      km: 0.0826,
    },
  ];

  it.each(cases)("$name", ({ a, b, km }) => {
    expect(haversine(a, b)).toBeCloseTo(km, 2);
  });

  it("is symmetric", () => {
    const a: Coord = [12.6, 55.6];
    const b: Coord = [12.7, 55.65];
    expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 9);
  });
});

describe("lerp", () => {
  const cases: Array<{ a: number; b: number; t: number; expected: number }> = [
    { a: 0, b: 10, t: 0, expected: 0 },
    { a: 0, b: 10, t: 1, expected: 10 },
    { a: 0, b: 10, t: 0.5, expected: 5 },
    { a: 2, b: 4, t: 0.25, expected: 2.5 },
    { a: -10, b: 10, t: 0.5, expected: 0 },
    { a: 5, b: 5, t: 0.7, expected: 5 },
  ];

  it.each(cases)("lerp($a, $b, $t) === $expected", ({ a, b, t, expected }) => {
    expect(lerp(a, b, t)).toBeCloseTo(expected, 9);
  });
});

describe("easeInOut", () => {
  const cases: Array<{ t: number; expected: number }> = [
    { t: 0, expected: 0 },
    { t: 0.5, expected: 0.5 },
    { t: 1, expected: 1 },
  ];

  it.each(cases)("easeInOut($t) === $expected", ({ t, expected }) => {
    expect(easeInOut(t)).toBeCloseTo(expected, 9);
  });

  it("is monotonically increasing across [0,1]", () => {
    const ts = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1];
    const ys = ts.map(easeInOut);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]).toBeGreaterThan(ys[i - 1]);
    }
  });

  it("is symmetric about t=0.5 (ease(t) + ease(1-t) === 1)", () => {
    for (const t of [0, 0.1, 0.3, 0.5]) {
      expect(easeInOut(t) + easeInOut(1 - t)).toBeCloseTo(1, 9);
    }
  });
});

describe("buildRouteGeometry", () => {
  // A simple east-going polyline at the equator: each 1° step ≈ 111.195 km.
  // Three points → two ~equal segments, total ≈ 222.39 km.
  const coords: Coord[] = [
    [0, 0],
    [1, 0],
    [2, 0],
  ];
  const route = buildRouteGeometry(coords);
  const SEG = haversine([0, 0], [1, 0]); // ≈ 111.195

  it("computes per-segment lengths and cumulative km", () => {
    expect(route.segLens).toHaveLength(2);
    expect(route.segLens[0]).toBeCloseTo(SEG, 3);
    expect(route.cumKm).toEqual([0, route.segLens[0], route.totalKm]);
    expect(route.totalKm).toBeCloseTo(2 * SEG, 3);
  });

  describe("pointAtT", () => {
    const cases: Array<{ name: string; t: number; expected: Coord }> = [
      { name: "t<=0 → first vertex", t: 0, expected: [0, 0] },
      { name: "t=0.25 → quarter along (lng 0.5)", t: 0.25, expected: [0.5, 0] },
      { name: "t=0.5 → midpoint (the middle vertex)", t: 0.5, expected: [1, 0] },
      { name: "t=0.75 → three-quarters (lng 1.5)", t: 0.75, expected: [1.5, 0] },
      { name: "t>=1 → last vertex", t: 1, expected: [2, 0] },
    ];

    it.each(cases)("$name", ({ t, expected }) => {
      const p = route.pointAtT(t);
      expect(p[0]).toBeCloseTo(expected[0], 3);
      expect(p[1]).toBeCloseTo(expected[1], 6);
    });
  });

  describe("sliceAtT", () => {
    it("t<=0 returns a degenerate 2-point line at the start", () => {
      expect(route.sliceAtT(0)).toEqual([
        [0, 0],
        [0, 0],
      ]);
    });

    it("t>=1 returns a full copy of coords (not the same array)", () => {
      const s = route.sliceAtT(1);
      expect(s).toEqual(coords);
      expect(s).not.toBe(coords);
    });

    it("t=0.5 keeps vertices up to the cut and appends the interpolated tail", () => {
      const s = route.sliceAtT(0.5);
      // vertices with cumKm <= target (0,0)+(1,0), then interpolated tail at the cut.
      expect(s.length).toBeGreaterThanOrEqual(2);
      const tail = s[s.length - 1];
      expect(tail[0]).toBeCloseTo(1, 3);
      expect(tail[1]).toBeCloseTo(0, 6);
    });

    it("always returns at least 2 points", () => {
      for (const t of [0, 0.01, 0.5, 0.99, 1]) {
        expect(route.sliceAtT(t).length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe("kmPoints", () => {
    it("has one marker per whole kilometre", () => {
      expect(route.kmPoints).toHaveLength(Math.floor(route.totalKm));
    });

    it("labels increase by 1 starting at 1", () => {
      route.kmPoints.forEach((p, i) => expect(p.km).toBe(i + 1));
    });

    it("each marker sits on the equator line (lat ≈ 0) within route extent", () => {
      for (const p of route.kmPoints) {
        expect(p.lngLat[1]).toBeCloseTo(0, 6);
        expect(p.lngLat[0]).toBeGreaterThanOrEqual(0);
        expect(p.lngLat[0]).toBeLessThanOrEqual(2);
      }
    });
  });
});

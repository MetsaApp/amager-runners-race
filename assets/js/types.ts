/**
 * Shared types. `window.__SITE` is injected by an inline <script> in
 * layouts/partials/scripts.html (built from data/route.yaml). The `maplibregl`
 * runtime global is typed separately in maplibre-global.d.ts.
 */
import type { Coord } from "./lib/geo";

export interface RouteStats {
  lapDistance: string;
  laps: number;
  elevation: string;
  surface: string;
  aidStations: string;
  legendStart: string;
  legendDistance: string;
}

export interface MeetingPoint {
  coord: Coord;
  label: string;
  venue: string;
}

export interface SiteData {
  routePoints: { "5k": Coord[]; "10k": Coord[] };
  meetingPoint: MeetingPoint;
  routeStats: { "5k": RouteStats; "10k": RouteStats };
}

declare global {
  interface Window {
    __SITE?: SiteData;
    __mapInstance?: import("maplibre-gl").Map;
  }
}

export {};

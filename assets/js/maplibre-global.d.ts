/**
 * Ambient declaration for the `maplibregl` runtime global provided by the
 * MapLibre CDN <script> (layouts/partials/scripts.html). It is never imported
 * or bundled — Hugo's js.Build leaves it as a free global. We type it from the
 * maplibre-gl package (a dev-only dependency) so map.ts gets full typing for
 * both value usage (`new maplibregl.Map(...)`) and type usage
 * (`maplibregl.LngLatBounds`).
 *
 * This is a global script (no top-level import/export), so the names below are
 * true ambient globals — not UMD globals — and can be referenced from modules.
 */
declare const maplibregl: typeof import("maplibre-gl");

declare namespace maplibregl {
  type Map = import("maplibre-gl").Map;
  type Marker = import("maplibre-gl").Marker;
  type LngLatBounds = import("maplibre-gl").LngLatBounds;
  type GeoJSONSource = import("maplibre-gl").GeoJSONSource;
}

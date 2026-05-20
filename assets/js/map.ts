import "./types";
import { buildRouteGeometry, easeInOut } from "./lib/geo";
import type { Coord, RouteGeometry } from "./lib/geo";
import { hexToRgba, resolveColorToHex } from "./lib/color";
import type { SiteData } from "./types";

(function () {
  if (typeof maplibregl === "undefined") return;
  const mapEl = document.getElementById("map");
  if (!mapEl) return;

  const SITE: Partial<SiteData> = window.__SITE || {};
  const ROUTES_RAW = SITE.routePoints || ({} as SiteData["routePoints"]);
  if (!ROUTES_RAW["5k"] || !ROUTES_RAW["5k"].length) return;
  const STATS = SITE.routeStats || ({} as SiteData["routeStats"]);
  const SECTION = document.getElementById("route");
  const REDUCED_MOTION =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Tracks whether the map is currently in the viewport. Set by an
  // IntersectionObserver wired up after init below. The animation's frame()
  // loop checks this and pauses (stashing its elapsed time) when false.
  let mapVisible = true;

  // ----- Route construction --------------------------------------------------
  // Pure geometry comes from buildRouteGeometry (lib/geo); the MapLibre
  // LngLatBounds is the only impure part and is added here in the adapter.
  type Route = RouteGeometry & { bounds: maplibregl.LngLatBounds };

  function buildRoute(coords: Coord[]): Route {
    const geo = buildRouteGeometry(coords);
    const bounds = coords.reduce(
      (b, c) => b.extend(c as [number, number]),
      new maplibregl.LngLatBounds(coords[0], coords[0]),
    );
    return { ...geo, bounds };
  }

  const ROUTES: Record<"5k" | "10k", Route> = {
    "5k": buildRoute(ROUTES_RAW["5k"]),
    "10k":
      ROUTES_RAW["10k"] && ROUTES_RAW["10k"].length
        ? buildRoute(ROUTES_RAW["10k"])
        : buildRoute(ROUTES_RAW["5k"]),
  };

  // ----- Colors --------------------------------------------------------------
  const ACCENT = resolveColorToHex(
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim(),
    "#2D5BFF",
  );
  const ACCENT_GLOW = hexToRgba(ACCENT, 0.28);
  const INK = "#0B0D10";
  const PAPER = resolveColorToHex(
    getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
    "#F5F4EF",
  );
  const GOLD = "#E0B341";

  // ----- Map init -----------------------------------------------------------
  const initialTab: "5k" | "10k" =
    (SECTION && (SECTION.dataset.activeTab as "5k" | "10k")) || "5k";
  const initialRoute = ROUTES[initialTab];

  const map = new maplibregl.Map({
    container: "map",
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    center: initialRoute.coords[0],
    zoom: 13,
    // Skip the default attribution control — we add a compact one below
    // that stays collapsed regardless of viewport width.
    attributionControl: false,
    // The map is presentational — no panning, zooming, rotating, or
    // keyboard navigation. `interactive: false` disables all user
    // gestures and handlers in one shot.
    interactive: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }));
  // MapLibre's compact attribution mounts with `maplibregl-compact-show`
  // (expanded) when the viewport is wide enough. Strip it once after the
  // control is in the DOM so the credits start collapsed. We don't re-run
  // this on every idle/render — if the user clicks the "i" we want it to
  // stay open until they click again.
  map.once("idle", () => {
    document
      .querySelectorAll(".maplibregl-ctrl-attrib.maplibregl-compact-show")
      .forEach((el) => el.classList.remove("maplibregl-compact-show"));
  });
  window.__mapInstance = map;

  // Pause the route animation when the map scrolls out of view. The frame
  // loop stashes a resume callback when it pauses; we fire it when the
  // map comes back so the trace picks up exactly where it left off rather
  // than restarting.
  if ("IntersectionObserver" in window) {
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        mapVisible = entry.isIntersecting;
        if (mapVisible && typeof resumeAnimation === "function") {
          resumeAnimation();
        }
      },
      { threshold: 0 },
    );
    visibilityObserver.observe(mapEl);
  }

  // Runner — accent (blue) with ink + paper rings; pulses on lap 2.
  const runnerEl = document.createElement("div");
  function paintRunner(color: string, glowColor: string): void {
    runnerEl.style.cssText = `width:18px;height:18px;border-radius:50%;background:${color};box-shadow:0 0 0 2.5px ${PAPER}, 0 0 0 4.5px ${INK}, 0 0 14px ${glowColor};transition:opacity .25s, background .35s, box-shadow .35s;opacity:0;`;
  }
  paintRunner(ACCENT, hexToRgba(ACCENT, 0.55));
  const runnerMarker = new maplibregl.Marker({ element: runnerEl }).setLngLat(
    initialRoute.coords[0],
  );

  // Meeting point — sits off the route, on the grass. Decorative only
  // (no popup, no link) so the map stays presentational.
  let meetingMarker: maplibregl.Marker | null = null;
  function placeMeetingMarker(): void {
    const mp = SITE.meetingPoint;
    if (!mp || !mp.coord) return;
    if (!meetingMarker) {
      const el = document.createElement("div");
      el.style.cssText = `width:16px;height:16px;border-radius:50%;background:${GOLD};box-shadow:0 0 0 2.5px ${PAPER}, 0 0 0 4.5px ${INK};pointer-events:none;`;
      meetingMarker = new maplibregl.Marker({ element: el })
        .setLngLat(mp.coord)
        .addTo(map);
    }
  }

  // ----- KM marker DOM ------------------------------------------------------
  let kmMarkers: Record<string, maplibregl.Marker> = {};
  function clearKmMarkers(): void {
    Object.values(kmMarkers).forEach((m) => m && m.remove && m.remove());
    kmMarkers = {};
  }
  function addKmMarker(key: string, label: string, lngLat: Coord): void {
    if (kmMarkers[key]) return;
    // Wrapper sits at the lngLat (anchor: center). Both children are
    // absolutely positioned so the dot's center lands exactly on the
    // anchor point and the badge floats up + to the right of it.
    const el = document.createElement("div");
    el.style.cssText = "position:relative;width:0;height:0;pointer-events:none;";
    const dot = document.createElement("span");
    dot.style.cssText = `position:absolute;left:-4.5px;top:-4.5px;width:9px;height:9px;border-radius:50%;background:${INK};box-shadow:0 0 0 2.5px ${PAPER};`;
    const tag = document.createElement("span");
    tag.textContent = label;
    tag.style.cssText = `position:absolute;left:8px;top:-14px;font:600 10px/1 "JetBrains Mono", ui-monospace, monospace;color:${PAPER};background:${INK};padding:2px 5px;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,.15);letter-spacing:.04em;white-space:nowrap;`;
    el.appendChild(dot);
    el.appendChild(tag);
    const mk = new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat(lngLat)
      .addTo(map);
    el.style.opacity = "0";
    if (el.animate) {
      el.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 280, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" },
      );
    } else {
      el.style.opacity = "1";
    }
    kmMarkers[key] = mk;
  }

  // ----- Tab / animation state ---------------------------------------------
  let currentTab: "5k" | "10k" = initialTab;
  let animToken = 0;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  type LineFeature = {
    type: "Feature";
    geometry: { type: "LineString"; coordinates: Coord[] };
  };

  function emptyLine(): LineFeature {
    // A 1-point LineString is invalid; use a degenerate 2-point version.
    const c = ROUTES[currentTab].coords[0];
    return {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [c, c] },
    };
  }
  function fullLine(coords: Coord[]): LineFeature {
    return {
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
    };
  }

  function ensureLayers(): void {
    // Two sources: the full route (used by the soft halo so the glow doesn't
    // have to redraw every frame) and a progressive slice that the main blue
    // + dashed-black overlay both follow. Sharing a single source means the
    // dashes mask the live tip of the line on every frame, which is what
    // gives us "dashes draw together with the blue line".
    if (!map.getSource("route-full")) {
      map.addSource("route-full", {
        type: "geojson",
        lineMetrics: true,
        data: fullLine(ROUTES[currentTab].coords) as never,
      });
    }
    if (!map.getSource("route-progress")) {
      map.addSource("route-progress", {
        type: "geojson",
        data: emptyLine() as never,
      });
    }
    if (!map.getLayer("route-glow")) {
      map.addLayer({
        id: "route-glow",
        type: "line",
        source: "route-full",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ACCENT_GLOW,
          "line-width": 14,
          "line-blur": 6,
          "line-gradient": [
            "step",
            ["line-progress"],
            ACCENT_GLOW,
            0.0001,
            "rgba(0,0,0,0)",
          ],
        },
      });
    }
    if (!map.getLayer("route-main")) {
      map.addLayer({
        id: "route-main",
        type: "line",
        source: "route-progress",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ACCENT, "line-width": 6 },
      });
    }
    if (!map.getLayer("route-dash")) {
      map.addLayer({
        id: "route-dash",
        type: "line",
        source: "route-progress",
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: {
          "line-color": INK,
          "line-width": 2,
          "line-dasharray": [2, 3],
          "line-opacity": 0.85,
        },
      });
    }
  }

  function setGlowProgress(stop: number): void {
    if (!map.getLayer("route-glow")) return;
    map.setPaintProperty("route-glow", "line-gradient", [
      "step",
      ["line-progress"],
      ACCENT_GLOW,
      Math.max(0.0001, stop),
      "rgba(0,0,0,0)",
    ]);
  }

  function setMainSlice(coords: Coord[]): void {
    const src = map.getSource("route-progress") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (src) src.setData(fullLine(coords) as never);
  }

  function setRouteFull(coords: Coord[]): void {
    const src = map.getSource("route-full") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (src) src.setData(fullLine(coords) as never);
  }

  // ----- Animation ----------------------------------------------------------
  // The polyline already contains every kilometer of the actual race
  // (the 10K array is the 5K loop laid out end-to-end). So we just trace
  // it once from start to finish — no looping, no lap-2 overlay.
  // Resume hook set by the current frame() closure when it pauses because
  // the map is offscreen. Called by the IntersectionObserver above when
  // the map re-enters the viewport.
  let resumeAnimation: (() => void) | null = null;

  function runAnimation(route: Route): void {
    const myToken = ++animToken;
    clearKmMarkers();
    paintRunner(ACCENT, hexToRgba(ACCENT, 0.55));

    setRouteFull(route.coords);

    if (REDUCED_MOTION) {
      setGlowProgress(1);
      setMainSlice(route.coords);
      runnerEl.style.opacity = "0";
      route.kmPoints.forEach((m, idx) => {
        addKmMarker(`r-${idx}`, `${m.km}K`, m.lngLat);
      });
      return;
    }

    runnerMarker.setLngLat(route.coords[0]);
    runnerEl.style.opacity = "0";
    setGlowProgress(0);
    setMainSlice([route.coords[0], route.coords[0]]);

    const drawMs = 4000;
    // Longer routes get a proportionally longer trace so the runner pace
    // stays consistent across 5K and 10K.
    const traceMs = Math.round(4200 * route.totalKm);
    const pauseMs = 2200;
    let start = performance.now();

    function frame(now: number): void {
      if (animToken !== myToken) return;
      // Pause if the map has scrolled out of view. Don't schedule the next
      // rAF; instead expose a resume callback that the observer will fire
      // when the map comes back, adjusting `start` so elapsed picks up
      // exactly where it left off.
      if (!mapVisible) {
        const pausedElapsed = now - start;
        resumeAnimation = () => {
          if (animToken !== myToken) return;
          start = performance.now() - pausedElapsed;
          resumeAnimation = null;
          requestAnimationFrame(frame);
        };
        return;
      }

      const elapsed = now - start;
      if (elapsed < drawMs) {
        const t = easeInOut(elapsed / drawMs);
        setGlowProgress(t);
        setMainSlice(route.sliceAtT(t));
        requestAnimationFrame(frame);
      } else if (elapsed < drawMs + traceMs) {
        setGlowProgress(1);
        setMainSlice(route.coords);

        const t = easeInOut((elapsed - drawMs) / traceMs);
        runnerEl.style.opacity = "1";
        runnerMarker.setLngLat(route.pointAtT(t));

        const runnerKm = t * route.totalKm;
        route.kmPoints.forEach((m, idx) => {
          const key = `m-${idx}`;
          if (kmMarkers[key]) return;
          if (runnerKm >= m.km - 0.05) {
            addKmMarker(key, `${m.km}K`, m.lngLat);
          }
        });

        requestAnimationFrame(frame);
      } else if (elapsed < drawMs + traceMs + pauseMs) {
        runnerMarker.setLngLat(route.coords[route.coords.length - 1]);
        requestAnimationFrame(frame);
      } else {
        if (animToken === myToken) runAnimation(route);
      }
    }
    requestAnimationFrame(frame);
  }

  function swapRoute(tab: "5k" | "10k"): void {
    const route = ROUTES[tab];
    if (!route) return;
    animToken++;
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    clearKmMarkers();
    runnerEl.style.opacity = "0";
    paintRunner(ACCENT, hexToRgba(ACCENT, 0.55));

    setRouteFull(route.coords);
    setMainSlice([route.coords[0], route.coords[0]]);
    runnerMarker.setLngLat(route.coords[0]);
    setGlowProgress(0);

    map.fitBounds(route.bounds, {
      padding: { top: 60, bottom: 60, left: 60, right: 60 },
      duration: REDUCED_MOTION ? 0 : 700,
      essential: true,
    });

    const delay = REDUCED_MOTION ? 0 : 750;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      runAnimation(route);
    }, delay);
  }

  // ----- Stat panel sync ----------------------------------------------------
  function applyTab(tab: "5k" | "10k"): void {
    currentTab = tab;
    const s = STATS[tab];
    if (!s) return;
    if (SECTION) SECTION.dataset.activeTab = tab;

    document.querySelectorAll<HTMLElement>(".route-tab").forEach((btn) => {
      const on = btn.dataset.tab === tab;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });

    const setText = (sel: string, val: string | null | undefined): void => {
      const el = document.querySelector(sel);
      if (el != null && val != null) el.textContent = val;
    };
    setText('[data-stat="distance"] [data-stat-base]', s.lapDistance);
    setText('[data-stat="distance"] [data-stat-laps]', String(s.laps));
    setText('[data-stat="elev"]', s.elevation);
    setText('[data-stat="surface"]', s.surface);
    setText('[data-stat="aid"]', s.aidStations);
    setText("[data-legend-distance]", s.legendDistance);
  }

  document.querySelectorAll<HTMLElement>(".route-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab as "5k" | "10k" | undefined;
      if (!tab || tab === currentTab) return;
      applyTab(tab);
      swapRoute(tab);
    });
  });

  // ----- Map load -----------------------------------------------------------
  map.on("load", () => {
    ensureLayers();
    placeMeetingMarker();
    runnerMarker.addTo(map);

    map.fitBounds(initialRoute.bounds, {
      padding: { top: 60, bottom: 60, left: 60, right: 60 },
      duration: 0,
    });

    pendingTimer = setTimeout(
      () => {
        pendingTimer = null;
        runAnimation(initialRoute);
      },
      REDUCED_MOTION ? 0 : 600,
    );
  });
})();

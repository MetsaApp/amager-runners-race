(function () {
  if (typeof maplibregl === "undefined") return;
  const mapEl = document.getElementById("map");
  if (!mapEl) return;

  const SITE = window.__SITE || {};
  const ROUTES_RAW = SITE.routePoints || {};
  if (!ROUTES_RAW["5k"] || !ROUTES_RAW["5k"].length) return;
  const STATS = SITE.routeStats || {};
  const SECTION = document.getElementById("route");
  const REDUCED_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ----- Geometry helpers ----------------------------------------------------
  function haversine(a, b) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLng = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function buildRoute(coords) {
    // Per-segment lengths + cumulative km at each vertex.
    const segLens = [];
    const cumKm = [0];
    let totalKm = 0;
    for (let i = 1; i < coords.length; i++) {
      const d = haversine(coords[i - 1], coords[i]);
      segLens.push(d);
      totalKm += d;
      cumKm.push(totalKm);
    }

    function pointAtT(t) {
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
    function sliceAtT(t) {
      if (t <= 0) return [coords[0], coords[0]];
      if (t >= 1) return coords.slice();
      const target = t * totalKm;
      const out = [];
      for (let i = 0; i < coords.length; i++) {
        if (cumKm[i] <= target) out.push(coords[i]); else break;
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
    const kmPoints = [];
    {
      const whole = Math.floor(totalKm);
      for (let k = 1; k <= whole; k++) {
        // Walk segments to find the one containing the k-th km mark.
        let lngLat = coords[coords.length - 1];
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

    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    );
    return { coords, totalKm, pointAtT, sliceAtT, kmPoints, bounds };
  }

  const ROUTES = {
    "5k": buildRoute(ROUTES_RAW["5k"]),
    "10k": ROUTES_RAW["10k"] && ROUTES_RAW["10k"].length ? buildRoute(ROUTES_RAW["10k"]) : buildRoute(ROUTES_RAW["5k"]),
  };

  // ----- Color helpers -------------------------------------------------------
  function resolveColorToHex(cssColor, fallback) {
    try {
      const probe = document.createElement("div");
      probe.style.display = "none";
      probe.style.color = cssColor;
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      const m = rgb.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const [r, g, b] = m[1].split(",").map((s) => parseInt(s.trim(), 10));
        return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
      }
      if (/^#[0-9a-f]{6}$/i.test(rgb)) return rgb;
      return fallback;
    } catch (e) {
      return fallback;
    }
  }
  function hexToRgba(hex, a) {
    const m = hex.replace("#", "");
    const r = parseInt(m.substring(0, 2), 16);
    const g = parseInt(m.substring(2, 4), 16);
    const b = parseInt(m.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  const ACCENT = resolveColorToHex(
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
    "#2D5BFF"
  );
  const ACCENT_GLOW = hexToRgba(ACCENT, 0.28);
  const INK = "#0B0D10";
  const PAPER = resolveColorToHex(
    getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
    "#F5F4EF"
  );
  const GOLD = "#E0B341";

  // ----- Map init -----------------------------------------------------------
  const initialTab = (SECTION && SECTION.dataset.activeTab) || "5k";
  const initialRoute = ROUTES[initialTab];

  const map = new maplibregl.Map({
    container: "map",
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    center: initialRoute.coords[0],
    zoom: 13,
    attributionControl: { compact: true },
    // The map is presentational — no panning, zooming, rotating, or
    // keyboard navigation. `interactive: false` disables all user
    // gestures and handlers in one shot.
    interactive: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  window.__mapInstance = map;

  // Runner — accent (blue) with ink + paper rings; pulses on lap 2.
  const runnerEl = document.createElement("div");
  function paintRunner(color, glowColor) {
    runnerEl.style.cssText = `width:18px;height:18px;border-radius:50%;background:${color};box-shadow:0 0 0 2.5px ${PAPER}, 0 0 0 4.5px ${INK}, 0 0 14px ${glowColor};transition:opacity .25s, background .35s, box-shadow .35s;opacity:0;`;
  }
  paintRunner(ACCENT, hexToRgba(ACCENT, 0.55));
  const runnerMarker = new maplibregl.Marker({ element: runnerEl }).setLngLat(initialRoute.coords[0]);

  // Meeting point — sits off the route, on the grass. Decorative only
  // (no popup, no link) so the map stays presentational.
  let meetingMarker = null;
  function placeMeetingMarker() {
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
  let kmMarkers = {};
  function clearKmMarkers() {
    Object.values(kmMarkers).forEach((m) => m && m.remove && m.remove());
    kmMarkers = {};
  }
  function addKmMarker(key, label, lngLat) {
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
    const mk = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(lngLat).addTo(map);
    el.style.opacity = "0";
    if (el.animate) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" });
    } else {
      el.style.opacity = "1";
    }
    kmMarkers[key] = mk;
  }

  // ----- Tab / animation state ---------------------------------------------
  let currentTab = initialTab;
  let animToken = 0;
  let pendingTimer = null;

  function emptyLine() {
    // A 1-point LineString is invalid; use a degenerate 2-point version.
    const c = ROUTES[currentTab].coords[0];
    return { type: "Feature", geometry: { type: "LineString", coordinates: [c, c] } };
  }
  function fullLine(coords) {
    return { type: "Feature", geometry: { type: "LineString", coordinates: coords } };
  }

  function ensureLayers() {
    // Two sources: the full route (used by the soft halo so the glow doesn't
    // have to redraw every frame) and a progressive slice that the main blue
    // + dashed-black overlay both follow. Sharing a single source means the
    // dashes mask the live tip of the line on every frame, which is what
    // gives us "dashes draw together with the blue line".
    if (!map.getSource("route-full")) {
      map.addSource("route-full", {
        type: "geojson",
        lineMetrics: true,
        data: fullLine(ROUTES[currentTab].coords),
      });
    }
    if (!map.getSource("route-progress")) {
      map.addSource("route-progress", {
        type: "geojson",
        data: emptyLine(),
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
          "line-gradient": ["step", ["line-progress"], ACCENT_GLOW, 0.0001, "rgba(0,0,0,0)"],
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

  function setGlowProgress(stop) {
    if (!map.getLayer("route-glow")) return;
    map.setPaintProperty("route-glow", "line-gradient",
      ["step", ["line-progress"], ACCENT_GLOW, Math.max(0.0001, stop), "rgba(0,0,0,0)"]);
  }

  function setMainSlice(coords) {
    const src = map.getSource("route-progress");
    if (src) src.setData(fullLine(coords));
  }

  function setRouteFull(coords) {
    const src = map.getSource("route-full");
    if (src) src.setData(fullLine(coords));
  }

  // ----- Animation ----------------------------------------------------------
  // The polyline already contains every kilometer of the actual race
  // (the 10K array is the 5K loop laid out end-to-end). So we just trace
  // it once from start to finish — no looping, no lap-2 overlay.
  function runAnimation(route) {
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
    const start = performance.now();

    function frame(now) {
      if (animToken !== myToken) return;
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

  function swapRoute(tab) {
    const route = ROUTES[tab];
    if (!route) return;
    animToken++;
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
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
  function applyTab(tab) {
    currentTab = tab;
    const s = STATS[tab];
    if (!s) return;
    if (SECTION) SECTION.dataset.activeTab = tab;

    document.querySelectorAll(".route-tab").forEach((btn) => {
      const on = btn.dataset.tab === tab;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });

    const setText = (sel, val) => {
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

  document.querySelectorAll(".route-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
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

    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      runAnimation(initialRoute);
    }, REDUCED_MOTION ? 0 : 600);
  });
})();

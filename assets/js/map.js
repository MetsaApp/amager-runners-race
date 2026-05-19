(function () {
  if (typeof maplibregl === "undefined") return;
  const mapEl = document.getElementById("map");
  if (!mapEl) return;

  const SITE = window.__SITE || {};
  const COORDS = SITE.routePoints || [];
  if (!COORDS.length) return;
  const START = COORDS[0];
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
  const segLens = [];
  let totalKm = 0;
  for (let i = 1; i < COORDS.length; i++) {
    const d = haversine(COORDS[i - 1], COORDS[i]);
    segLens.push(d);
    totalKm += d;
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function pointAtT(t) {
    if (t <= 0) return COORDS[0];
    if (t >= 1) return COORDS[COORDS.length - 1];
    const target = t * totalKm;
    let acc = 0;
    for (let i = 0; i < segLens.length; i++) {
      if (acc + segLens[i] >= target) {
        const f = (target - acc) / segLens[i];
        return [
          lerp(COORDS[i][0], COORDS[i + 1][0], f),
          lerp(COORDS[i][1], COORDS[i + 1][1], f),
        ];
      }
      acc += segLens[i];
    }
    return COORDS[COORDS.length - 1];
  }
  function pointAtDistance(km) {
    let acc = 0;
    for (let i = 1; i < COORDS.length; i++) {
      const seg = haversine(COORDS[i - 1], COORDS[i]);
      if (acc + seg >= km) {
        const f = (km - acc) / seg;
        return [
          COORDS[i - 1][0] + (COORDS[i][0] - COORDS[i - 1][0]) * f,
          COORDS[i - 1][1] + (COORDS[i][1] - COORDS[i - 1][1]) * f,
        ];
      }
      acc += seg;
    }
    return COORDS[COORDS.length - 1];
  }
  const KM_POINTS = [];
  {
    const whole = Math.floor(totalKm);
    for (let k = 1; k <= whole; k++) KM_POINTS.push({ km: k, lngLat: pointAtDistance(k) });
  }
  const BOUNDS = COORDS.reduce(
    (b, c) => b.extend(c),
    new maplibregl.LngLatBounds(COORDS[0], COORDS[0])
  );

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
  const map = new maplibregl.Map({
    container: "map",
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    center: START,
    zoom: 13,
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  window.__mapInstance = map;

  const runnerEl = document.createElement("div");
  runnerEl.style.cssText = `width:18px;height:18px;border-radius:50%;background:${GOLD};box-shadow:0 0 0 3px ${INK}, 0 0 14px ${ACCENT_GLOW};transition:opacity .25s;opacity:0;`;
  const runnerMarker = new maplibregl.Marker({ element: runnerEl }).setLngLat(START);

  let kmMarkers = {};
  function clearKmMarkers() {
    Object.values(kmMarkers).forEach((m) => m && m.remove && m.remove());
    kmMarkers = {};
  }
  function addKmMarker(key, label, lngLat) {
    if (kmMarkers[key]) return;
    const el = document.createElement("div");
    el.style.cssText = "display:flex;align-items:center;gap:4px;pointer-events:none;";
    const dot = document.createElement("span");
    dot.style.cssText = `width:9px;height:9px;border-radius:50%;background:${INK};box-shadow:0 0 0 2.5px ${PAPER};flex-shrink:0;`;
    const tag = document.createElement("span");
    tag.textContent = label;
    tag.style.cssText = `font:600 10px/1 "JetBrains Mono", ui-monospace, monospace;color:${PAPER};background:${INK};padding:2px 5px;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,.15);letter-spacing:.04em;white-space:nowrap;`;
    el.appendChild(dot);
    el.appendChild(tag);
    const mk = new maplibregl.Marker({ element: el, anchor: "left", offset: [0, -10] }).setLngLat(lngLat).addTo(map);
    const inner = el;
    inner.style.opacity = "0";
    if (inner.animate) {
      inner.animate(
        [
          { opacity: 0 },
          { opacity: 1 },
        ],
        { duration: 280, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" }
      );
    } else {
      inner.style.opacity = "1";
    }
    kmMarkers[key] = mk;
  }

  // Tab state
  let currentTab = (SECTION && SECTION.dataset.activeTab) || "5k";
  let animToken = 0;

  function laneStop(stop, color) {
    return ["step", ["line-progress"], color, Math.max(0.0001, stop), "rgba(0,0,0,0)"];
  }

  function ensureLayers() {
    if (!map.getSource("route")) {
      map.addSource("route", {
        type: "geojson",
        lineMetrics: true,
        data: { type: "Feature", geometry: { type: "LineString", coordinates: COORDS } },
      });
    }
    if (!map.getLayer("route-glow")) {
      map.addLayer({
        id: "route-glow",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ACCENT_GLOW,
          "line-width": 14,
          "line-blur": 6,
          "line-gradient": laneStop(0, ACCENT_GLOW),
        },
      });
    }
    if (!map.getLayer("route-main")) {
      map.addLayer({
        id: "route-main",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ACCENT,
          "line-width": 6,
          "line-gradient": laneStop(0, ACCENT),
        },
      });
    }
    if (!map.getLayer("route-dash")) {
      // line-dasharray is silently ignored when line-gradient is set, so the
      // dash layer cannot also do the reveal. Instead, we hide it during the
      // draw phase via line-opacity, then fade it in once the main line is done.
      map.addLayer({
        id: "route-dash",
        type: "line",
        source: "route",
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: {
          "line-color": INK,
          "line-width": 2,
          "line-dasharray": [2, 3],
          "line-opacity": 0,
        },
      });
    }
  }

  function setLineProgress(stop) {
    if (map.getLayer("route-main")) map.setPaintProperty("route-main", "line-gradient", laneStop(stop, ACCENT));
    if (map.getLayer("route-glow")) map.setPaintProperty("route-glow", "line-gradient", laneStop(stop, ACCENT_GLOW));
  }

  function setLineComplete() {
    const fill = (color) => ["step", ["line-progress"], color, 1, color];
    if (map.getLayer("route-main")) map.setPaintProperty("route-main", "line-gradient", fill(ACCENT));
    if (map.getLayer("route-glow")) map.setPaintProperty("route-glow", "line-gradient", fill(ACCENT_GLOW));
  }

  function setDashOpacity(o) {
    if (map.getLayer("route-dash")) map.setPaintProperty("route-dash", "line-opacity", o);
  }

  // ----- Animation ----------------------------------------------------------
  function runAnimation(laps) {
    const myToken = ++animToken;
    clearKmMarkers();

    if (REDUCED_MOTION) {
      setLineComplete();
      setDashOpacity(0.85);
      runnerEl.style.opacity = "0";
      KM_POINTS.forEach((m, idx) => {
        addKmMarker(`r-${idx}`, `${m.km}K`, m.lngLat);
      });
      return;
    }

    runnerMarker.setLngLat(COORDS[0]);
    runnerEl.style.opacity = "0";
    setLineProgress(0);
    setDashOpacity(0);

    const drawMs = 4000;
    const dashFadeMs = 600;
    const traceTotalMs = 21000;
    const traceMs = traceTotalMs / laps;
    const pauseMs = 2200;
    const start = performance.now();
    const wholeLap = Math.floor(totalKm);

    function frame(now) {
      if (animToken !== myToken) return;
      const elapsed = now - start;
      if (elapsed < drawMs) {
        const t = easeInOut(elapsed / drawMs);
        setLineProgress(t);
        requestAnimationFrame(frame);
      } else if (elapsed < drawMs + traceMs * laps) {
        setLineComplete();
        const dashT = Math.min(1, (elapsed - drawMs) / dashFadeMs);
        setDashOpacity(dashT * 0.85);
        const traceElapsed = elapsed - drawMs;
        const lapIdx = Math.min(laps - 1, Math.floor(traceElapsed / traceMs));
        const lapT = easeInOut((traceElapsed - lapIdx * traceMs) / traceMs);
        runnerEl.style.opacity = "1";
        runnerMarker.setLngLat(pointAtT(lapT));

        const runnerKm = lapT * totalKm;
        KM_POINTS.forEach((m, idx) => {
          const key = `${lapIdx}-${idx}`;
          if (kmMarkers[key]) return;
          if (runnerKm >= m.km - 0.05) {
            const label = laps > 1 ? `${m.km + lapIdx * wholeLap}K` : `${m.km}K`;
            addKmMarker(key, label, m.lngLat);
          }
        });

        if (laps > 1 && lapT < 0.05 && lapIdx > 0) {
          Object.keys(kmMarkers).forEach((k) => {
            if (k.startsWith(`${lapIdx - 1}-`)) {
              kmMarkers[k].remove();
              delete kmMarkers[k];
            }
          });
        }

        requestAnimationFrame(frame);
      } else if (elapsed < drawMs + traceMs * laps + pauseMs) {
        runnerMarker.setLngLat(COORDS[COORDS.length - 1]);
        requestAnimationFrame(frame);
      } else {
        if (animToken === myToken) runAnimation(laps);
      }
    }
    requestAnimationFrame(frame);
  }

  function fitAndAnimate(laps) {
    if (!map.loaded()) {
      map.once("load", () => fitAndAnimate(laps));
      return;
    }
    ensureLayers();
    map.fitBounds(BOUNDS, {
      padding: { top: 60, bottom: 60, left: 60, right: 60 },
      duration: REDUCED_MOTION ? 0 : 700,
      essential: true,
    });
    const delay = REDUCED_MOTION ? 0 : 750;
    setTimeout(() => runAnimation(laps), delay);
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
    setText("[data-legend-start]", s.legendStart);
  }

  document.querySelectorAll(".route-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (!tab || tab === currentTab) return;
      applyTab(tab);
      const laps = (STATS[tab] && STATS[tab].laps) || 1;
      fitAndAnimate(laps);
    });
  });

  // ----- Map load -----------------------------------------------------------
  map.on("load", () => {
    ensureLayers();

    // Start / finish marker — gold core, paper + ink rings.
    const startEl = document.createElement("div");
    startEl.style.cssText = `width:16px;height:16px;border-radius:50%;background:${GOLD};box-shadow:0 0 0 2.5px ${PAPER}, 0 0 0 4.5px ${INK};`;
    new maplibregl.Marker({ element: startEl })
      .setLngLat(START)
      .setPopup(
        new maplibregl.Popup({ offset: 16 }).setHTML(
          "<strong>" + (SITE.startLabel || "Start / Finish") + "</strong><br/>" + (SITE.startVenue || "")
        )
      )
      .addTo(map);

    runnerMarker.addTo(map);

    map.fitBounds(BOUNDS, {
      padding: { top: 60, bottom: 60, left: 60, right: 60 },
      duration: 0,
    });

    const initialLaps = (STATS[currentTab] && STATS[currentTab].laps) || 1;
    setTimeout(() => runAnimation(initialLaps), REDUCED_MOTION ? 0 : 600);
  });
})();

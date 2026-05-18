(function () {
  if (typeof maplibregl === "undefined") return;
  const mapEl = document.getElementById("map");
  if (!mapEl) return;

  const ROUTE_5K = (window.__SITE && window.__SITE.routePoints) || [];
  if (!ROUTE_5K.length) return;
  const ROUTE_10K = ROUTE_5K.concat(ROUTE_5K.slice(1));
  const START = ROUTE_5K[0];
  const AID_STATIONS = [
    { d: "5K / 10K", name: "Water station (5K halfway for 10K)", coord: START },
  ];

  function toFeature(coords, id) {
    return {
      type: "Feature",
      properties: { id },
      geometry: { type: "LineString", coordinates: coords },
    };
  }

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
  function currentAccentHex() {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim();
    return resolveColorToHex(raw, "#3B6BE6");
  }

  const accentCss = currentAccentHex();
  const map = new maplibregl.Map({
    container: "map",
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    center: [12.651, 55.647],
    zoom: 12.4,
    attributionControl: { compact: true },
  });
  window.__mapInstance = map;
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  function addRoutes() {
    if (!map.getSource("src-5k")) {
      map.addSource("src-5k", { type: "geojson", data: toFeature(ROUTE_5K, "5k") });
    }
    if (!map.getSource("src-10k")) {
      map.addSource("src-10k", { type: "geojson", data: toFeature(ROUTE_10K, "10k") });
    }
    try {
      if (!map.getLayer("route-10k-glow"))
        map.addLayer({
          id: "route-10k-glow",
          type: "line",
          source: "src-10k",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#0B0D10", "line-width": 12, "line-opacity": 0.1, "line-blur": 3, "line-offset": 4 },
        });
      if (!map.getLayer("route-10k"))
        map.addLayer({
          id: "route-10k",
          type: "line",
          source: "src-10k",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#0B0D10", "line-width": 3, "line-dasharray": [2, 1.4], "line-offset": 4 },
        });
      if (!map.getLayer("route-5k-glow"))
        map.addLayer({
          id: "route-5k-glow",
          type: "line",
          source: "src-5k",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": accentCss || "#3B6BE6", "line-width": 10, "line-opacity": 0.18, "line-blur": 2 },
        });
      if (!map.getLayer("route-5k"))
        map.addLayer({
          id: "route-5k",
          type: "line",
          source: "src-5k",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": accentCss || "#3B6BE6", "line-width": 4 },
        });
    } catch (e) {
      // ignore, will retry
    }
  }

  map.on("load", () => {
    addRoutes();
    map.once("idle", addRoutes);
    const startEl = document.createElement("div");
    startEl.style.cssText =
      "width:22px;height:22px;border-radius:50%;background:#E0B341;border:3px solid #0B0D10;box-shadow:0 2px 10px rgba(0,0,0,.2);";
    new maplibregl.Marker({ element: startEl })
      .setLngLat(START)
      .setPopup(
        new maplibregl.Popup({ offset: 16 }).setHTML(
          "<strong>" +
            (window.__SITE.startLabel || "Start / Finish") +
            "</strong><br/>" +
            (window.__SITE.startVenue || "")
        )
      )
      .addTo(map);
    AID_STATIONS.forEach((a) => {
      const el = document.createElement("div");
      el.style.cssText =
        "width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid #0B0D10;";
      new maplibregl.Marker({ element: el })
        .setLngLat(a.coord)
        .setPopup(new maplibregl.Popup({ offset: 12 }).setText(a.d + " · " + a.name))
        .addTo(map);
    });
    const all = ROUTE_5K.concat(ROUTE_10K);
    const bounds = all.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(all[0], all[0])
    );
    map.fitBounds(bounds, { padding: 60, duration: 0 });
  });
})();

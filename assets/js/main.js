// Smooth scroll for in-page anchors + nudge route map on demand
(function () {
  const viewRouteBtn = document.getElementById("viewRouteBtn");
  if (viewRouteBtn) {
    viewRouteBtn.addEventListener("click", (e) => {
      const target = document.getElementById("route");
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        if (window.__mapInstance) setTimeout(() => window.__mapInstance.resize(), 400);
      }
    });
  }
})();

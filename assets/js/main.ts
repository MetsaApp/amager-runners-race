import "./types";

// Smooth scroll for in-page anchors + nudge route map on demand
(function () {
  const viewRouteBtn = document.getElementById("viewRouteBtn");
  if (viewRouteBtn) {
    viewRouteBtn.addEventListener("click", (e) => {
      const target = document.getElementById("route");
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        if (window.__mapInstance) {
          const map = window.__mapInstance;
          setTimeout(() => map.resize(), 400);
        }
      }
    });
  }
})();

// Toggle body.is-scrolled when the hero leaves the top — drives the
// topbar's overlay → solid swap.
(function () {
  const hero = document.querySelector(".hero");
  if (!hero || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(
    ([entry]) => {
      document.body.classList.toggle("is-scrolled", !entry.isIntersecting);
    },
    { rootMargin: "-60px 0px 0px 0px" },
  );
  io.observe(hero);
})();

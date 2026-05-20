/**
 * Colour helpers. `hexToRgba` is pure (table-tested). `resolveColorToHex` is
 * DOM-dependent adapter code (it probes computed styles) and is intentionally
 * not unit-tested — jsdom can't resolve oklch() anyway.
 */

/** Convert `#RRGGBB` + alpha into a `rgba(r,g,b,a)` string. */
export function hexToRgba(hex: string, a: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.substring(0, 2), 16);
  const g = parseInt(m.substring(2, 4), 16);
  const b = parseInt(m.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * Resolve any CSS colour (incl. a custom property value like the computed
 * `--accent` oklch) to a `#rrggbb` hex string by letting the browser compute
 * it on a hidden probe element. Falls back to `fallback` on any failure.
 *
 * DOM-dependent — only callable in the browser.
 */
export function resolveColorToHex(cssColor: string, fallback: string): string {
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
      return (
        "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")
      );
    }
    if (/^#[0-9a-f]{6}$/i.test(rgb)) return rgb;
    return fallback;
  } catch {
    return fallback;
  }
}

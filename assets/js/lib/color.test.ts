import { describe, it, expect } from "vitest";
import { hexToRgba } from "./color";

describe("hexToRgba", () => {
  const cases: Array<{ hex: string; a: number; expected: string }> = [
    { hex: "#0B0D10", a: 0.5, expected: "rgba(11,13,16,0.5)" },
    { hex: "#FFFFFF", a: 1, expected: "rgba(255,255,255,1)" },
    { hex: "#000000", a: 0, expected: "rgba(0,0,0,0)" },
    { hex: "#2D5BFF", a: 0.28, expected: "rgba(45,91,255,0.28)" },
    // No leading hash is tolerated (strips only the first '#').
    { hex: "F5F4EF", a: 0.55, expected: "rgba(245,244,239,0.55)" },
    // Lowercase hex parses identically.
    { hex: "#abcdef", a: 0.1, expected: "rgba(171,205,239,0.1)" },
  ];

  it.each(cases)("hexToRgba($hex, $a) === $expected", ({ hex, a, expected }) => {
    expect(hexToRgba(hex, a)).toBe(expected);
  });
});

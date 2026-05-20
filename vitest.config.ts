import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // Pure geometry/colour modules need no DOM. `resolveColorToHex` is
    // DOM-dependent adapter code and is intentionally not unit-tested.
    environment: "node",
    include: ["assets/js/**/*.test.ts"],
  },
});

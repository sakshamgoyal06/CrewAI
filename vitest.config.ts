import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    // TypeScript source uses `.js` in import specifier (NodeNext); map to `.ts` for Vitest.
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
    },
  },
});

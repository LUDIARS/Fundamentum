import { defineConfig } from "vitest/config";

// lib (src/) のみを vitest の対象にする。datahub/ と packages/datahub-kit/ は
// 各パッケージの node:test で回す (それぞれの package.json の test スクリプト)。
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});

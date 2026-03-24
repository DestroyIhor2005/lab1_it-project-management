import js from "@eslint/js";
import globals from "globals";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { ignores: ["dist/**", "coverage/**", "playwright-report/**", "test-results/**"] },
  { files: ["**/*.{js,mjs,cjs,jsx}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.browser } },
  { files: ["**/*.test.js", "**/*.spec.js"], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  { settings: { react: { version: "detect" } } },
  pluginReact.configs.flat.recommended,
]);

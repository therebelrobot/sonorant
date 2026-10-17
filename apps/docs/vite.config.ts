import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The documentation site is a project page at github.io/<repo>/. Override with
 * DOCS_BASE=/ for a custom domain, exactly as the Pages workflow does.
 */
const base = process.env.DOCS_BASE ?? "/sonorant/";

/**
 * Add the site's Content-Security-Policy at build time only. In dev, Vite injects
 * inline scripts for HMR, which a `script-src 'self'` policy would block — so the
 * policy ships with the built page, where it applies.
 *
 * The docs site is not the app: it may load its own assets and (for the live
 * demo) capture the microphone. `connect-src 'self'` still forbids any external
 * origin, and `frame-ancestors` cannot be set from a <meta> tag.
 */
function csp() {
  return {
    name: "sonorant-docs-csp",
    apply: "build" as const,
    transformIndexHtml(html: string) {
      const policy = [
        "default-src 'self'",
        "img-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self' 'wasm-unsafe-eval'", // wasm only; matches apps/web's CSP
        "worker-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
      ].join("; ");
      return html.replace(
        "</title>",
        `</title>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

export default defineConfig(() => ({
  // Use the site's real base in dev, preview and build alike, so a base-path bug
  // shows up locally instead of only on Pages. Override with DOCS_BASE=/ for a
  // custom domain.
  base: process.env.DOCS_BASE ?? base,
  plugins: [react(), csp()],
  resolve: {
    // Use the engine's and the components' TypeScript sources directly, so the
    // docs build never depends on a prior `npm run build` of the packages.
    conditions: ["sonorant-source"],
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1200,
  },
}));

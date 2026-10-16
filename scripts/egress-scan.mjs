#!/usr/bin/env node
// Egress origin scan + CSP check (M0 / S0.3).
//
// Authority: TDD §12 (the central claim — audio has no code path to the network) and
// AGENTS.md rule 3 (no network client exists in the codebase). Two checks, both must
// pass:
//
//   1. Egress origin scan — fail on any external origin in the built bundle.
//   2. CSP check — the shipped headers set `connect-src 'none'` and
//      `frame-ancestors 'none'`, and do not inherit the dev-only
//      `cdnjs.cloudflare.com` allowance (TDD §12).
//
// Usage: node scripts/egress-scan.mjs [bundle-dir]   (default: apps/web/dist)

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const bundleDir = process.argv[2] ?? join(repoRoot, "apps", "web", "dist");

// Origins that look external but are never fetched: XML/SVG namespace URIs.
const ALLOWED_ORIGINS = ["www.w3.org"];

// Absolute or protocol-relative URL with a host: scheme://host or //host.
const URL_RE = /(?:https?:)?\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const SCAN_EXTENSIONS = new Set([
  ".html", ".htm", ".js", ".mjs", ".cjs", ".css", ".json",
  ".txt", ".svg", ".xml", ".webmanifest",
]);
const SCAN_NAMES = new Set(["_headers", "_redirects"]);

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`FAIL ${msg}`);
};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const shouldScan = (path) =>
  SCAN_EXTENSIONS.has(extname(path)) || SCAN_NAMES.has(path.split("/").pop());

if (!existsSync(bundleDir)) {
  console.error(
    `FAIL bundle directory not found: ${relative(repoRoot, bundleDir)} — run the build first`,
  );
  process.exit(1);
}

const files = walk(bundleDir);

// 1. Egress origin scan.
for (const file of files) {
  if (file.endsWith(".map") || !shouldScan(file)) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const match of line.matchAll(URL_RE)) {
      const href = match[0];
      const host = href.replace(/^(?:https?:)?\/\//, "").split("/")[0].toLowerCase();
      const allowed = ALLOWED_ORIGINS.some((a) => host === a || host.endsWith(`.${a}`));
      if (!allowed) fail(`external origin "${href}" at ${relative(repoRoot, file)}:${index + 1}`);
    }
  });
}

// 2. CSP check.
const headersFile = join(bundleDir, "_headers");
if (!existsSync(headersFile)) {
  fail("no _headers file in the bundle — the shipped CSP cannot be inspected");
} else {
  const headers = readFileSync(headersFile, "utf8");
  const csp =
    headers.split(/\r?\n/).find((l) => /^\s*Content-Security-Policy:/i.test(l)) ?? "";
  if (!/connect-src\s+'none'/i.test(csp)) fail("CSP is missing connect-src 'none' (TDD §12)");
  if (!/frame-ancestors\s+'none'/i.test(csp)) fail("CSP is missing frame-ancestors 'none' (TDD §12)");
  if (/cdnjs\.cloudflare\.com/i.test(headers)) {
    fail("dev-only cdnjs.cloudflare.com allowance inherited into the shipped bundle (TDD §12)");
  }
}

if (failures > 0) {
  console.error(`\n${failures} egress/CSP failure(s).`);
  process.exit(1);
}
console.log(`egress scan ok (${files.length} file(s) scanned), CSP ok`);

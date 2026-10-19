// Capture the docs site's screens for review and the README.
//
//   node scripts/capture-docs.mjs [--base http://localhost:4190/sonorant/]
//
// Assumes `npm run preview -w @sonorant/docs` is serving the built site (or pass
// --base). Writes PNGs to apps/docs/screenshots/.

import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { chromium } from "playwright";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const BASE = flag("--base", "http://localhost:4190/sonorant/");
const OUT = join(repoRoot, "apps", "docs", "screenshots");
mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1280, height: 900 };

const browser = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});

async function shot(page, name, { fullPage = false } = {}) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });
  console.log(`captured ${name}.png`);
}

try {
  // Dark theme (the default).
  {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
    const page = await context.newPage();
    for (const [route, name, full] of [
      ["#/", "home", true],
      ["#/guide", "guide", true],
      ["#/packages", "packages", true],
    ]) {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      await shot(page, name, { fullPage: full });
    }

    await page.goto(`${BASE}#/visualizations`, { waitUntil: "networkidle" });
    await page.waitForSelector("figure.sonorant-pad svg");
    await shot(page, "visualizations-fixture");

    await page.getByRole("heading", { name: "Resonance over time" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot(page, "visualizations-trend");

    // Live microphone path (fake device).
    await context.grantPermissions(["microphone"], { origin: new URL(BASE).origin });
    await page.getByRole("button", { name: "Live microphone" }).click();
    await page.getByRole("button", { name: "Start microphone" }).click();
    await page
      .waitForFunction(
        () => document.querySelectorAll("figure.sonorant-pad circle").length > 5,
        null,
        { timeout: 20000 },
      )
      .catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, "visualizations-live");
    await context.close();
  }

  // Light theme.
  {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
    await context.addInitScript(() => {
      try {
        localStorage.setItem("sonorant-docs-theme", "light");
      } catch {}
    });
    const page = await context.newPage();
    await page.goto(`${BASE}#/visualizations`, { waitUntil: "networkidle" });
    await page.waitForSelector("figure.sonorant-pad svg");
    await shot(page, "visualizations-light");
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`screenshots written to ${OUT}`);

// Automated browser check for the docs site (issue #4). Builds are assumed done;
// this serves apps/docs/dist through `vite preview` (so the /<repo>/ base applies)
// and asserts the visualization demo renders and every route loads, with no
// console error. Exits non-zero on any failure.
//
// Usage: node scripts/verify-docs.mjs

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.SONORANT_DOCS_PORT ?? 4180);
const BASE_PATH = process.env.DOCS_BASE ?? "/sonorant/";
const BASE = `http://localhost:${PORT}${BASE_PATH}`;

const failures = [];
function check(label, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("docs preview server did not start");
}

async function main() {
  const server = spawn(
    "npm",
    ["run", "preview", "-w", "@sonorant/docs", "--", "--port", String(PORT), "--strictPort"],
    { cwd: repoRoot, stdio: "ignore" },
  );

  const consoleErrors = [];
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    });
    const context = await browser.newContext();
    await context.grantPermissions(["microphone"], { origin: BASE });
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    await page.goto(`${BASE}#/visualizations`, { waitUntil: "networkidle" });
    await page.waitForSelector("figure.sonorant-pad svg", { timeout: 15000 });
    check("the pitch/resonance pad draws points", (await page.locator("figure.sonorant-pad circle").count()) >= 10);

    const summary = await page.locator(".sonorant-summary").innerText();
    check("the frame summary renders a pitch line", /Pitch:/.test(summary));

    check(
      "the trend chart renders a trace",
      (await page.locator("figure.sonorant-trend svg path").count()) >= 1,
    );

    for (const [hash, heading] of [
      ["#/guide", "Developer guide"],
      ["#/packages", "Packages"],
      ["#/", "Sonorant"],
    ]) {
      await page.goto(`${BASE}${hash}`, { waitUntil: "domcontentloaded" });
      const visible = await page
        .getByRole("heading", { name: heading, exact: false })
        .first()
        .waitFor({ timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      check(`the ${heading} page renders`, visible);
    }

    check("no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));

    // The live path loads the real WASM core and captures the (fake) microphone.
    await page.goto(`${BASE}#/visualizations`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Live microphone" }).click();
    await page.getByRole("button", { name: "Start microphone" }).click();
    const live = await page
      .waitForFunction(
        () => (document.querySelectorAll("figure.sonorant-pad circle").length ?? 0) > 5,
        null,
        { timeout: 20000 },
      )
      .then(() => true)
      .catch(() => false);
    check("the live microphone path analyses frames in-browser", live);
    if (!live) {
      const status = await page.locator(".demo-controls__row .note").first().innerText().catch(() => "");
      check("the live path reported why", false, status);
    }
  } catch (error) {
    check("the docs smoke run completed", false, String(error));
  } finally {
    if (browser) await browser.close();
    server.kill();
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} docs check(s) failed: ${failures.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("\nall docs checks passed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

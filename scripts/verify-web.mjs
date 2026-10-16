// Automated browser check for the web app (phase 8). Runs the built bundle against
// a fake microphone and asserts the first-run, live, history and archive paths.
// Exits non-zero on any failure.

import { spawn } from "node:child_process";

import { chromium } from "playwright";

const PORT = Number(process.env.SONORANT_WEB_PORT ?? 4173);
const BASE = `http://localhost:${PORT}`;

const failures = [];
function check(label, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("server did not start");
}

async function main() {
  const server = spawn(
    process.execPath,
    ["scripts/serve-web.mjs", "apps/web/dist", String(PORT)],
    { stdio: "ignore" },
  );

  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    });
    const context = await browser.newContext();
    await context.addInitScript(() => {
      window.__SONORANT_FLAGS__ = {
        "enable-local-history": true,
        "enable-history-ab": true,
        "enable-longitudinal-trends": true,
      };
    });
    const page = await context.newPage();
    await page.goto(BASE);

    check(
      "microphone permission panel shows",
      await page.getByRole("heading", { name: "This app needs your microphone" }).isVisible(),
    );

    await page.getByRole("button", { name: "Allow microphone" }).click();
    await page
      .getByRole("heading", { name: "Live practice" })
      .waitFor({ timeout: 15000 })
      .then(() => check("reaches the live practice view", true))
      .catch(() => check("reaches the live practice view", false));

    await page
      .waitForFunction(
        () => /\d+ frames analysed/.test(document.getElementById("frame-count")?.textContent ?? ""),
        null,
        { timeout: 20000 },
      )
      .then(() => check("frames flow through the wasm core", true))
      .catch(() => check("frames flow through the wasm core", false));

    await page.getByRole("button", { name: "Finish session" }).click();
    await page
      .waitForFunction(
        () => /saved|Nothing to save/.test(document.getElementById("history-status")?.textContent ?? ""),
        null,
        { timeout: 5000 },
      )
      .catch(() => {});
    check(
      "a session is stored",
      /saved/.test(await page.locator("#history-status").textContent()),
    );

    await page.getByLabel("Passphrase").first().fill("verify");
    const downloadPromise = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
    await page.getByRole("button", { name: "Export history" }).click();
    const download = await downloadPromise;
    check(
      "export downloads an archive",
      download !== null && /\.zip$/.test(download.suggestedFilename()),
    );
  } finally {
    if (browser) await browser.close();
    server.kill();
  }

  if (failures.length > 0) {
    console.error(`${failures.length} web check(s) failed: ${failures.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("all web checks passed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

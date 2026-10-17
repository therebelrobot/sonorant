// S6.x wiring: the archive is reachable from the wrapper (and so from the browser).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { describeArchive, exportArchive, importArchive } from "../src/index.ts";

const wasmUrl = new URL("../pkg/sonorant_ffi_bg.wasm", import.meta.url);
const EMPTY = "{\"sessions\":[],\"utterances\":[],\"metric_series\":[]}";

async function wasmBytes() {
  return new Uint8Array(await readFile(wasmUrl));
}

test("export → describe → import round-trips through the wrapper", async () => {
  const options = { wasmBytes: await wasmBytes() };
  const bundle = JSON.stringify({
    sessions: [{ id: "s1", data: { core_version: "0.1.0" } }],
    utterances: [],
    metric_series: [],
  });

  const bytes = await exportArchive({
    bundleJson: bundle,
    coreVersion: "0.1.0",
    abiVersion: 1,
    createdAt: "2026-01-01T00:00:00Z",
    passphrase: "pass",
    ...options,
  });
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 0);

  const described = await describeArchive(bytes, options);
  assert.match(described, /voice history/);

  const result = await importArchive({ bytes, existingJson: EMPTY, passphrase: "pass", ...options });
  assert.equal(result.report.added, 1);
  assert.equal(result.bundle.sessions[0].id, "s1");
});

test("a wrong passphrase rejects", async () => {
  const options = { wasmBytes: await wasmBytes() };
  const bundle = "{\"sessions\":[],\"utterances\":[],\"metric_series\":[]}";
  const bytes = await exportArchive({
    bundleJson: bundle,
    coreVersion: "0.1.0",
    abiVersion: 1,
    createdAt: "t",
    passphrase: "right",
    ...options,
  });
  await assert.rejects(() =>
    importArchive({ bytes, existingJson: EMPTY, passphrase: "wrong", ...options }),
  );
});

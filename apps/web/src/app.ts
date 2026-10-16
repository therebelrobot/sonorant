// First-run flow, live pad, recording, summary, history and A/B (S4.1–S5.3).
// DOM wiring only; the logic lives in the imported modules.

import { COPY, isSecure, openMicrophone } from "./capture.ts";
import { startCapture } from "./capture-shim.ts";
import { FRAME_WORDS, decodeFrames } from "./vendor/sonorant/dist/index.js";
import { PAD_TEXT, PadView } from "./pad/pad-view.ts";
import { activeFlags, isTrustworthy } from "./pad/pad-model.ts";
import { summarize } from "./pad/summary.ts";
import { RECORDING_COPY } from "./store/recorder.ts";
import {
  HISTORY_COPY,
  buildSessionRecords,
  formatDate,
  historyRowSummary,
  toComparisonViewModel,
  toHistoryViewModel,
} from "./store/history.ts";
import { buildTrendSeries, segmentDistribution, trendPoints, trendTextAlternative } from "./store/trends.ts";
import { TrendView } from "./pad/trend-view.ts";
import { fromBundle, toBundle } from "./store/bundle.ts";
import { ensureMeasureVersion, getAll, openDatabase, putRows } from "./store/indexed-db.ts";
import { isEnabled } from "./flags.ts";
import { APP_VERSION } from "./version.ts";

const PANELS = ["insecure", "permission", "denied", "practice", "status", "checking"];
const MAX_SESSION_FRAMES = 20000;
const SESSION_KIND = "sustained";

const el = (id) => document.getElementById(id);
const show = (id) => { const n = el(id); if (n) n.hidden = false; };
const hideAll = () => { for (const id of PANELS) { const n = el(id); if (n) n.hidden = true; } };
const listItem = (text) => { const li = document.createElement("li"); li.textContent = text; return li; };
const parse = (json) => { try { return JSON.parse(json); } catch { return null; } };

let pipeline = null;
let pad = null;
let trendView = null;
let framesSeen = 0;
let recording = "off";
let dbPromise = null;
const seenFlags = new Set();

let sessionFrames = [];
let sessionStartedAt = null;
const versions = { coreVersion: "unknown", abiVersion: 0 };

const db = () => (dbPromise ??= openDatabase(window.indexedDB));

function onFrames(frames, count) {
  framesSeen += count ?? frames.length / FRAME_WORDS;
  const counter = el("frame-count");
  if (counter) counter.textContent = `${framesSeen} frames analysed`;
  if (!pad) return;

  const decoded = decodeFrames(frames);
  for (const frame of decoded) {
    pad.push(frame);
    if (sessionStartedAt === null) sessionStartedAt = Date.now();
    if (sessionFrames.length < MAX_SESSION_FRAMES) sessionFrames.push(frame);
    for (const label of activeFlags(frame.flags)) seenFlags.add(label);
  }

  const current = decoded[decoded.length - 1];
  if (current) {
    el("pad-confidence").textContent = isTrustworthy(current)
      ? ""
      : `${PAD_TEXT.lowConfidence.heading} ${PAD_TEXT.lowConfidence.body}`;
    renderSummary(current);
  }
  el("pad-flags").textContent = seenFlags.size ? [...seenFlags].join(", ") : "none";
}

function onVersions(data) {
  versions.coreVersion = data.coreVersion;
  versions.abiVersion = data.abiVersion;
}

function renderSummary(frame) {
  const summary = summarize(frame);
  el("summary-lines").replaceChildren(...summary.lines.map(listItem));
  el("summary-caveat").textContent = summary.caveat ?? "";
}

function renderRecording() {
  const failed = recording === "error";
  const on = recording === "recording";

  el("recording-status").textContent = on ? RECORDING_COPY.on : RECORDING_COPY.off;
  const toggle = el("record-toggle");
  toggle.textContent = on ? RECORDING_COPY.onAction : RECORDING_COPY.offAction;
  toggle.setAttribute("aria-pressed", on ? "true" : "false");

  const error = el("recording-error");
  error.hidden = !failed;
  error.textContent = failed ? `${RECORDING_COPY.error.heading} ${RECORDING_COPY.error.body}` : "";
  const cont = el("recording-continue");
  cont.hidden = !failed;
  cont.textContent = failed ? RECORDING_COPY.error.action : "";
}

function onRecording(state) {
  recording = state;
  renderRecording();
}

/** Persist the completed session if history is enabled (S5.1 + S5.3 wiring). */
async function persistSession() {
  if (!isEnabled("enable-local-history") || sessionFrames.length === 0) return false;
  const now = Date.now();
  const records = buildSessionRecords({
    sessionId: `s-${now}`,
    utteranceId: `u-${now}`,
    startedAt: sessionStartedAt ?? now,
    endedAt: now,
    deviceClass: "web",
    appVersion: APP_VERSION,
    coreVersion: versions.coreVersion,
    abiVersion: versions.abiVersion,
    kind: SESSION_KIND,
    frames: sessionFrames,
  });

  const database = await db();
  await putRows(database, "session", records.session);
  await putRows(database, "utterance", records.utterance);
  await putRows(database, "metric_series", records.metricSeries);
  await ensureMeasureVersion(
    database,
    records.measureVersion.core_version,
    records.measureVersion.introduced_at,
    records.measureVersion.notes,
  );

  sessionFrames = [];
  sessionStartedAt = null;
  return true;
}

async function loadHistory() {
  const database = await db();
  const [sessions, utterances, series] = await Promise.all([
    getAll(database, "session"),
    getAll(database, "utterance"),
    getAll(database, "metric_series"),
  ]);
  return { rows: toHistoryViewModel(sessions, utterances), sessions, utterances, series };
}

async function refreshHistory() {
  const list = el("history-list");
  try {
    const { rows } = await loadHistory();
    if (rows.length === 0) {
      list.replaceChildren(listItem(HISTORY_COPY.empty));
      return;
    }
    list.replaceChildren(
      ...rows.map((row) => listItem(`${formatDate(row.startedAt)} — ${historyRowSummary(row)}`)),
    );
  } catch {
    list.replaceChildren(
      listItem(`${HISTORY_COPY.loadError.heading} ${HISTORY_COPY.loadError.body}`),
    );
  }
}

async function compareLatest() {
  const caveat = el("compare-caveats");
  const view = el("compare-view");
  try {
    const { rows, utterances } = await loadHistory();
    if (rows.length < 2) {
      view.hidden = false;
      el("compare-heading").textContent = "";
      el("compare-labels").textContent = "";
      el("compare-lines").replaceChildren();
      el("compare-normative").textContent = "";
      caveat.textContent = "There is not enough history to compare yet.";
      return;
    }
    const summaries = new Map(utterances.map((u) => [u.session_id, parse(u.metrics_json)]));
    // Audio A/B is not implemented yet, so the comparison is measurements-only.
    const model = toComparisonViewModel(
      { summary: summaries.get(rows[1].id), hasAudio: false },
      { summary: summaries.get(rows[0].id), hasAudio: false },
    );
    el("compare-heading").textContent = model.heading;
    el("compare-labels").textContent = `Comparing ${model.labels.earlier} with ${model.labels.now}.`;
    el("compare-lines").replaceChildren(...model.lines.map(listItem));
    el("compare-normative").textContent = model.normativeNote;
    caveat.textContent = model.caveats.join(" ");
    view.hidden = false;
  } catch {
    caveat.textContent = HISTORY_COPY.loadError.body;
  }
}

/** Render the trend sparkline and its accessible text (S5.4). */
async function showTrend() {
  try {
    const { sessions, utterances, series } = await loadHistory();
    const points = trendPoints(sessions, utterances, series, "scale");
    const model = buildTrendSeries({ channel: "scale", points });
    const alt = trendTextAlternative(model);
    if (!trendView) trendView = new TrendView(el("trend-canvas"));
    trendView.setSeries(model);
    el("trend-text").textContent = alt.summary;
    el("trend-boundary").textContent = alt.boundaryNote ?? "";
    el("trend-stopped").textContent = alt.stoppedNote ?? "";

    const distributions = model.segments
      .map((segment) => {
        const d = segmentDistribution(segment.points);
        return d ? `${segment.coreVersion}: p50 ${d.p50.toFixed(1)} (n=${segment.points.length})` : null;
      })
      .filter(Boolean);
    el("trend-distribution").textContent = distributions.length
      ? `Distribution — ${distributions.join("; ")}.`
      : "";
  } catch {
    el("trend-text").textContent = HISTORY_COPY.loadError.body;
  }
}

/** Export the stored history as an archive (S6 wiring). */
let pendingPlainExport = false;
let importBytes = null;

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function currentBundle() {
  const { sessions, utterances, series } = await loadHistory();
  return { json: JSON.stringify(toBundle(sessions, utterances, series)), count: sessions.length };
}

async function exportHistory() {
  const encrypt = el("export-encrypt").checked;
  if (!encrypt && !pendingPlainExport) {
    pendingPlainExport = true;
    const warning = el("export-warning");
    warning.hidden = false;
    warning.textContent =
      "Anyone who finds this file can read it. A history file can sit in a downloads folder for years. Encrypting is safer.";
    el("export-run").textContent = "Export unencrypted anyway";
    return;
  }
  pendingPlainExport = false;
  el("export-warning").hidden = true;
  el("export-run").textContent = "Export history";

  const { json, count } = await currentBundle();
  if (count === 0) {
    el("export-status").textContent = "There is nothing to export yet.";
    return;
  }
  const bytes = await pipeline.exportArchive({
    bundleJson: json,
    coreVersion: versions.coreVersion,
    abiVersion: versions.abiVersion,
    createdAt: new Date().toISOString(),
    passphrase: encrypt ? el("export-passphrase").value || null : null,
  });
  download(new Blob([bytes], { type: "application/zip" }), `sonorant-history-${Date.now()}.zip`);
  el("export-status").textContent = "Export saved to your device.";
}

async function describeImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  importBytes = new Uint8Array(await file.arrayBuffer());
  try {
    el("import-describe").textContent = await pipeline.describeArchive(importBytes);
  } catch {
    importBytes = null;
    el("import-describe").textContent = "This file is not a Sonorant history archive.";
  }
}

async function runImport() {
  if (!importBytes) {
    el("import-report").textContent = "Choose a file first.";
    return;
  }
  try {
    const { json } = await currentBundle();
    const { bundle, report } = await pipeline.importArchive({
      bytes: importBytes,
      existingJson: json,
      passphrase: el("import-passphrase").value || null,
    });
    const merged = fromBundle(bundle);
    const database = await db();
    await putRows(database, "session", merged.sessions);
    await putRows(database, "utterance", merged.utterances);
    await putRows(database, "metric_series", merged.metric_series);
    el("import-report").textContent = report.line;
    await refreshHistory();
  } catch {
    el("import-report").textContent =
      "That passphrase did not open the file, or the file is damaged. Nothing was changed.";
  }
}

function applyCopy() {
  el("insecure-heading").textContent = COPY.insecure.heading;
  el("insecure-body").textContent = COPY.insecure.body;
  el("reload").textContent = COPY.insecure.action;

  el("permission-heading").textContent = COPY.permission.heading;
  el("permission-body").textContent = COPY.permission.body;
  el("allow").textContent = COPY.permission.action;

  el("status").textContent = COPY.waiting;

  el("denied-heading").textContent = COPY.denied.heading;
  el("denied-body").textContent = COPY.denied.body;
  el("retry").textContent = COPY.denied.action;
}

async function attempt() {
  hideAll();
  show("status");
  const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
  // Create the audio context inside the click gesture so it starts running.
  const context = AudioContextCtor ? new AudioContextCtor() : null;
  try {
    const stream = await openMicrophone(window);
    pipeline = await startCapture(stream, { onFrames, onRecording, onVersions, context });
    pad = new PadView(el("pad"));
    recording = "off";
    renderRecording();
    hideAll();
    show("practice");
    await refreshHistory();
  } catch {
    hideAll();
    show("denied");
  }
}

function start() {
  applyCopy();
  renderRecording();
  if (!isSecure(window)) {
    hideAll();
    show("insecure");
    return;
  }
  hideAll();
  show("permission");
}

el("allow").addEventListener("click", attempt);
el("retry").addEventListener("click", attempt);
el("reload").addEventListener("click", () => window.location.reload());
el("record-toggle").addEventListener("click", () =>
  pipeline?.setRecording(recording !== "recording"),
);
el("recording-continue").addEventListener("click", () => pipeline?.setRecording(false));
el("finish").addEventListener("click", async () => {
  const saved = await persistSession().catch(() => false);
  el("history-status").textContent = saved
    ? "Session saved to this device."
    : "Nothing to save (history may be off, or the session was empty).";
  await refreshHistory();
});
el("history-open").addEventListener("click", refreshHistory);
el("compare").addEventListener("click", () => {
  if (isEnabled("enable-history-ab")) compareLatest();
});
el("trend-open").addEventListener("click", () => {
  if (isEnabled("enable-longitudinal-trends")) showTrend();
});
el("export-run").addEventListener("click", () => {
  exportHistory().catch(() => {
    el("export-status").textContent = "Export failed.";
  });
});
el("import-file").addEventListener("change", (event) => {
  describeImportFile(event).catch(() => {});
});
el("import-run").addEventListener("click", () => {
  runImport().catch(() => {});
});
window.addEventListener("pagehide", () => {
  pipeline?.stop();
  persistSession().catch(() => {});
});

start();

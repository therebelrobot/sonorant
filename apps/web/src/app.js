// First-run flow, live pad, recording, summary, history and A/B (S4.1–S5.3).
// DOM wiring only; the logic lives in the imported modules.

import { COPY, isSecure, openMicrophone } from "./capture.js";
import { FRAME_WORDS, decodeFrames } from "./frames.js";
import { PAD_TEXT, PadView } from "./pad/pad-view.js";
import { activeFlags, isTrustworthy } from "./pad/pad-model.js";
import { summarize } from "./pad/summary.js";
import { RECORDING_COPY } from "./store/recorder.js";
import {
  HISTORY_COPY,
  buildSessionRecords,
  formatDate,
  historyRowSummary,
  toComparisonViewModel,
  toHistoryViewModel,
} from "./store/history.js";
import { ensureMeasureVersion, getAll, openDatabase, putRows } from "./store/indexed-db.js";
import { isEnabled } from "./flags.js";
import { APP_VERSION } from "./version.js";

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
  const [sessions, utterances] = await Promise.all([
    getAll(database, "session"),
    getAll(database, "utterance"),
  ]);
  return { rows: toHistoryViewModel(sessions, utterances), utterances };
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
    const { startCapture } = await import("./capture-shim.js");
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
window.addEventListener("pagehide", () => {
  pipeline?.stop();
  persistSession().catch(() => {});
});

start();

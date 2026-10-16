// First-run flow, live pad, recording and summary (S4.1–S4.4, S5.2). DOM wiring only.

import { COPY, isSecure, openMicrophone } from "./capture.js";
import { FRAME_WORDS, decodeFrames } from "./frames.js";
import { PAD_TEXT, PadView } from "./pad/pad-view.js";
import { activeFlags, isTrustworthy } from "./pad/pad-model.js";
import { summarize } from "./pad/summary.js";
import { RECORDING_COPY } from "./store/recorder.js";

const PANELS = ["insecure", "permission", "denied", "practice", "status", "checking"];

const el = (id) => document.getElementById(id);
const show = (id) => { const n = el(id); if (n) n.hidden = false; };
const hideAll = () => { for (const id of PANELS) { const n = el(id); if (n) n.hidden = true; } };

let pipeline = null;
let pad = null;
let framesSeen = 0;
let recording = "off";
const seenFlags = new Set();

function onFrames(frames, count) {
  framesSeen += count ?? frames.length / FRAME_WORDS;
  const counter = el("frame-count");
  if (counter) counter.textContent = `${framesSeen} frames analysed`;
  if (!pad) return;

  const decoded = decodeFrames(frames);
  for (const frame of decoded) {
    pad.push(frame);
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

/** Render the accessible text equivalent of the pad. */
function renderSummary(frame) {
  const summary = summarize(frame);
  const list = el("summary-lines");
  list.replaceChildren(
    ...summary.lines.map((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      return item;
    }),
  );
  el("summary-caveat").textContent = summary.caveat ?? "";
}

/** Reflect the recording state in text and `aria-pressed`, never colour alone. */
function renderRecording() {
  const failed = recording === "error";
  const on = recording === "recording";

  el("recording-status").textContent = on ? RECORDING_COPY.on : RECORDING_COPY.off;
  const toggle = el("record-toggle");
  toggle.textContent = on ? RECORDING_COPY.onAction : RECORDING_COPY.offAction;
  toggle.setAttribute("aria-pressed", on ? "true" : "false");

  const error = el("recording-error");
  error.hidden = !failed;
  error.textContent = failed
    ? `${RECORDING_COPY.error.heading} ${RECORDING_COPY.error.body}`
    : "";
  const cont = el("recording-continue");
  cont.hidden = !failed;
  cont.textContent = failed ? RECORDING_COPY.error.action : "";
}

function onRecording(state) {
  recording = state;
  renderRecording();
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
  try {
    const stream = await openMicrophone(window);
    const { startCapture } = await import("./capture-shim.js");
    pipeline = await startCapture(stream, { onFrames, onRecording });
    pad = new PadView(el("pad"));
    recording = "off";
    renderRecording();
    hideAll();
    show("practice");
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
window.addEventListener("pagehide", () => pipeline?.stop());

start();

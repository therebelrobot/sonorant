// First-run flow and live pad (S4.1, S4.2, S4.3). DOM wiring only; the logic lives
// in capture.js, capture-shim.js, frames.js and pad/.

import { COPY, isSecure, openMicrophone } from "./capture.js";
import { FRAME_WORDS, decodeFrames } from "./frames.js";
import { PAD_TEXT, PadView } from "./pad/pad-view.js";
import { activeFlags, isTrustworthy } from "./pad/pad-model.js";
import { summarize } from "./pad/summary.js";

const PANELS = ["insecure", "permission", "denied", "practice", "status", "checking"];

const el = (id) => document.getElementById(id);
const show = (id) => { const n = el(id); if (n) n.hidden = false; };
const hideAll = () => { for (const id of PANELS) { const n = el(id); if (n) n.hidden = true; } };

let pipeline = null;
let pad = null;
let framesSeen = 0;
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
    pipeline = await startCapture(stream, { onFrames });
    pad = new PadView(el("pad"));
    hideAll();
    show("practice");
  } catch {
    hideAll();
    show("denied");
  }
}

function start() {
  applyCopy();
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
window.addEventListener("pagehide", () => pipeline?.stop());

start();

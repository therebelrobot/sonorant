// First-run flow: secure-context check, microphone permission, then live capture
// (S4.1, S4.2). DOM wiring only; the logic lives in capture.js and capture-shim.js.

import { COPY, isSecure, openMicrophone } from "./capture.js";

const PANELS = ["insecure", "permission", "denied", "ready", "status", "checking"];
const FRAME_WORDS = 30;

const el = (id) => document.getElementById(id);
const show = (id) => { const n = el(id); if (n) n.hidden = false; };
const hideAll = () => { for (const id of PANELS) { const n = el(id); if (n) n.hidden = true; } };

let pipeline = null;
let framesSeen = 0;

function onFrames(frames, count) {
  framesSeen += count ?? frames.length / FRAME_WORDS;
  const node = el("frame-count");
  if (node) node.textContent = `${framesSeen} frames analysed`;
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

/** Request the microphone, then start capture→worklet→worker. */
async function attempt() {
  hideAll();
  show("status");
  try {
    const stream = await openMicrophone(window);
    const { startCapture } = await import("./capture-shim.js");
    pipeline = await startCapture(stream, { onFrames });
    hideAll();
    show("ready");
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

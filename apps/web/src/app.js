// First-run flow: secure-context check, then microphone permission (S4.1).
//
// DOM wiring only. The logic lives in capture.js; the copy comes from phase 6.

import { COPY, isSecure, openMicrophone } from "./capture.js";

const PANELS = ["insecure", "permission", "denied", "ready", "status", "checking"];

const el = (id) => document.getElementById(id);

function show(id) {
  const node = el(id);
  if (node) node.hidden = false;
}

function hideAll() {
  for (const id of PANELS) {
    const node = el(id);
    if (node) node.hidden = true;
  }
}

/** Fill the panels with the phase-6 copy, once. */
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

/** Request the microphone; the browser's own prompt is the only surface shown. */
async function attempt() {
  hideAll();
  show("status");
  try {
    const stream = await openMicrophone(window);
    // Handed to the AudioWorklet shim in S4.2.
    window.__sonorantStream = stream;
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

start();

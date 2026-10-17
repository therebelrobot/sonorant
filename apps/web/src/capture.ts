// Microphone capture setup (phase 6 S1.1, S1.2).
//
// The getUserMedia constraints are MANDATORY and applied by the app, never surfaced
// as a member choice (TDD §6.1). No acoustic maths here.

/**
 * The mandatory constraints (TDD §6.1). Browser defaults are `true` on every major
 * browser, and AGC in particular turns every level-derived measurement into fiction.
 */
export const MIC_CONSTRAINTS = {
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  },
};

/** The exact copy from phase 6 (S1.1, S1.2). */
export const COPY = {
  insecure: {
    heading: "This page needs a secure connection",
    body: "The microphone only works over HTTPS. Open the app over HTTPS, or use localhost for local development. Nothing is recorded until this is fixed.",
    action: "Reload",
  },
  permission: {
    heading: "This app needs your microphone",
    body: "Audio is analysed on your device. Nothing is sent anywhere. You can turn recording off at any time.",
    action: "Allow microphone",
  },
  waiting: "Waiting for your browser\u2026",
  denied: {
    heading: "The microphone is blocked",
    body: "Your browser is not sharing audio with this app. To continue, allow microphone access for this site in your browser settings, then reload. Nothing has been recorded.",
    action: "Try again",
  },
};

/** `getUserMedia` needs a secure context; `localhost` counts (TDD §10). */
export function isSecure(win = globalThis) {
  return win.isSecureContext === true;
}

/**
 * Request the microphone with the mandatory constraints. Resolves with the
 * `MediaStream`; rejects if the member denies or the browser blocks access.
 */
export function openMicrophone(win = globalThis) {
  return win.navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
}

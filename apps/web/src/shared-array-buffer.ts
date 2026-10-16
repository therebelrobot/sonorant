// SharedArrayBuffer is an optimisation ONLY; postMessage transferables are the
// default (TDD §6.1). SAB also requires COOP/COEP headers, which a self-hosting
// clinician should not need at this data rate.

/** True when the scope exposes `SharedArrayBuffer`. */
export function sharedArrayBufferSupported(scope = globalThis) {
  return typeof scope.SharedArrayBuffer === "function";
}

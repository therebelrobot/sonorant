// Minimal runtime feature flags (phase 7 §5).
//
// Every flag defaults to OFF. Turning one on is a human decision — never
// automated (AGENTS.md, "Delivery framework"). The registry grows with the
// stories that name a flag.

const DEFAULTS = {
  "enable-local-history": false,
};

/** True when `key` is enabled. Overridable via `scope.__SONORANT_FLAGS__[key]`. */
export function isEnabled(key, scope = globalThis) {
  const override = scope?.__SONORANT_FLAGS__?.[key];
  return override ?? DEFAULTS[key] ?? false;
}

export const FLAG_KEYS = Object.keys(DEFAULTS);

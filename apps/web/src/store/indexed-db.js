// IndexedDB adapter for the local store (TDD §7).
//
// Browser-only. The row shapes are built in schema.js and unit-tested there; this
// file only opens the database and writes rows.

import { STORES } from "./schema.js";

export const DB_NAME = "sonorant";
export const DB_VERSION = 1;

const KEY_PATHS = {
  session: "id",
  utterance: "id",
  calibration: "id",
  measure_version: "core_version",
  metric_series: ["utterance_id", "channel", "t_ms"],
};

const INDEXES = {
  utterance: [["session_id", "session_id"]],
  metric_series: [
    ["utterance_channel_t", ["utterance_id", "channel", "t_ms"]],
    ["utterance_id", "utterance_id"],
  ],
};

/** Open (and upgrade) the database. `indexedDB` is injected for testability. */
export function openDatabase(indexedDB, name = DB_NAME, version = DB_VERSION) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (db.objectStoreNames.contains(store)) continue;
        const objectStore = db.createObjectStore(store, { keyPath: KEY_PATHS[store] });
        for (const [indexName, keyPath] of INDEXES[store] ?? []) {
          objectStore.createIndex(indexName, keyPath);
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Put one or many rows into a store within a single transaction. */
export function putRows(db, store, rows) {
  const list = Array.isArray(rows) ? rows : [rows];
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, "readwrite");
    const objectStore = transaction.objectStore(store);
    for (const row of list) objectStore.put(row);
    transaction.oncomplete = () => resolve(list.length);
    transaction.onerror = () => reject(transaction.error);
  });
}

export function getAll(db, store) {
  return requestToPromise(db.transaction(store, "readonly").objectStore(store).getAll());
}

/** Ensure a `measure_version` row exists for the core version that produced data. */
export async function ensureMeasureVersion(db, coreVersion, introducedAt, notes = null) {
  const existing = await requestToPromise(
    db.transaction("measure_version", "readonly").objectStore("measure_version").get(coreVersion),
  );
  if (existing) return existing;
  const row = { core_version: coreVersion, introduced_at: introducedAt, notes };
  await putRows(db, "measure_version", row);
  return row;
}

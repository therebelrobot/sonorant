// Map the local store rows to and from the archive `Bundle` (a list of records
// keyed by `id`). Pure.

/** metric_series has a composite key, so an id is synthesised for the archive. */
export function metricSeriesId(row) {
  return `${row.utterance_id}:${row.channel}:${row.t_ms}`;
}

export function toBundle(sessions, utterances, metricSeries) {
  return {
    sessions: sessions.map((row) => ({ id: row.id, data: row })),
    utterances: utterances.map((row) => ({ id: row.id, data: row })),
    metric_series: metricSeries.map((row) => ({ id: metricSeriesId(row), data: row })),
  };
}

export function fromBundle(bundle) {
  return {
    sessions: (bundle.sessions ?? []).map((record) => record.data),
    utterances: (bundle.utterances ?? []).map((record) => record.data),
    metric_series: (bundle.metric_series ?? []).map((record) => record.data),
  };
}

export const EMPTY_BUNDLE_JSON = JSON.stringify({
  sessions: [],
  utterances: [],
  metric_series: [],
});

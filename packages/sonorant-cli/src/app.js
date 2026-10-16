// The Ink view (phase 6 S5.1). Presentation only.

import React, { createElement as h } from "react";
import { Box, Text } from "ink";

/** Renders the status word and the summary lines. */
export function ResultView({ status, lines }) {
  return h(
    Box,
    { flexDirection: "column" },
    h(Text, { bold: true }, `Status: ${status}`),
    ...lines.map((line, index) => h(Text, { key: String(index) }, line)),
  );
}

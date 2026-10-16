// The Ink view (phase 6 S5.1). Presentation only.

import { Fragment } from "react";
import { Box, Text } from "ink";

/** Renders the status word and the summary lines. */
export function ResultView({ status, lines }: { status: string; lines: string[] }) {
  return (
    <Box flexDirection="column">
      <Text bold>{`Status: ${status}`}</Text>
      {lines.map((line, index) => (
        <Fragment key={String(index)}>
          <Text>{line}</Text>
        </Fragment>
      ))}
    </Box>
  );
}

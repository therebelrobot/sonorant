// CLI errors and exit codes (phase 6 S5.3). Every message states cause and next
// step; no blame, no urgency.

export const EXIT = { OK: 0, INPUT: 1, USAGE: 2 };

export class CliError extends Error {
  constructor(message, exitCode = EXIT.INPUT) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export class UsageError extends CliError {
  constructor(message) {
    super(message, EXIT.USAGE);
  }
}

export const UNSUPPORTED = "sonorant-cli: this file format is not supported.";

export function inputError(input) {
  return `sonorant-cli: could not read input file: ${input}`;
}

/** Map a low-level failure onto the user-facing message (phase 6 S5.3). */
export function mapError(error) {
  const message = String(error?.message ?? error);
  if (/wasm hash mismatch/i.test(message)) {
    return "sonorant-cli: the analysis core file did not match its expected checksum. Reinstall the tool.";
  }
  if (/ABI_VERSION mismatch/i.test(message)) {
    return "sonorant-cli: the analysis core and this tool do not match. Update both to the same version.";
  }
  return `sonorant-cli: ${message}`;
}

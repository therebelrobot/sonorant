// Tests for the release-version tool. The last one is the CI gate: it reads the
// actual repository, so a hand-edited version in any place fails here rather than
// at publish time.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CARGO_LOCK_CRATES,
  COPIES,
  NPM_RANGES,
  NPM_WORKSPACES,
  bump,
  lockVersions,
  planBump,
  readAll,
  sectionVersion,
} from "./version.mjs";

test("bump moves the right position", () => {
  assert.equal(bump("0.4.0", "patch"), "0.4.1");
  assert.equal(bump("0.4.0", "minor"), "0.5.0");
  assert.equal(bump("0.4.0", "major"), "1.0.0");
  assert.throws(() => bump("0.4.0", "nope"), /unknown bump/);
});

test("planBump reads conventional commits", () => {
  assert.equal(planBump(["feat(core): measure jitter"]), "minor");
  assert.equal(planBump(["fix(web): an off-by-one"]), "patch");
  assert.equal(planBump(["docs: a note", "build: bump a dep"]), "patch");
  assert.equal(planBump(["feat!: drop the old container", "fix: y"]), "major");
  assert.equal(planBump(["fix: y\n\nBREAKING CHANGE: z"]), "major");
});

test("release commits are not work, so they cannot trigger their own release", () => {
  assert.equal(planBump(["chore(release): v0.4.1"]), null);
  assert.equal(planBump(["chore(release): v0.4.1", "chore(release): v0.4.2"]), null);
  assert.equal(planBump([]), null);
  assert.equal(planBump(["", "  "]), null);
});

test("sectionVersion rewrites the version key and nothing that merely ends in one", () => {
  const toml = [
    '[package]',
    'name = "x"',
    'rust-version = "1.88"',
    'version = "0.1.0"',
    '',
    '[workspace.dependencies]',
    'core = { path = "c", version = "0.1.0" }',
    '',
  ].join("\n");

  assert.equal(sectionVersion(toml, "package"), "0.1.0");
  assert.equal(sectionVersion(toml, "workspace.dependencies"), "0.1.0");
  assert.equal(sectionVersion(toml, "nope"), null);

  const bumped = sectionVersion(toml, "package", "1.0.0");
  assert.match(bumped, /^version = "1\.0\.0"$/m);
  assert.match(bumped, /rust-version = "1\.88"/, "rust-version must be left alone");

  const deps = sectionVersion(toml, "workspace.dependencies", "2.0.0");
  assert.match(deps, /core = \{ path = "c", version = "2\.0\.0" \}/);
  assert.match(deps, /^version = "0\.1\.0"$/m, "the other section must be untouched");
});

test("lockVersions reads every package's own version, member or not", () => {
  const lock = [
    'version = 4',
    '',
    '[[package]]',
    'name = "sonorant-core"',
    'version = "0.6.0"',
    'dependencies = [',
    ' "realfft",',
    ']',
    '',
    '[[package]]',
    'name = "realfft"',
    'version = "3.4.0"',
    'source = "registry+https://github.com/rust-lang/crates.io-index"',
    '',
  ].join("\n");

  const versions = lockVersions(lock);
  assert.equal(versions.get("sonorant-core"), "0.6.0");
  assert.equal(versions.get("realfft"), "3.4.0");
  assert.equal(versions.get("nope"), undefined);
});

test("the repository carries one version in every place", () => {
  const { version, rows, drift } = readAll();

  assert.match(version, /^\d+\.\d+\.\d+$/, "the Cargo workspace version must be readable");
  assert.equal(
    rows.length,
    COPIES.length + NPM_WORKSPACES.length + NPM_RANGES.length +
      CARGO_LOCK_CRATES.length + 2, // the reference fixture's two version fields
    "every copy is read, so none can hide from the check",
  );
  assert.deepEqual(
    drift.map((row) => `${row.path}: ${row.version}`),
    [],
    "version drift — fix with: node scripts/version.mjs set <version>",
  );
});

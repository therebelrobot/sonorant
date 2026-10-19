#!/usr/bin/env node
// The release version, in one place.
//
// The **Cargo workspace version is the release version**. That is not an
// arbitrary choice: `CORE_VERSION` reads it (`env!("CARGO_PKG_VERSION")`), and
// `CORE_VERSION` is stamped on every user's stored measurements. It is a
// measurement claim (TDD §9), and it is the number a release is *about*.
//
// Everything else is a copy of it, and copies drift:
//
//   Cargo.toml                          [workspace.package] version   <- source
//   Cargo.toml                          [workspace.dependencies] pins
//   packages/sonorant/package.json      version
//   packages/sonorant-cli/package.json  version + its `sonorant` range
//   apps/web/package.json               version + its `sonorant` range
//   packages/sonorant-cli/src/main.tsx  VERSION  (what `--version` prints)
//   apps/web/src/version.ts             APP_VERSION
//
//   node scripts/version.mjs get                    print the version
//   node scripts/version.mjs check                  fail if any copy disagrees
//   node scripts/version.mjs set 0.5.0              write every copy
//   node scripts/version.mjs bump patch|minor|major
//   node scripts/version.mjs plan [<since-ref>]     next version from the commits, or nothing
//   node scripts/version.mjs release <kind> [--push]
//
// package.json is edited with `npm pkg set`, never by hand and never with
// `npm version`: `npm version` tries to resolve the whole tree, so a dependent
// that pins `sonorant@^x.y.z` sends it to the registry and it fails with ETARGET.
// `npm pkg set` writes the one field, which is what a release actually needs.
// See docs/rules/npm-dependencies.md.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The files that carry the version outside npm's manifests. */
export const COPIES = [
  {
    path: "Cargo.toml",
    note: "source of truth ([workspace.package])",
    section: "workspace.package",
  },
  {
    path: "Cargo.toml",
    note: "inter-crate path dependency pins ([workspace.dependencies])",
    section: "workspace.dependencies",
  },
  {
    path: "packages/sonorant-cli/src/main.tsx",
    note: "what `sonorant-cli --version` prints",
    pattern: "VERSION",
  },
  {
    path: "apps/web/src/version.ts",
    note: "the app's own version",
    pattern: "APP_VERSION",
  },
];

/** Workspaces whose own `version` mirrors the release. */
export const NPM_WORKSPACES = [
  { workspace: "sonorant", manifest: "packages/sonorant/package.json" },
  { workspace: "sonorant-cli", manifest: "packages/sonorant-cli/package.json" },
  { workspace: "sonorant-react", manifest: "packages/sonorant-react/package.json" },
  { workspace: "@sonorant/web", manifest: "apps/web/package.json" },
  { workspace: "@sonorant/docs", manifest: "apps/docs/package.json" },
];

/** Workspace dependencies that pin the release version, and so must move with it. */
export const NPM_RANGES = [
  { workspace: "sonorant-cli", dependency: "sonorant" },
  { workspace: "@sonorant/web", dependency: "sonorant" },
  { workspace: "@sonorant/docs", dependency: "sonorant" },
  { workspace: "@sonorant/docs", dependency: "sonorant-react" },
];

// ---- reading -----------------------------------------------------------------

function readText(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function manifest(path) {
  return JSON.parse(readText(path));
}

/**
 * Read, or replace, every `version = "x.y.z"` in a Cargo.toml section.
 *
 * The version is not always on its own line: an inter-crate pin reads
 * `sonorant-core = { path = "...", version = "0.4.0" }`. It is always preceded by
 * the start of a line, whitespace, `{` or `,`, which is also what keeps a
 * `rust-version = "..."` field from being mistaken for it.
 */
export function sectionVersion(text, section, replacement) {
  const header = `[${section}]`;
  const start = text.indexOf(header);
  if (start < 0) return null;
  const next = text.indexOf("\n[", start + header.length);
  const end = next < 0 ? text.length : next;
  const body = text.slice(start, end);

  if (replacement === undefined) {
    return /(?:^|[\s{,])\s*version\s*=\s*"([^"]+)"/m.exec(body)?.[1] ?? null;
  }
  const updated = body.replace(/(^|[\s{,])(\s*version\s*=\s*)"[^"]+"/g, `$1$2"${replacement}"`);
  return text.slice(0, start) + updated + text.slice(end);
}

function constantValue(text, name) {
  return new RegExp(`export const ${name} = "([^"]+)"`).exec(text)?.[1] ?? null;
}

/** The version, from its single source of truth. */
export function readVersion() {
  return sectionVersion(readText("Cargo.toml"), "workspace.package");
}

/** Every copy of the version, with the ones that disagree flagged. */
export function readAll() {
  const version = readVersion();
  const rows = [];

  for (const copy of COPIES) {
    const text = readText(copy.path);
    rows.push({
      path: copy.path,
      note: copy.note,
      version: copy.section ? sectionVersion(text, copy.section) : constantValue(text, copy.pattern),
    });
  }
  for (const entry of NPM_WORKSPACES) {
    rows.push({
      path: entry.manifest,
      note: `${entry.workspace} package version`,
      version: manifest(entry.manifest).version ?? null,
    });
  }
  for (const entry of NPM_RANGES) {
    const owner = NPM_WORKSPACES.find((w) => w.workspace === entry.workspace);
    rows.push({
      path: owner.manifest,
      note: `${entry.workspace} depends on ${entry.dependency}`,
      version: manifest(owner.manifest).dependencies?.[entry.dependency] ?? null,
      expected: `^${version}`,
    });
  }

  const drift = rows.filter((row) => row.version !== (row.expected ?? version));
  return { version, rows, drift };
}

// ---- writing -----------------------------------------------------------------

export function bump(version, kind) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`unknown bump: ${kind}`);
}

/**
 * Write every copy. `run` is injectable so the write path can be tested without
 * touching npm.
 */
export function setVersion(version, { run = execFileSync } = {}) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`not a release version: ${version}`);
  }

  const changed = [];
  for (const copy of COPIES) {
    const before = readText(copy.path);
    const after = copy.section
      ? sectionVersion(before, copy.section, version)
      : before.replace(
          new RegExp(`(export const ${copy.pattern} = )"[^"]+"`),
          `$1"${version}"`,
        );
    if (!after || after === before) continue;
    writeFileSync(join(ROOT, copy.path), after);
    changed.push(copy.path);
  }

  // npm stays the writer of package.json; see the header for why not `npm version`.
  const npmSet = (key, value, workspace) =>
    run("npm", ["pkg", "set", `${key}=${value}`, "--workspace", workspace], {
      cwd: ROOT,
      stdio: "pipe",
    });
  for (const entry of NPM_WORKSPACES) {
    npmSet("version", version, entry.workspace);
    changed.push(entry.manifest);
  }
  for (const entry of NPM_RANGES) {
    npmSet(`dependencies.${entry.dependency}`, `^${version}`, entry.workspace);
    changed.push(`${entry.workspace} -> ${entry.dependency}`);
  }

  // The lockfile records those ranges too.
  run("npm", ["install", "--package-lock-only", "--ignore-scripts"], {
    cwd: ROOT,
    stdio: "pipe",
  });

  return changed;
}

export const RELEASE_SUBJECT = /^chore\(release\):/;

/**
 * The next version for a set of commit subjects, or `null` when there is nothing
 * to release. Release commits are not work.
 *
 * A breaking change is `major`, a `feat` is `minor`, anything else that is work is
 * `patch`. Because `CORE_VERSION` is a *measurement* claim (TDD §9), this is a
 * first draft for the release, not a decision — the person running `release`
 * can change it.
 */
export function planBump(subjects) {
  const work = subjects.filter((s) => s.trim() && !RELEASE_SUBJECT.test(s));
  if (work.length === 0) return null;
  if (work.some((s) => /^[a-z]+(\([^)]*\))?!:/.test(s) || /BREAKING CHANGE/.test(s))) return "major";
  if (work.some((s) => /^feat(\([^)]*\))?:/.test(s))) return "minor";
  return "patch";
}

// ---- command line ------------------------------------------------------------

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function lastTag() {
  try {
    return git(["describe", "--tags", "--abbrev=0", "--match", "v*"]);
  } catch {
    return null;
  }
}

function commitSubjects(since) {
  const out = git(["log", "--format=%s", since ? `${since}..HEAD` : "HEAD"]);
  return out ? out.split("\n") : [];
}

function main(argv) {
  const [command, argument] = argv;

  if (command === "get") {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }

  if (command === "check") {
    const { version, rows, drift } = readAll();
    if (drift.length === 0) {
      process.stdout.write(`version ${version} agrees in all ${rows.length} places\n`);
      return 0;
    }
    process.stderr.write(`version drift: Cargo.toml says ${version}\n`);
    for (const row of drift) {
      process.stderr.write(
        `  ${row.path}: ${row.version} — ${row.note} (want ${row.expected ?? version})\n`,
      );
    }
    process.stderr.write("fix: node scripts/version.mjs set <version>\n");
    return 1;
  }

  if (command === "set") {
    if (!argument) throw new Error("set needs a version");
    process.stdout.write(`${setVersion(argument).join("\n")}\n`);
    return 0;
  }

  if (command === "bump") {
    const next = bump(readVersion(), argument);
    setVersion(next);
    process.stdout.write(`${next}\n`);
    return 0;
  }

  if (command === "plan") {
    const kind = planBump(commitSubjects(argument ?? lastTag()));
    if (!kind) return 0;
    process.stdout.write(`${bump(readVersion(), kind)}\n`);
    return 0;
  }

  if (command === "release") {
    const next = bump(readVersion(), argument);
    setVersion(next);
    git(["commit", "-am", `chore(release): v${next}`]);
    git(["tag", `v${next}`]);
    if (argv.includes("--push")) git(["push", "--follow-tags"]);
    else process.stderr.write(`tagged v${next}; push it with: git push --follow-tags\n`);
    process.stdout.write(`${next}\n`);
    return 0;
  }

  process.stderr.write(
    "usage: version.mjs get | check | set <v> | bump <patch|minor|major> | plan [<since-ref>] | release <kind> [--push]\n",
  );
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`version.mjs: ${error.message}\n`);
    process.exitCode = 1;
  }
}

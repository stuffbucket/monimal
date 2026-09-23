import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const BASELINE_PATH = path.join(ROOT, "network-literals-baseline.json");
const GENERATED_PATHS = new Set([path.relative(ROOT, BASELINE_PATH)]);
const SCANNABLE_EXTENSIONS = new Set([
  ".cjs", ".css", ".html", ".js", ".json", ".jsonc", ".jsx", ".mjs",
  ".mts", ".toml", ".ts", ".tsx", ".yaml", ".yml",
]);
const HOST = String.raw`(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-fA-F:]+\])`;
const URL_PATTERN = new RegExp(String.raw`https?:\/\/${HOST}(?::\d{1,5})?`, "g");
const AUTHORITY_PATTERN = new RegExp(String.raw`(?<![\w./-])${HOST}:\d{1,5}`, "g");
const QUOTED_HOST_PATTERN = new RegExp(String.raw`(?<=["'])${HOST}(?=["'])`, "g");

function trackedFiles(root = ROOT) {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  );
  return output.split("\0").filter(Boolean).sort();
}

function validLiteral(literal) {
  const authority = literal.replace(/^https?:\/\//, "");
  const host = authority.startsWith("[")
    ? authority.slice(0, authority.indexOf("]") + 1)
    : authority.split(":", 1)[0];
  const unwrappedHost = host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;
  return unwrappedHost === "localhost" || isIP(unwrappedHost) !== 0;
}

export function networkLiterals(source) {
  const matches = new Set();
  for (const pattern of [URL_PATTERN, AUTHORITY_PATTERN, QUOTED_HOST_PATTERN]) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      if (validLiteral(match[0])) matches.add(match[0]);
    }
  }
  return [...matches].sort();
}

export function isScannablePath(relativePath) {
  return !GENERATED_PATHS.has(relativePath)
    && SCANNABLE_EXTENSIONS.has(path.extname(relativePath));
}

export function scanNetworkLiterals(root = ROOT) {
  const findings = [];
  for (const relativePath of trackedFiles(root)) {
    if (!isScannablePath(relativePath)) continue;
    const filePath = path.join(root, relativePath);
    if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) continue;
    const source = fs.readFileSync(filePath, "utf8");
    for (const literal of networkLiterals(source)) {
      const count = source.split(literal).length - 1;
      findings.push({ path: relativePath, literal, count });
    }
  }
  return findings;
}

function identity(finding) {
  return `${finding.path}\0${finding.literal}\0${String(finding.count)}`;
}

function literalIdentity(finding) {
  return `${finding.path}\0${finding.literal}`;
}

export function ratchetChanges(current, recorded) {
  const currentIds = new Set(current.map(identity));
  const recordedIds = new Set(recorded.map(identity));
  return {
    added: current.filter((finding) => !recordedIds.has(identity(finding))),
    gone: recorded.filter((finding) => !currentIds.has(identity(finding))),
  };
}

export function ratchetIncreases(current, recorded) {
  const recordedCounts = new Map(
    recorded.map((finding) => [literalIdentity(finding), finding.count]),
  );
  return current.filter((finding) =>
    finding.count > (recordedCounts.get(literalIdentity(finding)) ?? 0));
}

function readBaseline(filePath = BASELINE_PATH) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeBaseline(findings, filePath = BASELINE_PATH) {
  fs.writeFileSync(filePath, `${JSON.stringify(findings, null, 2)}\n`);
}

function format(finding) {
  return `${finding.path}: ${finding.literal} (${String(finding.count)} occurrence${finding.count === 1 ? "" : "s"})`;
}

export function main(arguments_ = process.argv.slice(2)) {
  const list = arguments_.includes("--list");
  const initialize = arguments_.includes("--initialize");
  const update = arguments_.includes("--update");
  if (
    arguments_.some((argument) => !["--initialize", "--list", "--update"].includes(argument))
    || Number(list) + Number(initialize) + Number(update) > 1
  ) {
    throw new Error("Usage: check-network-literals.mjs [--list|--initialize|--update]");
  }
  const current = scanNetworkLiterals();
  if (list) {
    process.stdout.write(`${JSON.stringify(current, null, 2)}\n`);
    return;
  }
  const recorded = readBaseline();
  const { added, gone } = ratchetChanges(current, recorded);
  if (initialize) {
    if (recorded.length > 0) throw new Error("The network literal baseline is already initialized.");
    writeBaseline(current);
    console.log(`\u2714 initialized ${String(current.length)} network literal identities.`);
    return;
  }
  if (update) {
    if (ratchetIncreases(current, recorded).length > 0) {
      throw new Error("The down-only network literal ratchet refuses new or increased identities.");
    }
    writeBaseline(current);
    console.log(`\u2714 lowered the ratchet by ${String(gone.length)} network literal identities.`);
    return;
  }
  if (added.length === 0 && gone.length === 0) {
    console.log(`\u2714 ${String(current.length)} network literal identities match the ratchet.`);
    return;
  }
  if (added.length > 0) {
    console.error(`\u2716 ${String(added.length)} new or increased network literal identities:`);
    for (const finding of added) console.error(`  + ${format(finding)}`);
  }
  if (gone.length > 0) {
    console.error(`\u2716 ${String(gone.length)} stale network literal identities; lower the ratchet:`);
    for (const finding of gone) console.error(`  - ${format(finding)}`);
  }
  process.exitCode = 1;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) main();
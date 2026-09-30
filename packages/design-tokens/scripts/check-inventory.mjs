import fs from 'node:fs';

import { buildInventory } from './build-inventory.mjs';
import {
  BASELINE_PATH,
  readBaseline,
  ratchetChanges,
} from './inventory.mjs';

function writeBaseline(issues) {
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(issues.map(({ id }) => id).sort(), null, 2)}\n`,
  );
}

function printIssue(prefix, issue) {
  if (typeof issue === 'string') {
    console.error(`  ${prefix} ${issue}`);
    return;
  }
  console.error(`  ${prefix} [${issue.kind}] ${issue.detail}`);
}

export async function main(args = process.argv.slice(2)) {
  const initialize = args.includes('--initialize');
  const list = args.includes('--list');
  const update = args.includes('--update');
  if (
    args.some((arg) => !['--initialize', '--list', '--update'].includes(arg))
    || Number(initialize) + Number(list) + Number(update) > 1
  ) {
    throw new Error('Usage: check-inventory.mjs [--initialize|--list|--update]');
  }

  const { issues } = await buildInventory();
  if (list) {
    process.stdout.write(`${JSON.stringify(issues, null, 2)}\n`);
    return;
  }

  const recorded = readBaseline();
  const { added, gone } = ratchetChanges(issues, recorded);
  if (initialize) {
    if (recorded.length > 0) throw new Error('The token issue baseline is already initialized.');
    writeBaseline(issues);
    console.log(`Initialized the token warning ratchet with ${String(issues.length)} issue(s).`);
    return;
  }
  if (update) {
    if (added.length > 0) {
      throw new Error('The down-only token ratchet refuses to record new issues.');
    }
    writeBaseline(issues);
    console.log(`Lowered the token warning ratchet by ${String(gone.length)} issue(s).`);
    return;
  }

  if (added.length > 0) {
    console.error(`New token inventory issues (${String(added.length)}):`);
    for (const issue of added) printIssue('+', issue);
  }
  if (gone.length > 0) {
    console.error(`Resolved token issues still recorded (${String(gone.length)}); run token:check -- --update:`);
    for (const issue of gone) printIssue('-', issue);
  }
  if (added.length > 0 || gone.length > 0) {
    process.exitCode = 1;
    return;
  }

  const byKind = new Map();
  for (const issue of issues) byKind.set(issue.kind, (byKind.get(issue.kind) ?? 0) + 1);
  console.warn(`Token inventory warning ratchet: ${String(issues.length)} known issue(s).`);
  for (const [kind, count] of [...byKind].sort()) {
    console.warn(`  WARN ${kind}: ${String(count)}`);
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) await main();

import fs from 'node:fs';
import path from 'node:path';

import StyleDictionary from 'style-dictionary';

import {
  INVENTORY_PATH,
  PACKAGE_ROOT,
  dtcgInventory,
  iconMetricIssues,
  inventoryIssues,
  readIconMetrics,
  scanTokenSources,
} from './inventory.mjs';

const FORMAT = 'maximal/token-inventory';

StyleDictionary.registerFormat({
  name: FORMAT,
  format: ({ dictionary }) =>
    `${JSON.stringify(
      {
        generatedBy: 'style-dictionary',
        tokenCount: dictionary.allTokens.length,
        tokens: dictionary.allTokens.map((token) => ({
          name: token.name,
          path: token.path,
          type: token.type,
          value: token.value,
          original: token.original,
        })),
      },
      null,
      2,
    )}\n`,
});

export async function buildInventory() {
  const scan = scanTokenSources();
  const iconMetrics = readIconMetrics();
  const dictionary = new StyleDictionary({
    usesDtcg: true,
    tokens: {
      standards: iconMetrics,
      ...dtcgInventory(scan.tokens, iconMetrics),
    },
    platforms: {
      inventory: {
        buildPath: `${path.join(PACKAGE_ROOT, 'dist')}${path.sep}`,
        files: [{ destination: 'inventory.json', format: FORMAT }],
      },
    },
  });

  await dictionary.buildAllPlatforms();
  const inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  const issues = [
    ...inventoryIssues(scan, iconMetrics),
    ...iconMetricIssues(undefined, iconMetrics),
  ];
  const summary = Object.fromEntries(
    [...new Set(issues.map(({ kind }) => kind))]
      .sort()
      .map((kind) => [kind, issues.filter((issue) => issue.kind === kind).length]),
  );
  fs.writeFileSync(
    path.join(PACKAGE_ROOT, 'dist', 'issues.json'),
    `${JSON.stringify({ issueCount: issues.length, summary, issues }, null, 2)}\n`,
  );
  console.log(
    `Style Dictionary inventoried ${String(inventory.tokenCount)} tokens with ${String(issues.length)} migration issue(s).`,
  );
  return { inventory, issues };
}

if (process.argv[1] === new URL(import.meta.url).pathname) await buildInventory();

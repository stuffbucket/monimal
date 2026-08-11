import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  PEER_TABLE_EXCEPTIONS,
  failedPeerTableChecks,
  peerTable,
  peerTableChecks,
} from '../scripts/peer-table.mjs';

/**
 * The check behind the sentence in `README.md`.
 *
 * That sentence said the peer table could not drift from what the code imports
 * without failing a check, and no check read the table. `npm run verify:exports`
 * runs these functions over the built import graph; this runs them over
 * fixtures, so a parser that stops recognising a row fails here rather than by
 * reporting a clean table over no rows. Issue #121.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAME = '@stuffbucket/maximal-electron';

const table = (...rows: string[]): string =>
  ['| Entry | Peers |', '| --- | --- |', ...rows].join('\n');

const checks = (input: {
  table: Map<string, string[]>;
  reached: Map<string, string[]>;
  peers?: string[];
  exceptions?: { subpath: string; name: string }[];
}): string[] =>
  failedPeerTableChecks(
    peerTableChecks({
      table: input.table,
      reached: input.reached,
      peers: input.peers ?? ['electron'],
      exceptions: input.exceptions ?? [],
    }),
  );

describe('reading the peer table out of README.md', () => {
  it('reads a row per entry point, as a subpath', () => {
    const readme = table(`| \`${NAME}/main\` | \`electron\` |`, `| \`${NAME}\` | \`electron\` |`);

    expect([...peerTable(readme, NAME)]).toEqual([
      ['./main', ['electron']],
      ['.', ['electron']],
    ]);
  });

  it('reads several peers out of one cell, in name order', () => {
    const readme = table(`| \`${NAME}/renderer\` | \`react\`, \`ghostty-web\`, \`react-dom\` |`);

    expect(peerTable(readme, NAME).get('./renderer')).toEqual([
      'ghostty-web',
      'react',
      'react-dom',
    ]);
  });

  it('says which side of a failed row held what', () => {
    const [row] = peerTableChecks({
      table: new Map([['./main', []]]),
      reached: new Map([['./main', ['electron']]]),
      peers: ['electron'],
      exceptions: [],
    }).filter((check) => check.name.startsWith('the ./main row'));

    expect(row?.detail).toContain('table: none');
    expect(row?.detail).toContain('code:  electron');
  });

  it('separates the names on each side, so two read as two', () => {
    // One name per side reads the same however the list is joined, and a
    // detail line that runs `electronnode-pty` together is what a reader is
    // sent to when the row fails.
    const [row] = peerTableChecks({
      table: new Map([['./main', ['electron', 'ghostty-web']]]),
      reached: new Map([['./main', ['electron', 'node-pty']]]),
      peers: ['electron', 'ghostty-web', 'node-pty'],
      exceptions: [],
    }).filter((check) => check.name.startsWith('the ./main row'));

    expect(row?.detail).toContain('table: electron, ghostty-web');
    expect(row?.detail).toContain('code:  electron, node-pty');
  });

  it('carries no detail on a check that names its own subject', () => {
    const [floor] = peerTableChecks({
      table: new Map(),
      reached: new Map(),
      peers: [],
      exceptions: [],
    });

    expect(floor).toEqual({ name: 'the peer table has at least one row', ok: false, detail: '' });
  });

  it('reads an empty list out of a row that names no peer', () => {
    const readme = table(
      `| \`${NAME}/verify\` | none |`,
      // A package name without the backticks is not a peer either. The row for
      // an entry point that imports one then fails the comparison.
      `| \`${NAME}/host\` | electron |`,
    );

    expect(peerTable(readme, NAME).get('./verify')).toEqual([]);
    expect(peerTable(readme, NAME).get('./host')).toEqual([]);
  });

  it('reads no row out of the other tables in the file', () => {
    const readme = [
      table(`| \`${NAME}/main\` | \`electron\` |`),
      '',
      '| Variable | Contract |',
      '| --- | --- |',
      '| `--shell-background` | Window chrome. |',
      '',
      '| File | Used for |',
      '| --- | --- |',
      '| `icon.icns` | The macOS bundle icon. |',
    ].join('\n');

    expect([...peerTable(readme, NAME).keys()]).toEqual(['./main']);
  });

  it('reads no row out of a table that carries a third cell', () => {
    // The peer table is two cells. A third one is a different table, and the
    // floor on the row count is what reports a peer table that grew a column
    // rather than a peer table that lost its rows.
    const readme = table(`| \`${NAME}/main\` | \`electron\` | since v0.0.1 |`);

    expect(peerTable(readme, NAME).size).toBe(0);
  });

  it('reads no row out of a line that starts with prose', () => {
    // A row begins the line. Without that, a sentence writing a pipe before a
    // backticked name reads as a row of a table nobody wrote.
    const readme = table(`Install | \`${NAME}/main\` | \`electron\` |`);

    expect(peerTable(readme, NAME).size).toBe(0);
  });

  it('reads a row written without the padding around its cells', () => {
    // Markdown does not require it, and a rule demanding exactly one space
    // reads no row out of a table that is perfectly valid.
    const readme = table(`|\`${NAME}/main\`| \`electron\` |`);

    expect(peerTable(readme, NAME).get('./main')).toEqual(['electron']);
  });

  it('reads a row that trails whitespace after its last cell', () => {
    const readme = table(`| \`${NAME}/main\` | \`electron\` |` + '  ');

    expect(peerTable(readme, NAME).get('./main')).toEqual(['electron']);
  });

  it('reads no row when the package is renamed and the prose is not', () => {
    // Issue #120 renamed this package. A parse that matched the old name would
    // have reported a clean table over rows nobody could install from.
    const readme = table('| `stuffbucket-electron/main` | `electron` |');

    expect(peerTable(readme, NAME).size).toBe(0);
  });

  it('reads no row out of a name that only starts with the package name', () => {
    const readme = table(`| \`${NAME}-extra/main\` | \`electron\` |`);

    expect(peerTable(readme, NAME).size).toBe(0);
  });
});

describe('judging the peer table against the import graph', () => {
  const rows = new Map([['./main', ['electron']]]);
  const graph = new Map([['./main', ['electron']]]);

  it('passes a table that names what the entry point imports', () => {
    expect(checks({ table: rows, reached: graph })).toEqual([]);
  });

  it('fails a row that leaves out a package the entry point imports', () => {
    expect(
      checks({ table: new Map([['./main', []]]), reached: graph }),
    ).toContain('the ./main row names what the entry point imports');
  });

  it('fails a row that names a package no import reaches', () => {
    expect(
      checks({
        table: new Map([['./main', ['electron', 'node-pty']]]),
        reached: graph,
        peers: ['electron', 'node-pty'],
      }),
    ).toContain('the ./main row names what the entry point imports');
  });

  it('fails an entry point with no row, and a row with no entry point', () => {
    expect(checks({ table: new Map(), reached: graph })).toEqual([
      'the peer table has at least one row',
      'at least one row names a peer',
      'the table has a row for ./main',
    ]);
    expect(checks({ table: new Map([['./ghost', ['electron']]]), reached: graph })).toEqual([
      'the table has a row for ./main',
      './ghost is an entry point the manifest exports',
    ]);
  });

  it('names the row an exception belongs to, and no other', () => {
    expect(
      checks({
        table: new Map([
          ['./renderer', ['react']],
          ['./main', ['electron', 'react-dom']],
        ]),
        reached: new Map([
          ['./renderer', ['react']],
          ['./main', ['electron']],
        ]),
        peers: ['electron', 'react', 'react-dom'],
        exceptions: [{ subpath: './renderer', name: 'react-dom' }],
      }),
    ).toEqual([
      'the ./renderer row names what the entry point imports',
      'the ./main row names what the entry point imports',
    ]);
  });

  it('fails on an empty table, an empty graph, and a table of empty rows', () => {
    // The floors. Every comparison above holds when one side is empty, which is
    // how a check passes over nothing at all.
    expect(checks({ table: new Map(), reached: new Map() })).toEqual([
      'the peer table has at least one row',
      'the import graph reached at least one entry point',
      'at least one row names a peer',
      'at least one entry point imports a package',
    ]);
    expect(
      checks({ table: new Map([['./main', []]]), reached: new Map([['./main', []]]) }),
    ).toEqual(['at least one row names a peer', 'at least one entry point imports a package']);
    expect(checks({ table: rows, reached: graph, peers: [] })).toEqual([
      'the manifest declares at least one peer',
    ]);
  });

  it('accepts a row naming a listed peer no entry point imports', () => {
    expect(
      checks({
        table: new Map([['./renderer', ['react', 'react-dom']]]),
        reached: new Map([['./renderer', ['react']]]),
        peers: ['react', 'react-dom'],
        exceptions: [{ subpath: './renderer', name: 'react-dom' }],
      }),
    ).toEqual([]);

    // In name order, whichever order the two sides arrive in.
    expect(
      checks({
        table: new Map([['./renderer', ['ghostty-web', 'react', 'react-dom']]]),
        reached: new Map([['./renderer', ['react', 'ghostty-web']]]),
        peers: ['ghostty-web', 'react', 'react-dom'],
        exceptions: [{ subpath: './renderer', name: 'react-dom' }],
      }),
    ).toEqual([]);
  });

  it('fails an exception that stopped being a peer, or started being imported', () => {
    expect(
      checks({
        table: new Map([['./renderer', ['react', 'react-dom']]]),
        reached: new Map([['./renderer', ['react']]]),
        peers: ['react'],
        exceptions: [{ subpath: './renderer', name: 'react-dom' }],
      }),
    ).toEqual(['react-dom is a declared peer']);

    expect(
      checks({
        table: new Map([['./renderer', ['react', 'react-dom']]]),
        reached: new Map([['./renderer', ['react', 'react-dom']]]),
        peers: ['react', 'react-dom'],
        exceptions: [{ subpath: './renderer', name: 'react-dom' }],
      }),
    ).toEqual([
      'react-dom is imported by no entry point, which is why ./renderer names it by hand',
    ]);
  });
});

describe('the peer table this repository ships', () => {
  it('has a row for every entry point the manifest exports', async () => {
    const readme = await readFile(path.join(ROOT, 'README.md'), 'utf8');
    const manifest = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')) as {
      name: string;
      exports: Record<string, { default?: string } | string>;
    };
    const entries = Object.entries(manifest.exports)
      .filter(([, entry]) => typeof entry === 'object' && /\.m?js$/.test(entry.default ?? ''))
      .map(([subpath]) => subpath)
      .sort();
    const rows = peerTable(readme, manifest.name);

    // The floor. Both sides come out of a file, and either coming back empty
    // would satisfy the comparison by comparing nothing. The import graph is
    // what `npm run verify:exports` adds to this; it needs a build, so it is
    // not here.
    expect(entries.length).toBeGreaterThan(1);
    expect(rows.size).toBeGreaterThan(1);
    expect([...rows.keys()].sort()).toEqual(entries);
  });

  it('names one exception, which is a declared peer', async () => {
    const manifest = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')) as {
      peerDependencies: Record<string, string>;
    };

    expect(PEER_TABLE_EXCEPTIONS).toEqual([{ subpath: './renderer', name: 'react-dom' }]);
    expect(Object.keys(manifest.peerDependencies)).toContain('react-dom');
  });
});

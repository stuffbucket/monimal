import { Linter } from 'eslint';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import shell from '../eslint/shell.mjs';
import { Diagnostics } from '../src/renderer/components/settings/Diagnostics.js';
import { ModelCards } from '../src/renderer/components/settings/ModelCards.js';
import { Usage } from '../src/renderer/components/settings/Usage.js';
import { LOREM_CONTENT } from '../src/renderer/lib/content-lorem.js';
import { SHELL_CONTENT, ShellContentProvider, type ShellContent } from '../src/renderer/lib/content.js';
import {
  SAMPLE_APPS,
  SAMPLE_CLIENTS,
  SAMPLE_DIAGNOSTICS,
  SAMPLE_ENDPOINT,
  SAMPLE_MODELS,
  sampleUsage,
} from '../src/renderer/lib/sample-settings.js';

/**
 * Whether a control still holds its own words.
 *
 * Five exported components carried fifty-seven user-facing strings. A control
 * that does that fixes the language and the product's voice for everyone who
 * installs it, and puts the thing a consumer is most certain to want to change
 * in the one place they cannot reach. `src/renderer/lib/content.ts` is where
 * the strings went; this is what keeps them there.
 *
 * The mechanism is the stub catalogue. Every surface is rendered under
 * `LOREM_CONTENT`, whose words are deliberately not English, and the markup is
 * then read for English. A string a component kept for itself has nothing in
 * the catalogue to have come from, so it appears here as a word the stub
 * cannot account for.
 *
 * A rule that has to be remembered is a rule that lapses at the next surface
 * anybody adds. This one does not need to be remembered: adding a component
 * with copy inside it fails the moment it is rendered here.
 */

/** The date the usage sample is anchored to, so the report is deterministic. */
const NOW_MS = Date.UTC(2026, 0, 15, 12, 0, 0);

/**
 * Every surface this can render without a document.
 *
 * `renderToStaticMarkup` does not run effects, which is why the two dialogs
 * are absent: Radix's `Dialog` portals, and a portal has nowhere to go on the
 * server. `tests/settings-surfaces.test.tsx` renders those, and the catalogue
 * check that covers them is `every string a component says comes from the
 * catalogue` below, which reads their source rather than their output.
 */
function surfaces(content: ShellContent): [string, ReactElement][] {
  const wrap = (name: string, element: ReactElement): [string, ReactElement] => [
    name,
    createElement(ShellContentProvider, { content, children: element }),
  ];

  return [
    wrap('Usage', createElement(Usage, {
      report: sampleUsage(NOW_MS),
      period: 'month',
      onPeriodChange: () => undefined,
      nowMs: NOW_MS,
    })),
    wrap('ModelCards', createElement(ModelCards, {
      models: SAMPLE_MODELS,
      loadedAtMs: NOW_MS - 60_000,
      nowMs: NOW_MS,
    })),
    wrap('Diagnostics', createElement(Diagnostics, { groups: SAMPLE_DIAGNOSTICS })),
  ];
}

/** The text a rendered surface shows, with the markup taken out. */
function visibleText(markup: string): string {
  return markup
    .replaceAll(/<[^>]*>/g, ' ')
    .replaceAll(/&[a-z]+;|&#\d+;/g, ' ')
    .replaceAll(/\s+/g, ' ');
}

/** Every string a catalogue holds, however deeply nested. */
function catalogueStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object' || value === null) return [];
  return Object.values(value).flatMap(catalogueStrings);
}

describe('a surface rendered from the stub catalogue', () => {
  const stub = surfaces(LOREM_CONTENT);

  it('renders enough to be worth reading', () => {
    // The floor. A render that threw or produced nothing would report every
    // surface below as free of English by having no text at all.
    expect(stub.length).toBeGreaterThan(2);
    for (const [name, element] of stub) {
      expect(visibleText(renderToStaticMarkup(element)).length, name).toBeGreaterThan(200);
    }
  });

  it('says none of the words the shipped catalogue says', () => {
    /*
     * The check itself. Every distinctive word from the English catalogue,
     * looked for in markup drawn from the stub.
     *
     * Distinctive, because the two catalogues share what is not content: a
     * placeholder like `{noun}`, a unit, a separator. A word is distinctive
     * when the stub does not also use it, which is the only definition that
     * cannot be argued with.
     */
    const stubWords = new Set(
      catalogueStrings(LOREM_CONTENT)
        .flatMap((text) => text.toLowerCase().match(/[a-z]{3,}/g) ?? []),
    );
    /*
     * And not a word the caller handed in. A model is called "Claude Haiku
     * 4.5" and an endpoint is `/chat/completions` in the sample data, so
     * "claude" and "chat" reach the markup from the props rather than from a
     * component — which is the seam working, not failing. The check is about
     * what a component says on its own.
     */
    const dataWords = new Set(
      catalogueStrings([SAMPLE_APPS, SAMPLE_CLIENTS, SAMPLE_DIAGNOSTICS, SAMPLE_ENDPOINT, SAMPLE_MODELS, sampleUsage(NOW_MS)])
        .flatMap((text) => text.toLowerCase().match(/[a-z]{3,}/g) ?? []),
    );

    const shippedWords = [
      ...new Set(
        catalogueStrings(SHELL_CONTENT)
          .flatMap((text) => text.toLowerCase().match(/[a-z]{3,}/g) ?? [])
          .filter((word) => !stubWords.has(word) && !dataWords.has(word)),
      ),
    ];

    // The floor under the word list. An empty one finds nothing anywhere.
    expect(shippedWords.length).toBeGreaterThan(40);

    const leaked = stub.flatMap(([name, element]) => {
      const text = visibleText(renderToStaticMarkup(element)).toLowerCase();
      return shippedWords
        .filter((word) => new RegExp(`\\b${word}\\b`).test(text))
        .map((word) => `${name}: ${word}`);
    });

    expect(leaked).toEqual([]);
  });

  it('is the same shape as the one that ships', () => {
    // A stub missing a key falls back to nothing rather than to English, so
    // the check above would pass over a surface drawing blanks. TypeScript
    // holds the two to one interface; this holds them to the same values
    // being present, which a wider optional type would not.
    const shape = (value: unknown): string[] =>
      typeof value === 'object' && value !== null
        ? Object.entries(value)
            .flatMap(([key, nested]) => shape(nested).map((path) => `${key}.${path}`))
        : [''];

    expect(shape(LOREM_CONTENT).sort()).toEqual(shape(SHELL_CONTENT).sort());
    expect(catalogueStrings(LOREM_CONTENT).filter((text) => text.trim() === '')).toEqual([]);
  });
});

describe('the catalogue itself', () => {
  it('keeps every placeholder the shipped strings use', () => {
    /*
     * `No traffic {noun}.` is filled with the period the caller chose. A stub
     * that dropped `{noun}` would render a sentence with no data in it, and
     * the leak check above would read that as a clean surface.
     */
    const placeholders = (content: ShellContent): string[] =>
      catalogueStrings(content)
        .flatMap((text) => text.match(/\{\w+}/g) ?? [])
        .sort();

    expect(placeholders(LOREM_CONTENT)).toEqual(placeholders(SHELL_CONTENT));
    expect(placeholders(SHELL_CONTENT).length).toBeGreaterThan(5);
  });
});

describe('the rule that reports copy in the editor', () => {
  /*
   * The dialogs are why this exists at all: Radix portals them and the render
   * check above has no document, so a string typed back into `ApiKeysDialog`
   * would reach nothing that could see it. And a rule that matches nothing
   * passes every file, which this repository has now shipped twice — so the
   * rule is run against each shape of mistake it knows.
   */
  const lint = (code: string): string[] => {
    const linter = new Linter();
    return linter
      .verify(code, {
        plugins: { shell: shell as never },
        rules: { 'shell/content': 'error' },
        languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      })
      .map((message) => message.messageId ?? '');
  };

  it('reports a word written into the markup', () => {
    expect(lint('const a = <p>Nothing to report yet.</p>;')).toEqual(['text']);
  });

  it('reports a word written into a prop a person reads', () => {
    expect(lint('const a = <Page title="Usage" testId="settings-usage" />;')).toEqual(['prop']);
  });

  it('reports a word written around a substitution', () => {
    // `label={`Remove ${client.label}`}` is half data and half English, and
    // the English half is the half that has to move.
    expect(lint('const a = <Button label={`Remove ${name}`} />;')).toEqual(['prop']);
  });

  it('says nothing about a surface reading from the catalogue', () => {
    expect(
      lint(
        'const a = <Page title={content.title} testId="settings-usage" className="settings">{value}</Page>;',
      ),
    ).toEqual([]);
  });

  it('says nothing about punctuation between substitutions', () => {
    // `{fill(…)}` followed by `.` is a JSX text node with no letter in it, and
    // a rule that reported it would be a rule people turn off.
    expect(lint('const a = <p>{first} · {second}.</p>;')).toEqual([]);
  });
});

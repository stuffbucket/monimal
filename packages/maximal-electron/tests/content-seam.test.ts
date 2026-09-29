import { Linter } from 'eslint';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import shell from '../eslint/shell.mjs';
import { ModelCardGrid } from '../src/renderer/components/settings/ModelCards.js';
import { LOREM_CONTENT } from '../src/renderer/lib/content-lorem.js';
import {
  SHELL_CONTENT,
  ShellContentProvider,
  type ShellContent,
} from '../src/renderer/lib/content.js';
import { SAMPLE_MODELS } from '../.storybook/sample-settings.js';

function renderModels(content: ShellContent): string {
  return renderToStaticMarkup(
    createElement(ShellContentProvider, {
      content,
      children: createElement(ModelCardGrid, { models: SAMPLE_MODELS }),
    }),
  );
}

function visibleText(markup: string): string {
  return markup
    .replaceAll(/<[^>]*>/g, ' ')
    .replaceAll(/&[a-z]+;|&#\d+;/g, ' ')
    .replaceAll(/\s+/g, ' ');
}

function catalogueStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object' || value === null) return [];
  return Object.values(value).flatMap(catalogueStrings);
}

describe('a reusable surface rendered from the stub catalogue', () => {
  it('renders meaningful content without leaking the shipped catalogue', () => {
    const stubMarkup = renderModels(LOREM_CONTENT);
    expect(visibleText(stubMarkup).length).toBeGreaterThan(100);

    const stubWords = new Set(
      catalogueStrings(LOREM_CONTENT).flatMap(
        (text) => text.toLowerCase().match(/[a-z]{3,}/g) ?? [],
      ),
    );
    const dataWords = new Set(
      catalogueStrings(SAMPLE_MODELS).flatMap(
        (text) => text.toLowerCase().match(/[a-z]{3,}/g) ?? [],
      ),
    );
    const shippedWords = [
      ...new Set(
        catalogueStrings(SHELL_CONTENT)
          .flatMap((text) => text.toLowerCase().match(/[a-z]{3,}/g) ?? [])
          .filter((word) => !stubWords.has(word) && !dataWords.has(word)),
      ),
    ];
    expect(shippedWords.length).toBeGreaterThan(10);

    const text = visibleText(stubMarkup).toLowerCase();
    expect(
      shippedWords.filter((word) => new RegExp(`\\b${word}\\b`).test(text)),
    ).toEqual([]);
  });

  it('keeps the stub and shipped catalogues structurally identical', () => {
    const shape = (value: unknown): string[] =>
      typeof value === 'object' && value !== null
        ? Object.entries(value).flatMap(([key, nested]) =>
            shape(nested).map((entry) => `${key}.${entry}`),
          )
        : [''];

    expect(shape(LOREM_CONTENT).sort()).toEqual(shape(SHELL_CONTENT).sort());
    expect(
      catalogueStrings(LOREM_CONTENT).filter((text) => text.trim() === ''),
    ).toEqual([]);
  });
});

describe('the rule that reports copy in the editor', () => {
  const lint = (code: string): string[] => {
    const linter = new Linter();
    return linter
      .verify(code, {
        plugins: { shell: shell },
        rules: { 'shell/content': 'error' },
        languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      })
      .map((message) => message.messageId ?? '');
  };

  it('reports a word written into the markup', () => {
    expect(lint('const a = <p>Nothing to report yet.</p>;')).toEqual(['text']);
  });

  it('reports a word written into a prop a person reads', () => {
    expect(
      lint('const a = <Page title="Usage" testId="settings-usage" />;'),
    ).toEqual(['prop']);
  });

  it('reports a word written around a substitution', () => {
    expect(lint('const a = <Button label={`Remove ${name}`} />;')).toEqual([
      'prop',
    ]);
  });

  it('says nothing about a surface reading from the catalogue', () => {
    expect(
      lint(
        'const a = <Page title={content.title} testId="settings-usage" className="settings">{value}</Page>;',
      ),
    ).toEqual([]);
  });

  it('says nothing about punctuation between substitutions', () => {
    expect(lint('const a = <p>{first} · {second}.</p>;')).toEqual([]);
  });
});

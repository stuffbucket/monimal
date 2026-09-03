import { readFileSync } from 'node:fs';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import {
  COMPONENT_CSS_MESSAGES,
  componentCssFindings,
  declaredTokens,
  readTokens,
} from '../scripts/component-css.mjs';
import shell from '../eslint/shell.mjs';
import {
  SHELL_COMPONENT_LAYER,
  injectComponentStyles,
} from '../src/renderer/lib/component-styles.js';
import { SettingsPage } from '../src/renderer/components/settings/SettingsPage.js';
import { componentStyles, exportedModules, publishedTokens } from './stylesheets.js';

/**
 * What a component's own rules may say.
 *
 * The rules travel with the component now, which puts them in a TypeScript
 * file where nothing was watching for a literal. A colour or a size written
 * out here is a design decision made in a place no theme can reach: it renders
 * correctly in this repository and wrongly for every consumer with a palette
 * of their own, which is the failure `docs/shell-variables.md` describes as
 * "never an error, only a slightly wrong picture".
 *
 * The judgement itself is `scripts/component-css.mjs`, not this file. It used
 * to be six regular expressions here, and one of them — the check meant to
 * catch a component writing `--band` and reading `--shell-band` — matched
 * `--shell-*` and then asserted that nothing matched began with `--shell-`,
 * which is structurally incapable of failing. Two readers of one rule is the
 * drift this whole change is about, so there is one, and
 * `eslint/shell.mjs` reports the same findings at the character while
 * the file is open.
 */

/** The carried rules, as one string, for the checks that span all of them. */
const styles = componentStyles();

/** The contract a consumer actually defines. */
const contract = { published: new Set(publishedTokens()) };

describe('the rules a component carries', () => {
  it('are read at all', () => {
    // The floor. A reader that matched nothing would report every check below
    // as passing over an empty string, which is the shape of the false pass
    // this repository has shipped twice.
    expect(styles.length).toBeGreaterThan(4000);
    expect(styles).toContain('.sb-shell .settings');

    // And the floor under the contract. An empty one reports every name
    // unknown; one read from the wrong file reports every name fine.
    expect(contract.published.size).toBeGreaterThan(30);
    expect(contract.published.has('--shell-text')).toBe(true);
  });

  it('hold to the published design contract, string by string', () => {
    /*
     * Every check the analyser makes, over every carried stylesheet
     * separately, so a finding names the module it is in rather than an
     * offset into a concatenation.
     *
     * What each one is for is in `scripts/component-css.mjs`. The one worth
     * naming here is `unknown`: `--shell-*` looks like one namespace and is
     * two, and the second — `--shell-text-primary`, `--shell-border-subtle`,
     * what you get by prefixing the short names `tokens.css` authors — is
     * defined by nobody. An undefined custom property with no fallback makes
     * the whole declaration invalid at computed-value time, so a rule reading
     * one is not a wrong colour, it is no border at all.
     */
    const found = exportedModules().flatMap(([name, source]) =>
      [...source.matchAll(/^(?:export )?const [A-Z_]+ = `([^`]*)`;$/gm)]
        .map((match) => match[1] ?? '')
        .filter((css) => css.includes('.sb-shell'))
        .flatMap((css) =>
          componentCssFindings(css, contract).map(
            (finding) => `${name}: ${finding.id} ${finding.text}`,
          ),
        ),
    );

    expect(found).toEqual([]);
  });

  it('read every token they declare', () => {
    /*
     * The half of the contract no single string can decide.
     *
     * A component may declare geometry the ramp has no name for — a band's
     * height is not a step on the spacing scale — but a name written and never
     * read is a rule that was renamed and a declaration that was not.
     * `--band` was written four times and read as `--shell-band` three, so the
     * usage chart drew every token class in one colour and nothing reported an
     * error, because a custom property nobody reads is not an error.
     *
     * Read across the carried rules and the shipped stylesheets together: a
     * component may declare a token that `structural.css` is the one to read.
     */
    const everything = [styles, ...publishedSources()].join('\n');
    const read = new Set(readTokens(everything));
    const orphans = [...new Set(declaredTokens(styles))].filter((name) => !read.has(name)).sort();

    expect(orphans).toEqual([]);
  });

  it('are asked for by the component that renders them', () => {
    // A string nothing injects is a rule that never applies. Every style
    // constant has to reach `useComponentStyles`, in its own module or in one
    // that imports it.
    const uses = exportedModules()
      .flatMap(([, source]) => [...source.matchAll(/useComponentStyles\('[^']+',\s*([A-Z_]+)\)/g)])
      .map((match) => match[1] ?? '');

    const orphans = exportedModules()
      .flatMap(([name, source]) =>
        [...source.matchAll(/^(?:export )?const ([A-Z_]+) = `[^`]*\.sb-shell[^`]*`;$/gm)]
          .map((match) => match[1] ?? '')
          .filter((constant) => !uses.includes(constant))
          .map((constant) => `${name}: ${constant}`),
      )
      .sort();

    expect(uses.length).toBeGreaterThan(4);
    expect(orphans).toEqual([]);
  });
});

/** The text of every stylesheet the package ships. */
function publishedSources(): string[] {
  return [...new Set(['src/renderer/styles/structure.css', 'src/renderer/styles/structural.css'])].map(
    (source) => readFileSync(new URL(`../${source}`, import.meta.url), 'utf8'),
  );
}

describe('the rule that reports those findings in the editor', () => {
  /*
   * A lint rule that matches nothing passes every file.
   *
   * That is not a hypothetical here: the assertion this rule replaces could
   * not fail, and it was the one written to catch the `--band` defect. So the
   * rule is executed against text that is wrong in each of the ways it knows
   * about, and each one has to come back.
   */
  const lint = (code: string): string[] => {
    const linter = new Linter();
    return linter
      .verify(code, {
        plugins: { shell: shell as never },
        rules: { 'shell/design-tokens': 'error' },
      })
      .map((message) => message.messageId ?? '');
  };

  it('knows every finding the analyser can produce', () => {
    // The rule declares its messages from the analyser's own table, so a
    // finding with no message would throw at report time rather than here.
    // This is the floor under that: an empty table would satisfy it silently.
    expect(Object.keys(COMPONENT_CSS_MESSAGES).sort()).toEqual([
      'colour',
      'foreign',
      'foreign-read',
      'length',
      'redundant',
      'unknown',
      'unscoped',
    ]);
  });

  it('reports each kind of mistake where it is written', () => {
    const found = lint(
      [
        'const BAD_STYLES = `',
        '.sb-shell .thing {',
        '  color: #ff0000;',
        '  padding: 13px;',
        '  border: 1px solid var(--shell-border-subtle);',
        '  gap: var(--space-2);',
        '  --shell-space-2: 9px;',
        '  --thing-width: 4px;',
        '}',
        '.loose { color: var(--shell-text) }',
        '`;',
      ].join('\n'),
    );

    expect(found.sort()).toEqual([
      'colour',
      'foreign',
      'foreign-read',
      'length',
      'redundant',
      'unknown',
      'unscoped',
    ]);
  });

  it('says nothing about a stylesheet that holds to the contract', () => {
    expect(
      lint(
        [
          'const GOOD_STYLES = `',
          '.sb-shell .thing {',
          '  --shell-thing-height: 10px;',
          '  height: var(--shell-thing-height);',
          '  padding: var(--shell-space-2);',
          '  border: 1px solid var(--shell-border);',
          '  color: var(--shell-text);',
          '}',
          '`;',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('leaves a template literal that is not a stylesheet alone', () => {
    // The marker is `.sb-shell`, so prose and every other template literal in
    // the package is out of scope — including a doc comment that fences an
    // example, which `StatusChip` has and which names literal hex values.
    expect(lint('const label = `${count} items, #ff0000, 13px`;')).toEqual([]);
  });
});

describe('a carried stylesheet reaching a document', () => {
  /*
   * Executed rather than matched.
   *
   * There was no test here that ran the hook at all: every check read the
   * strings and none of them proved a `<style>` element ever arrived. The
   * Vitest environment is `node` with neither jsdom nor happy-dom installed,
   * so the injection is a plain function over a document and this drives it
   * against the smallest stub that answers — the arrangement
   * `tests/portal-container.test.ts` uses, and for the same reason.
   */
  interface StubElement {
    attributes: Map<string, string>;
    textContent: string | null;
    setAttribute: (name: string, value: string) => void;
  }

  function stubDocument() {
    const children: StubElement[] = [];

    const target = {
      createElement: (): StubElement => {
        const attributes = new Map<string, string>();
        return {
          attributes,
          textContent: null,
          setAttribute: (name: string, value: string) => void attributes.set(name, value),
        };
      },
      head: {
        append: (element: StubElement) => void children.push(element),
        prepend: (element: StubElement) => void children.unshift(element),
        querySelector: (selector: string): StubElement | null => {
          const id = /^style\[data-shell-styles="([^"]+)"]$/.exec(selector)?.[1];
          if (id === undefined) throw new Error(`the stub answers one selector, not ${selector}`);
          return children.find((child) => child.attributes.get('data-shell-styles') === id) ?? null;
        },
      },
    };

    return { document: target as unknown as Document, children };
  }

  it('arrives once, in the components layer', () => {
    const { document, children } = stubDocument();

    injectComponentStyles(document, 'card', '.sb-shell .card { color: var(--shell-text) }');

    // Two: the statement that fixes layer order, and the rules.
    expect(children).toHaveLength(2);
    expect(children[1]?.textContent).toContain(`@layer ${SHELL_COMPONENT_LAYER} {`);
    expect(children[1]?.textContent).toContain('.sb-shell .card');
  });

  it('fixes layer order ahead of the rules that depend on it', () => {
    /*
     * Layer order is decided by first appearance, and a carried stylesheet
     * appears whenever its component first renders. Without the statement, the
     * order would depend on which surface a consumer happened to open first —
     * and a consumer's own rule beating ours is the entire point of the layer.
     */
    const { document, children } = stubDocument();

    injectComponentStyles(document, 'card', '.sb-shell .card { color: var(--shell-text) }');

    expect(children[0]?.attributes.get('data-shell-styles')).toBe('layer-order');
    expect(children[0]?.textContent).toBe('@layer sb-shell.base, sb-shell.components;');
  });

  it('injects one element however many components ask for it', () => {
    const { document, children } = stubDocument();

    for (let index = 0; index < 10; index += 1) {
      injectComponentStyles(document, 'card', '.sb-shell .card { color: var(--shell-text) }');
    }

    expect(children).toHaveLength(2);
  });

  it('rewrites the rules when the same id arrives with different text', () => {
    // The dev server replaces a module and calls again with new text. The
    // predecessor consulted a module-level `Set` first and returned, so an
    // edit to a `*_STYLES` constant appeared to do nothing until a reload.
    const { document, children } = stubDocument();

    injectComponentStyles(document, 'card', '.sb-shell .card { color: var(--shell-text) }');
    injectComponentStyles(document, 'card', '.sb-shell .card { color: var(--shell-accent) }');

    expect(children).toHaveLength(2);
    expect(children[1]?.textContent).toContain('--shell-accent');
    expect(children[1]?.textContent).not.toContain('--shell-text)');
  });

  it('gives a second document its own copy', () => {
    /*
     * A module-level registry made this impossible, and made the check against
     * the document unreachable: the first window recorded the id, and every
     * other window — a popped-out panel, a second `BrowserWindow` sharing the
     * module — rendered every carried rule unstyled. `shellPortalRoot` keys on
     * an attribute in the target document for exactly this reason; so does
     * this now.
     */
    const first = stubDocument();
    const second = stubDocument();

    injectComponentStyles(first.document, 'card', '.sb-shell .card { color: var(--shell-text) }');
    injectComponentStyles(second.document, 'card', '.sb-shell .card { color: var(--shell-text) }');

    expect(first.children).toHaveLength(2);
    expect(second.children).toHaveLength(2);
  });
});

describe('a component that carries rules', () => {
  it('renders where there is no document to inject into', () => {
    /*
     * `useInsertionEffect` does not run on the server, so this proves only
     * that importing and rendering the component does not reach for a
     * document at module scope or during render. A rule is decoration:
     * refusing to render without one would be worse than rendering without
     * it, and the hook's own guard says the same.
     */
    const markup = renderToStaticMarkup(
      createElement(SettingsPage, { title: 'Diagnostics', children: null }),
    );

    expect(markup).toContain('class="settings"');
    expect(markup).toContain('Diagnostics');
  });
});

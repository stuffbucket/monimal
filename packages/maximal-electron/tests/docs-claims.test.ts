import { describe, expect, it } from 'vitest';

import {
  codeSpans,
  constants,
  links,
  npmScripts,
  npmScriptsOutOfScope,
  pathClaims,
  withoutFences,
} from '../scripts/docs-claims.mjs';

/**
 * What the documentation checker matches.
 *
 * The repository removed a prose linter because its rules could not tell a
 * rule from a description or an identifier from an English word. These rules
 * make no such judgement: they extract names, and the script asks whether each
 * one exists. The risk here is the opposite one — a rule so eager that it
 * reports a path in another repository, or a placeholder, as a defect. An
 * earlier version did exactly that and was cut.
 *
 * So these tests pin what is deliberately NOT matched as hard as what is.
 */

describe('withoutFences', () => {
  it('drops fenced blocks, because their contents are examples', () => {
    const text = ['before', '```bash', 'npm run imaginary', '```', 'after'].join(
      '\n',
    );
    // The whole result, not two substrings. A rule that replaced a block with
    // anything at all satisfied `not.toContain`.
    expect(withoutFences(text)).toBe('before\n\nafter');
  });

  it('drops several blocks, not just the first', () => {
    const text = ['```', 'one', '```', 'mid', '```', 'two', '```'].join('\n');
    const stripped = withoutFences(text);
    expect(stripped).not.toContain('one');
    expect(stripped).not.toContain('two');
    expect(stripped).toContain('mid');
  });

  it('leaves an empty string where the block was', () => {
    // Not a marker. Anything else would become a code span of its own.
    expect(withoutFences(['a', '```', 'x', '```', 'b'].join('\n'))).toBe('a\n\nb');
  });

  it('opens a block only at the start of a line', () => {
    // Triple backticks inside a sentence are an inline span. A rule that let
    // one open a block swallowed the prose up to the next real fence.
    const text = ['a ```inline``` b', '```', 'inside', '```'].join('\n');
    expect(withoutFences(text)).toBe('a ```inline``` b\n');
  });

  it('closes a block only at the start of a line', () => {
    // The mirror. A closing fence found mid-line ends the block early and
    // leaves the rest of the example on the page as a claim.
    const text = ['```', 'text with ``` inline', 'real', '```'].join('\n');
    expect(withoutFences(text)).toBe('');
  });
});

describe('npmScripts', () => {
  it('finds a script named in prose', () => {
    expect(npmScripts('Run `npm run verify:package` first.')).toEqual([
      'verify:package',
    ]);
  });

  it('finds every script on a line', () => {
    // The commands table lists two in one cell.
    expect(npmScripts('`npm run lint`, `npm run lint:fix`')).toEqual([
      'lint',
      'lint:fix',
    ]);
  });

  it('ignores a script inside a fenced block', () => {
    // A block is a worked example and may show a command from another project.
    const text = ['```bash', 'npm run something-else', '```'].join('\n');
    expect(npmScripts(text)).toEqual([]);
  });

  it('ignores an unbackticked mention', () => {
    expect(npmScripts('You can npm run whatever you like.')).toEqual([]);
  });

  it('finds both halves of a compound command in one span', () => {
    // The commands table writes this in a single pair of backticks. An
    // anchored rule matched the first and dropped the second in silence, so
    // `test:e2e` was named in three documents and checked in none.
    expect(npmScripts('`npm run package && npm run test:e2e`')).toEqual([
      'package',
      'test:e2e',
    ]);
  });

  it('finds a script named with an argument after it', () => {
    expect(npmScripts('`npm run compose -- <name>`')).toEqual(['compose']);
  });

  it('still refuses a mention that only looks like one', () => {
    // Widening the rule inside a span must not widen what counts as a span.
    expect(npmScripts('`the npm running joke`')).toEqual([]);
  });
});

describe('npmScriptsOutOfScope', () => {
  it('counts what the fence rule deliberately drops', () => {
    const text = ['`npm run lint`', '```bash', 'npm run other', '```'].join('\n');
    expect(npmScriptsOutOfScope(text)).toBe(1);
  });

  it('is zero when every mention is a claim', () => {
    expect(npmScriptsOutOfScope('`npm run lint`')).toBe(0);
  });

  it('counts a one-letter script name, which is still a name', () => {
    expect(npmScriptsOutOfScope('You can npm run x today.')).toBe(1);
  });

  it('counts a mention by the same rule that reads one', () => {
    // The two rules share one pattern. While they were separate literals the
    // second was a length rather than a list of names, so nothing it matched
    // was ever read and every mutant of it survived.
    expect(npmScriptsOutOfScope('npm run test:e2e and npm run lint:fix')).toBe(2);
  });
});

describe('codeSpans', () => {
  it('returns the contents of each span, fences removed', () => {
    const text = ['`a` and `b`', '```', '`c`', '```'].join('\n');
    expect(codeSpans(text)).toEqual(['a', 'b']);
  });

  it('does not join two spans across a line break', () => {
    expect(codeSpans('`a`\ntext\n`b`')).toEqual(['a', 'b']);
  });
});

describe('pathClaims', () => {
  const scope = {
    roots: ['scripts', 'src', 'docs'],
    buildRoots: ['.vite', 'out'],
    moduleExtensions: ['.ts', '.js', '.css'],
  };

  describe('repo', () => {
    it('finds a backticked path under a declared root', () => {
      expect(pathClaims('See `scripts/verify-docs.mjs`.', scope).repo).toEqual([
        'scripts/verify-docs.mjs',
      ]);
    });

    it('trims a line reference to the file it points at', () => {
      expect(pathClaims('`scripts/storybook-check.mjs:152` gives up.', scope).repo).toEqual([
        'scripts/storybook-check.mjs',
      ]);
    });

    it('trims a line and column reference too', () => {
      // A colon cannot appear in a path this repository carries, so everything
      // from the first one is a location.
      expect(pathClaims('`src/main/index.ts:42:7`', scope).repo).toEqual([
        'src/main/index.ts',
      ]);
    });

    it('trims the padding a code span may carry', () => {
      expect(pathClaims('` scripts/a.mjs `', scope).repo).toEqual(['scripts/a.mjs']);
    });

    it('keeps a glob, because a pattern matching nothing is the defect', () => {
      expect(pathClaims('`src/renderer/*.html`', scope).repo).toEqual(['src/renderer/*.html']);
    });

    it('needs a directory boundary, not a matching prefix', () => {
      const claims = pathClaims('`docsite/index.js`', scope);
      expect(claims.repo).toEqual([]);
      expect(claims.relative).toEqual(['docsite/index.js']);
    });

    it('ignores a span that is a command rather than a path', () => {
      // `npm run x` and a sentence in backticks both start with no root, and a
      // span with a space in it is prose however it starts.
      const claims = pathClaims('`npm run package` and `scripts/a.mjs and more`', scope);
      expect(claims.repo).toEqual([]);
      expect(claims.declined).toEqual([]);
    });

    it('ignores a bare root, which is an English word', () => {
      expect(pathClaims('The `scripts` directory and `src`.', scope).repo).toEqual([]);
    });

    it('ignores a path inside a fenced block', () => {
      const text = ['```', 'scripts/from-another-project.mjs', '```'].join('\n');
      expect(pathClaims(text, scope).repo).toEqual([]);
    });
  });

  describe('build', () => {
    /**
     * #152. A build path matched no root, so `.vite/build/llama-worker-BREAK.js`
     * sat in `docs/architecture.md` through a green run reporting 205 paths.
     */
    it('collects a path under a build root', () => {
      expect(pathClaims('`.vite/build/main.js`', scope).build).toEqual(['.vite/build/main.js']);
    });

    it('collects a path under any build root, not only the first', () => {
      expect(pathClaims('`out/Stuffbucket-win32-x64/`', scope).build).toEqual([
        'out/Stuffbucket-win32-x64/',
      ]);
    });

    it('collects the build root itself, which a checkout does not hold', () => {
      expect(pathClaims('`.vite/`', scope).build).toEqual(['.vite/']);
    });

    it('collects an archive listing entry, which carries a leading slash', () => {
      expect(pathClaims('`/.vite/build/preload.js`', scope).build).toEqual([
        '/.vite/build/preload.js',
      ]);
    });

    it('collects a listing entry naming the root and nothing else', () => {
      expect(pathClaims('`/.vite`', scope).build).toEqual(['/.vite']);
    });

    it('needs a directory boundary, not a matching prefix', () => {
      const claims = pathClaims('`.vitepress/config.ts`', scope);
      expect(claims.build).toEqual([]);
      expect(claims.declined).toEqual(['.vitepress/config.ts']);
    });

    it('does not read a leading slash on anything else as a build path', () => {
      // `/renderer/styles.css` is an export subpath in docs/consuming.md.
      const claims = pathClaims('`/renderer/styles.css`', scope);
      expect(claims.build).toEqual([]);
      expect(claims.declined).toEqual(['/renderer/styles.css']);
    });
  });

  describe('relative', () => {
    /**
     * The second break #152 reports. `docs/architecture.md` writes module paths
     * from inside `src/`, and every one of them was invisible.
     */
    it('collects a module path written from inside the source tree', () => {
      expect(pathClaims('`native/llama-host.ts` supervises.', scope).relative).toEqual([
        'native/llama-host.ts',
      ]);
    });

    it('collects one written from a different depth in the same row', () => {
      expect(pathClaims('`host/crash-artifacts.ts`', scope).relative).toEqual([
        'host/crash-artifacts.ts',
      ]);
    });

    it('collects one whose directory is capitalised', () => {
      expect(pathClaims('`Components/Panel.ts`', scope).relative).toEqual([
        'Components/Panel.ts',
      ]);
    });

    it('needs a directory, so a bare file name is not one', () => {
      const claims = pathClaims('`llama-worker.ts`', scope);
      expect(claims.relative).toEqual([]);
      expect(claims.declined).toEqual(['llama-worker.ts']);
    });

    it('declines a package specifier and another repository', () => {
      const claims = pathClaims('`@radix-ui/react-tabs` and `stuffbucket/maximal`', scope);
      expect(claims.relative).toEqual([]);
      expect(claims.declined).toEqual(['@radix-ui/react-tabs', 'stuffbucket/maximal']);
    });

    it('declines a relative import and an export subpath', () => {
      const claims = pathClaims('`./renderer/styles.css` and `../harness.js`', scope);
      expect(claims.relative).toEqual([]);
      expect(claims.declined).toEqual(['./renderer/styles.css', '../harness.js']);
    });

    it('declines a dot directory, which is configuration and not a module', () => {
      const claims = pathClaims('`.storybook/preview.css`', scope);
      expect(claims.relative).toEqual([]);
      expect(claims.declined).toEqual(['.storybook/preview.css']);
    });

    it("declines somebody else's installed tree", () => {
      const claims = pathClaims('`node_modules/electron/index.js`', scope);
      expect(claims.relative).toEqual([]);
      expect(claims.declined).toEqual(['node_modules/electron/index.js']);
    });

    it('declines a name carrying no module extension', () => {
      const claims = pathClaims('`demo/edits/*.json`', scope);
      expect(claims.relative).toEqual([]);
      expect(claims.declined).toEqual(['demo/edits/*.json']);
    });
  });

  describe('declined', () => {
    /**
     * The number this reports is only worth printing if nothing falls out of
     * the partition, which is the defect #152 names: the spans under no root
     * were dropped, and the run reported the rest as its scope.
     */
    it('takes every path-shaped span that no bucket claims', () => {
      const text = '`scripts/a.mjs` `.vite/build/main.js` `native/b.ts` `openai/codex` `icon.png`';
      const claims = pathClaims(text, scope);
      expect(claims.repo).toEqual(['scripts/a.mjs']);
      expect(claims.build).toEqual(['.vite/build/main.js']);
      expect(claims.relative).toEqual(['native/b.ts']);
      expect(claims.declined).toEqual(['openai/codex', 'icon.png']);
    });

    it('does not read a version or an address as a file name', () => {
      // `v0.0.2`, `0.0.4` and `127.0.0.1` all end in a dot and a digit, and
      // `v1.2.3-alpha.1` carries a dot and a letter that ends nothing.
      const text = '`v0.0.2` `0.0.4` `127.0.0.1` `^0.83.0` `v1.2.3-alpha.1`';
      expect(pathClaims(text, scope).declined).toEqual([]);
    });

    it('needs the extension to end the span, not merely to appear in it', () => {
      // A settings key, not a file called `bounds`. `options.theme` and
      // `process.arch` are the shape this shares.
      expect(pathClaims('`window.bounds.0`', scope).declined).toEqual([]);
    });

    it('reads a bare file name as declined rather than as nothing', () => {
      expect(pathClaims('`llama-worker.ts` and `app.asar`', scope).declined).toEqual([
        'llama-worker.ts',
        'app.asar',
      ]);
    });

    it('declines nothing inside a fenced block', () => {
      const text = ['```', 'another-project/file.ts', '```'].join('\n');
      expect(pathClaims(text, scope).declined).toEqual([]);
    });
  });
});

describe('constants', () => {
  it('finds a backticked SCREAMING_SNAKE name', () => {
    expect(constants('`MIN_BYTES_PER_PIXEL` is the floor.')).toEqual([
      'MIN_BYTES_PER_PIXEL',
    ]);
  });

  it('finds an environment variable, which shares the shape', () => {
    expect(constants('Set `STUFFBUCKET_E2E` to 1.')).toEqual(['STUFFBUCKET_E2E']);
  });

  it('ignores short all-caps words that are prose', () => {
    // `ID`, `URL` and `CSP` appear in these documents as words, not symbols.
    expect(constants('The `ID` in the `CSP` and the `URL`.')).toEqual([]);
  });

  it('ignores a name that is not backticked', () => {
    expect(constants('READ_ONLY_TOOLS was the old name.')).toEqual([]);
  });

  it('ignores mixed case, which is a function rather than a constant', () => {
    expect(constants('`riskOf` and `getCurrentFuseWire`.')).toEqual([]);
  });
});

describe('links', () => {
  it('finds a relative target', () => {
    expect(links('See [the harness](./harness.ts).')).toEqual(['./harness.ts']);
  });

  it('strips an anchor, because the file is what has to exist', () => {
    expect(links('[a section](../AGENTS.md#tests)')).toEqual(['../AGENTS.md']);
  });

  it('ignores an external link', () => {
    // Reachability is a network question, and a check that needs the network
    // fails for reasons that have nothing to do with the change under review.
    expect(links('[docs](https://example.com/a) and [mail](mailto:a@b.c)')).toEqual(
      [],
    );
  });

  it('ignores a link over plain http as well as https', () => {
    expect(links('[docs](http://example.com/a)')).toEqual([]);
  });

  it('ignores a bare anchor', () => {
    expect(links('[up](#top)')).toEqual([]);
  });
});

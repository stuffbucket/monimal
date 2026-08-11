import * as Tooltip from '@radix-ui/react-tooltip';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Avatar, Profile } from '../src/renderer/components/Profile.js';
import { Diagnostics } from '../src/renderer/components/settings/Diagnostics.js';
import { ModelCards } from '../src/renderer/components/settings/ModelCards.js';
import { Usage } from '../src/renderer/components/settings/Usage.js';
import type { Account } from '../src/renderer/lib/account.js';
import { sampleUsage, SAMPLE_MODELS } from '../src/renderer/lib/sample-settings.js';

/**
 * The rendered surfaces.
 *
 * Markup rather than a browser, so what is asserted is what a component
 * decides: which name a control carries, which value reaches the page. Layout
 * is not a question this can answer, and `e2e/shell.spec.ts` asks it instead.
 *
 * The two dialogs are absent on purpose. Radix portals them, and
 * `renderToStaticMarkup` has no document to portal into. Their behaviour is
 * asserted in `*.stories.tsx`, which `npm run storybook:check` drives.
 */

const NOW = 1_700_000_000_000;

const ada: Account = {
  id: 'user-1',
  displayName: 'Ada Lovelace',
  handle: 'ada@example.com',
  plan: 'Pro',
};

function withTooltips(node: React.ReactNode): string {
  return renderToStaticMarkup(<Tooltip.Provider>{node}</Tooltip.Provider>);
}

describe('Avatar', () => {
  it('shows the picture when there is one', () => {
    const markup = renderToStaticMarkup(
      <Avatar account={{ ...ada, avatarUrl: 'https://example.com/a.png' }} />,
    );
    expect(markup).toContain('src="https://example.com/a.png"');
    // The button around it already carries the name. A second announcement of
    // it is noise, so the image is decorative.
    expect(markup).toContain('alt=""');
  });

  it('falls back to initials when there is not', () => {
    const markup = renderToStaticMarkup(<Avatar account={ada} />);
    expect(markup).toContain('AL');
    expect(markup).not.toContain('<img');
  });

  it('shows nobody when nobody is signed in', () => {
    const markup = renderToStaticMarkup(<Avatar />);
    expect(markup).toContain('avatar--anon');
  });
});

describe('Profile', () => {
  it('names the account it was handed', () => {
    const markup = withTooltips(<Profile account={ada} onOpen={vi.fn()} />);
    expect(markup).toContain('aria-label="Account: Ada Lovelace"');
  });

  it('says so when it was handed nobody', () => {
    // The control stays, because signing in is what it is there to offer.
    const markup = withTooltips(<Profile onOpen={vi.fn()} />);
    expect(markup).toContain('aria-label="Account: not signed in"');
  });

  it('knows nothing about an identity provider', () => {
    const markup = withTooltips(<Profile account={ada} onOpen={vi.fn()} />);
    expect(markup).not.toContain('example.com');
    expect(markup).not.toContain('Pro');
  });
});

describe('ModelCards', () => {
  it('states what each model is and what it can do', () => {
    const markup = renderToStaticMarkup(
      <ModelCards models={SAMPLE_MODELS} loadedAtMs={NOW - 60_000} nowMs={NOW} />,
    );

    expect(markup).toContain('Claude Sonnet 4.5');
    expect(markup).toContain('claude-sonnet-4-5');
    expect(markup).toContain('Chat models (3)');
    expect(markup).toContain('Embeddings (1)');
    expect(markup).toContain('200K');
    expect(markup).toContain('Reasoning');
    expect(markup).toContain('Updated 1m ago');
  });

  it('says the catalogue was never pulled rather than showing an age', () => {
    const markup = renderToStaticMarkup(<ModelCards models={[]} nowMs={NOW} />);
    expect(markup).toContain('Not loaded yet');
    expect(markup).toContain('No models cached yet.');
  });
});

describe('Diagnostics', () => {
  it('reports every group it is given, and where the logs are', () => {
    const markup = renderToStaticMarkup(
      <Diagnostics
        groups={[
          {
            id: 'runtime',
            label: 'Runtime',
            entries: [{ label: 'Electron', value: '43.2.0' }],
          },
        ]}
        logs={{ path: '/tmp/logs', retentionDays: 7 }}
      />,
    );

    expect(markup).toContain('Runtime');
    expect(markup).toContain('43.2.0');
    expect(markup).toContain('/tmp/logs');
    expect(markup).toContain('7 days');
  });

  it('offers no reveal button without a host to reveal with', () => {
    const markup = renderToStaticMarkup(<Diagnostics groups={[]} />);
    expect(markup).not.toContain('Reveal logs');
    expect(markup).not.toContain('Reveal configuration');
    expect(markup).toContain('Nothing to report yet.');
  });
});

describe('Usage', () => {
  it('counts the four token classes and the period total', () => {
    const markup = renderToStaticMarkup(
      <Usage report={sampleUsage(NOW)} period="day" onPeriodChange={vi.fn()} nowMs={NOW} />,
    );

    expect(markup).toContain('Cached input');
    expect(markup).toContain('335K');
    expect(markup).toContain('0.512 AIU');
    expect(markup).toContain('Today:');
    // The events table dates itself from the clock it was given.
    expect(markup).toContain('12s ago');
  });

  it('says a period had no traffic rather than drawing empty bars', () => {
    const empty = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheCreation: 0,
      requests: 0,
      total: 0,
      nanoCost: 0,
    };
    const markup = renderToStaticMarkup(
      <Usage
        report={{ totals: empty, byProvider: [], byModel: [], events: [] }}
        period="week"
        onPeriodChange={vi.fn()}
        nowMs={NOW}
      />,
    );

    expect(markup).toContain('No traffic the last 7 days.');
  });
});

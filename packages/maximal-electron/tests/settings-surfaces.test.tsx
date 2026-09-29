import * as Tooltip from '@radix-ui/react-tooltip';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Avatar, Profile } from '../src/renderer/components/Profile.js';
import { SettingsDisclosure } from '../src/renderer/components/settings/SettingsDisclosure.js';
import type { Account } from '../src/renderer/lib/account.js';

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
    expect(markup).toContain(
      'background-image:url(&quot;https://example.com/a.png&quot;)',
    );
    expect(markup).toContain('aria-hidden="true"');
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
    const markup = withTooltips(<Profile onOpen={vi.fn()} />);
    expect(markup).toContain('aria-label="Account: not signed in"');
  });

  it('knows nothing about an identity provider', () => {
    const markup = withTooltips(<Profile account={ada} onOpen={vi.fn()} />);
    expect(markup).not.toContain('example.com');
    expect(markup).not.toContain('Pro');
  });
});

describe('SettingsDisclosure', () => {
  it('keeps header actions outside the disclosure summary', () => {
    const markup = renderToStaticMarkup(
      <SettingsDisclosure
        title="Ollama"
        action={<button type="button">Enabled</button>}
      >
        Details
      </SettingsDisclosure>,
    );

    expect(markup.indexOf('</summary>')).toBeLessThan(
      markup.indexOf('Enabled'),
    );
  });
});

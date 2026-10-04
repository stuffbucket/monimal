import type { Meta, StoryObj } from '@maximal/maximal-storybook';
import type { ReactNode } from 'react';

/**
 * The design tokens, on screen.
 *
 * Every value here is read from the live custom property rather than written
 * out, so this page cannot drift from `tokens.css`. A renamed token shows up as
 * a blank swatch, which is the point: the alternative is a hand-maintained
 * palette that agrees with the stylesheet until the day it does not.
 */

function Grid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
        gap: 'var(--space-3)',
      }}
    >
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 'var(--space-6)' }}>
      <h3
        style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 'var(--weight-lg)',
          letterSpacing: 'var(--tracking-caps)',
          textTransform: 'uppercase',
          color: 'var(--maximal-color-text-tertiary)',
          marginBottom: 'var(--space-3)',
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function Name({ token }: { token: string }) {
  return (
    <code
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        color: 'var(--maximal-color-text-secondary)',
      }}
    >
      {token}
    </code>
  );
}

function Swatch({ token }: { token: string }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
      <div
        style={{
          height: 44,
          borderRadius: 'var(--radius-card)',
          background: `var(${token})`,
          border: '1px solid var(--maximal-color-border-default)',
        }}
      />
      <Name token={token} />
    </div>
  );
}

const SURFACES = [
  '--maximal-color-bg-default',
  '--maximal-color-bg-secondary',
  '--maximal-color-bg-tertiary',
  '--maximal-color-bg-hover',
  '--maximal-color-bg-pressed',
];

const LINES = [
  '--maximal-color-border-default',
  '--maximal-color-border-strong',
  '--maximal-color-border-strong-hover',
];

const INK = [
  '--maximal-color-text-default',
  '--maximal-color-text-secondary',
  '--maximal-color-text-tertiary',
  '--maximal-color-text-danger',
];

const SEMANTIC = [
  '--maximal-color-text-brand',
  '--maximal-color-bg-selected',
  '--maximal-color-text-success',
  '--maximal-color-bg-success-secondary',
  '--maximal-color-text-warning',
  '--maximal-color-bg-warning-secondary',
  '--maximal-color-text-danger',
  '--maximal-color-bg-danger-secondary',
];

const TYPE = [
  '--text-xs',
  '--text-sm',
  '--text-base',
  '--text-md',
  '--text-lg',
  '--text-xl',
];

const SPACE = [1, 2, 3, 4, 5, 6, 7].map((n) => `--space-${String(n)}`);
const RADII = ['--radius-chip', '--radius-input', '--radius-card', '--radius-dialog'];
const CONTROLS = ['--control-sm', '--control-md', '--control-lg'];

function Palette() {
  return (
    <div style={{ maxWidth: 980 }}>
      <Section title="Surfaces">
        <Grid>
          {SURFACES.map((t) => (
            <Swatch key={t} token={t} />
          ))}
        </Grid>
      </Section>

      <Section title="Lines">
        <Grid>
          {LINES.map((t) => (
            <Swatch key={t} token={t} />
          ))}
        </Grid>
      </Section>

      <Section title="Ink">
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          {INK.map((t) => (
            <div key={t} style={{ color: `var(${t})` }}>
              The quick brown fox jumps over the lazy dog. <Name token={t} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Semantic">
        <Grid>
          {SEMANTIC.map((t) => (
            <Swatch key={t} token={t} />
          ))}
        </Grid>
      </Section>

      <Section title="Type ramp">
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          {TYPE.map((t) => (
            <div key={t} style={{ fontSize: `var(${t})` }}>
              Ramp <Name token={t} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Spacing">
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          {SPACE.map((t) => (
            <div
              key={t}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
            >
              <span
                style={{
                  width: `var(${t})`,
                  height: 12,
                  background: 'var(--maximal-color-bg-brand)',
                  borderRadius: 2,
                }}
              />
              <Name token={t} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Radii">
        <Grid>
          {RADII.map((t) => (
            <div key={t} style={{ display: 'grid', gap: 'var(--space-1)' }}>
              <div
                style={{
                  height: 44,
                  background: 'var(--maximal-color-bg-tertiary)',
                  border: '1px solid var(--maximal-color-border-strong)',
                  borderRadius: `var(${t})`,
                }}
              />
              <Name token={t} />
            </div>
          ))}
        </Grid>
      </Section>

      <Section title="Control heights">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-4)' }}>
          {CONTROLS.map((t) => (
            <div key={t} style={{ display: 'grid', gap: 'var(--space-1)' }}>
              <div
                style={{
                  width: 64,
                  height: `var(${t})`,
                  background: 'var(--maximal-color-bg-tertiary)',
                  border: '1px solid var(--maximal-color-border-strong)',
                  borderRadius: 'var(--radius-input)',
                }}
              />
              <Name token={t} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Elevation">
        <Grid>
          {['--elevation-card', '--elevation-popover', '--elevation-dialog'].map((t) => (
            <div key={t} style={{ display: 'grid', gap: 'var(--space-1)' }}>
              <div
                style={{
                  height: 60,
                  background: 'var(--maximal-color-bg-tertiary)',
                  borderRadius: 'var(--radius-card)',
                  boxShadow: `var(${t})`,
                }}
              />
              <Name token={t} />
            </div>
          ))}
        </Grid>
      </Section>

      <Section title="Focus ring">
        <p
          style={{
            color: 'var(--maximal-color-text-secondary)',
            fontSize: 'var(--text-sm)',
            marginTop: 0,
          }}
        >
          Tab to these. One ring, from{' '}
          <Name token="--focus-ring-width" />, <Name token="--focus-ring-offset" /> and{' '}
          <Name token="--maximal-color-border-selected" />. It was written out five times in three
          geometries before it had a name.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button type="button" className="row" style={{ width: 140 }}>
            Focus me
          </button>
          <button type="button" className="row" style={{ width: 140 }}>
            And me
          </button>
        </div>
      </Section>
    </div>
  );
}

const meta = {
  title: 'Foundation/Tokens',
  component: Palette,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Palette>;

export default meta;

export const All: StoryObj<typeof meta> = {};

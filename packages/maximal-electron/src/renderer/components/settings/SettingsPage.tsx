import type { ReactNode } from 'react';

import { useComponentStyles } from '../../lib/component-styles.js';

/**
 * The rules the settings frame draws itself with.
 *
 * They travel with the component rather than with a stylesheet, so exporting
 * one ships the other. `src/renderer/lib/component-styles.ts` says why.
 *
 * Every value here is a token. A settings surface is hosted in a tab on
 * `--shell-bg-canvas` and in a dialog on `--shell-bg-panel`, which is why no
 * rule sets a background on the frame: the surface it lands on supplies one.
 *
 * Exported because the surfaces that render into this frame are not all inside
 * it — a dialog draws its own container and uses these rows.
 */
export const SETTINGS_STYLES = `
/*
 * The frame's own geometry. A line length is a reading decision rather than a
 * step on the spacing ramp, so it is this sheet's token, declared with a value
 * and overridable at the root.
 */
.sb-shell {
  --shell-settings-measure: 68ch;
}
.sb-shell .settings {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.sb-shell .settings__header {
  display: flex;
  align-items: flex-start;
  gap: var(--shell-space-2);
  padding: var(--shell-space-4);
  flex: none;
  border-bottom: 1px solid var(--shell-border);
}

.sb-shell .settings__heading {
  display: grid;
  gap: var(--shell-space-1);
  min-width: 0;
}

.sb-shell .settings__grow {
  flex: 1;
}

.sb-shell .settings__title {
  font-size: var(--shell-text-md);
  font-weight: var(--shell-weight-lg);
  color: var(--shell-text);
  margin: 0;
}

.sb-shell .settings__description {
  margin: 0;
  font-size: var(--shell-text-sm);
  line-height: var(--shell-leading-base);
  color: var(--shell-text-subtle);
  max-width: var(--shell-settings-measure);
}

.sb-shell .settings__note {
  font-size: var(--shell-text-xs);
  color: var(--shell-text-subtle);
  white-space: nowrap;
  align-self: center;
}

.sb-shell .settings__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--shell-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-5);
}

/* Inside a dialog the body is the dialog, which already scrolls and pads. */
.sb-shell .dialog .settings__section {
  gap: var(--shell-space-2);
}

.sb-shell .settings__section {
  display: grid;
  gap: var(--shell-space-3);
  align-content: start;
}

.sb-shell .settings__section-title {
  margin: 0;
  font-size: var(--shell-text-base);
  font-weight: var(--shell-weight-lg);
  color: var(--shell-text);
}

.sb-shell .settings__summary {
  margin: 0;
  font-size: var(--shell-text-base);
  line-height: var(--shell-leading-base);
  color: var(--shell-text);
}

.sb-shell .settings__row {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2);
}

/*
 * A wider label column than the inspector's.
 *
 * '.field' is sized for a 22 percent side panel, where 74px is most of the
 * width. A settings surface has the whole document, and at 74px "Models
 * cached" wrapped to two lines beside a single-character value.
 */
.sb-shell .settings .field,
.sb-shell .dialog .field {
  grid-template-columns: minmax(0, 150px) 1fr;
}

/*
 * A value with a control beside it.
 *
 * '.field__value' is a span, and an inline-flex button in one sits on the text
 * baseline rather than beside it: the copy button overlapped the end of the
 * endpoint URL. A flex row puts them next to each other and wraps when there
 * is no room.
 */
.sb-shell .settings .field__value,
.sb-shell .dialog .field__value {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--shell-space-2);
}

/* An input and the button that submits it. The button aligns to the field,
   not to the label above it. */
.sb-shell .settings__row--bottom {
  align-items: flex-end;
}

.sb-shell .settings__row--end {
  justify-content: flex-end;
}
`;

/**
 * The frame a settings surface hosted in a tab draws.
 *
 * A title, a sentence saying what the surface is for, the actions that apply
 * to the whole surface, and a scrolling body. Three surfaces need exactly
 * this, which is why it is here rather than written out three times.
 *
 * `h1` because a tab panel is the document. The sections inside use `h2`.
 */
export function SettingsPage({
  title,
  description,
  actions,
  children,
  testId,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  useComponentStyles('settings-page', SETTINGS_STYLES);

  return (
    <div className="settings" data-testid={testId}>
      <header className="settings__header">
        <div className="settings__heading">
          <h1 className="settings__title">{title}</h1>
          {description !== undefined && (
            <p className="settings__description">{description}</p>
          )}
        </div>
        <span className="settings__grow" />
        {actions}
      </header>

      <div className="settings__body">{children}</div>
    </div>
  );
}

/** A titled block inside a settings surface. */
export function SettingsSection({
  title,
  description,
  children,
  as: Heading = 'h2',
  testId,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  /** A dialog's own title is `h2`, so a section inside one is `h3`. */
  as?: 'h2' | 'h3';
  testId?: string;
}) {
  useComponentStyles('settings-page', SETTINGS_STYLES);

  return (
    <section className="settings__section" data-testid={testId}>
      <Heading className="settings__section-title">{title}</Heading>
      {description !== undefined && (
        <p className="settings__description">{description}</p>
      )}
      {children}
    </section>
  );
}

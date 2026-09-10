import { ChevronRight } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { useComponentStyles } from '../../lib/component-styles.js';

const SETTINGS_DISCLOSURE_STYLES = `
.sb-shell .settings-disclosure-list {
  border-top: 1px solid var(--shell-border-strong, var(--shell-border));
}
.sb-shell .settings-disclosure {
  border-bottom: 1px solid var(--shell-border-strong, var(--shell-border));
}
.sb-shell .settings-disclosure__summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--shell-space-2);
  min-height: calc(var(--shell-control-lg) + var(--shell-space-4));
  padding: var(--shell-space-2);
  cursor: pointer;
}
.sb-shell .settings-disclosure__summary::-webkit-details-marker { display: none; }
.sb-shell .settings-disclosure__summary:hover,
.sb-shell .settings-disclosure[open] .settings-disclosure__summary {
  background: var(--shell-hover);
}
.sb-shell .settings-disclosure__summary:focus-visible {
  outline: var(--shell-focus-ring-width) solid var(--shell-focus, var(--shell-accent));
  outline-offset: var(--shell-focus-ring-offset);
}
.sb-shell .settings-disclosure__chevron {
  color: var(--shell-text-muted);
  transition: transform 120ms ease-out;
}
.sb-shell .settings-disclosure[open] .settings-disclosure__chevron {
  transform: rotate(90deg);
}
.sb-shell .settings-disclosure__content {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-1);
  min-width: 0;
}
.sb-shell .settings-disclosure__title {
  margin: 0;
  color: var(--shell-text);
  font-size: var(--shell-text-md);
  font-weight: var(--shell-weight-lg);
}
.sb-shell .settings-disclosure__description,
.sb-shell .settings-disclosure__meta {
  color: var(--shell-text-muted);
  font-size: var(--shell-text-sm);
}
.sb-shell .settings-disclosure__description {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sb-shell .settings-disclosure__meta { white-space: nowrap; }
.sb-shell .settings-disclosure__body {
  padding: var(--shell-space-3) var(--shell-space-2) var(--shell-space-4)
    calc(var(--shell-control-lg) + var(--shell-space-2));
}
`;

/** A divided list of progressive-disclosure rows in a settings section. */
export function SettingsDisclosureList({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  useComponentStyles('settings-disclosure', SETTINGS_DISCLOSURE_STYLES);
  return <div className="settings-disclosure-list">{children}</div>;
}

/** A compact settings row that reveals its controls without becoming a card. */
export function SettingsDisclosure({
  title,
  description,
  meta,
  children,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  children: ReactNode;
}): ReactElement {
  useComponentStyles('settings-disclosure', SETTINGS_DISCLOSURE_STYLES);

  return (
    <details className="settings-disclosure">
      <summary className="settings-disclosure__summary">
        <ChevronRight className="settings-disclosure__chevron" aria-hidden="true" size={16} />
        <span className="settings-disclosure__content">
          <h3 className="settings-disclosure__title">{title}</h3>
          {description ? (
            <span className="settings-disclosure__description">{description}</span>
          ) : null}
        </span>
        {meta ? <span className="settings-disclosure__meta">{meta}</span> : null}
      </summary>
      <div className="settings-disclosure__body">{children}</div>
    </details>
  );
}
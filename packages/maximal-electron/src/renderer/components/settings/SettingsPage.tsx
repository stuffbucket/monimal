import type { ReactNode } from 'react';

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

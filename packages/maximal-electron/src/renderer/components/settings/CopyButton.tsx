import { Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '../controls/Button.js';

/**
 * Copy, and say so.
 *
 * The parked shell flipped the button's own text rather than raising a toast,
 * which keeps the confirmation next to the thing that was copied. Four
 * surfaces here need it: an endpoint URL, a key, an install command, and a
 * diagnostics bundle.
 */

/** Best effort. The clipboard is absent outside a secure context. */
export function copyText(text: string): void {
  const clipboard: Clipboard | undefined = navigator.clipboard;
  if (!clipboard) return;
  void clipboard.writeText(text).catch(() => undefined);
}

const CONFIRMATION_MS = 1500;

export function CopyButton({
  text,
  label = 'Copy',
  about,
  testId,
}: {
  text: string;
  label?: string;
  /**
   * What is being copied, for the accessible name.
   *
   * A dialog with four copy buttons announces four controls called "Copy".
   * The visible word stays, so the accessible name still starts with it.
   */
  about?: string;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const visible = copied ? 'Copied' : label;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      setCopied(false);
    }, CONFIRMATION_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  return (
    <Button
      size="sm"
      testId={testId}
      aria-label={about === undefined ? undefined : `${visible} ${about}`}
      onClick={() => {
        copyText(text);
        setCopied(true);
      }}
    >
      <Copy size={14} />
      {visible}
    </Button>
  );
}

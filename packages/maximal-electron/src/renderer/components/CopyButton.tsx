import * as Tooltip from '@radix-ui/react-tooltip';
import { Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useShellContent } from '../lib/content.js';
import { IconButton } from './controls/Button.js';

/** Best effort. The clipboard is absent outside a secure context. */
export function copyText(text: string): void {
  const clipboard: Clipboard | undefined = navigator.clipboard;
  if (!clipboard) return;
  void clipboard.writeText(text).catch(() => undefined);
}

const CONFIRMATION_MS = 1500;

/** An icon action that copies text and briefly confirms completion. */
export function CopyButton({
  text,
  label,
  about,
  testId,
}: {
  text: string;
  /** Defaults to the catalogue's word for it. */
  label?: string;
  /** What is being copied, for the tooltip and accessible name. */
  about?: string;
  testId?: string;
}) {
  const content = useShellContent().chrome;
  const [copied, setCopied] = useState(false);
  const action = copied ? content.copied : (label ?? content.copy);
  const accessibleLabel = about === undefined ? action : `${action} ${about}`;

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
    <Tooltip.Provider delayDuration={400}>
      <IconButton
        testId={testId}
        label={accessibleLabel}
        tooltip={accessibleLabel}
        onClick={() => {
          copyText(text);
          setCopied(true);
        }}
      >
        <Copy size={14} />
      </IconButton>
    </Tooltip.Provider>
  );
}
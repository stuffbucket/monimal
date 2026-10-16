import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'

import { IconButton } from '../../primitives/button'
import { Tooltip } from '../overlays/overlays'

/* How long the copied confirmation stays before the button returns to rest. */
const CONFIRMATION_MS = 1500

/** Best effort: the clipboard is absent outside a secure context. */
async function copyText(text: string): Promise<boolean> {
  const clipboard: Clipboard | undefined = globalThis.navigator?.clipboard
  if (!clipboard) return false
  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export interface CopyButtonProps {
  /** The text written to the clipboard. */
  text: string
  /** What is being copied, appended to the label for the tooltip and accessible name. */
  about?: string | undefined
  label?: string | undefined
  copiedLabel?: string | undefined
  disabled?: boolean | undefined
  className?: string | undefined
  onCopied?: (() => void) | undefined
}

/** An icon action that copies text and briefly confirms completion. */
export function CopyButton({
  text,
  about,
  label = 'Copy',
  copiedLabel = 'Copied',
  disabled,
  className,
  onCopied,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const action = copied ? copiedLabel : label
  const name = about === undefined ? action : `${action} ${about}`

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), CONFIRMATION_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const button = (
    <IconButton
      {...(className === undefined ? {} : { className })}
      data-copied={copied ? '' : undefined}
      disabled={disabled === true}
      label={name}
      onClick={() => {
        void copyText(text).then((written) => {
          if (!written) return
          setCopied(true)
          onCopied?.()
        })
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    </IconButton>
  )

  return <Tooltip trigger={button}>{name}</Tooltip>
}

import { ScrollArea } from './surfaces'

export type TerminalLineTone = 'command' | 'output' | 'success' | 'muted'

export interface TerminalLine {
  id: string
  content: string
  tone?: TerminalLineTone
}

export interface TerminalProps {
  label: string
  lines: readonly TerminalLine[]
}

export function Terminal({ label, lines }: TerminalProps) {
  return (
    <section className="maximal-terminal" aria-label={label}>
      <ScrollArea
        className="maximal-terminal__scroll-area"
        contentClassName="maximal-terminal__content"
        viewportClassName="maximal-terminal__viewport"
      >
        {lines.map((line) => (
          <div
            className="maximal-terminal__line"
            data-tone={line.tone ?? 'output'}
            key={line.id}
          >
            {line.content}
          </div>
        ))}
      </ScrollArea>
    </section>
  )
}

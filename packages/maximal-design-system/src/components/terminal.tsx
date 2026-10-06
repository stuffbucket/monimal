import { ScrollArea } from '@base-ui/react/scroll-area'

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
      <ScrollArea.Root className="maximal-terminal__scroll-area">
        <ScrollArea.Viewport className="maximal-terminal__viewport">
          <ScrollArea.Content className="maximal-terminal__content">
            {lines.map((line) => (
              <div
                className="maximal-terminal__line"
                data-tone={line.tone ?? 'output'}
                key={line.id}
              >
                {line.content}
              </div>
            ))}
          </ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className="maximal-scrollbar" orientation="vertical">
          <ScrollArea.Thumb className="maximal-scrollbar__thumb" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </section>
  )
}

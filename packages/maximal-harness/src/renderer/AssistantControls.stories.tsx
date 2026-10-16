import { useEffect, useState, type ReactNode } from 'react';

import {
  Button,
  Dialog,
  MenuItem,
  MenuRoot,
  Tooltip,
} from '@maximal/maximal-design-system';

import '../styles.css';
import './AssistantControls.stories.css';

interface StoryContext {
  canvasElement: HTMLElement;
}

interface Story {
  render: () => ReactNode;
  play: (context: StoryContext) => Promise<void>;
}

const MODEL_ITEMS = [
  {
    label: 'Summarize lorem ipsum',
    description: 'Condense the selected passage into a concise response.',
  },
  {
    label: 'Explain dolor sit amet',
    description: 'Describe the passage with additional context and examples.',
  },
  {
    label: 'Refactor consectetur',
    description: 'Propose a clearer structure without changing its meaning.',
  },
] as const;

function StorySurface({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.body.classList.add('mh-overlay-body');
    return () => document.body.classList.remove('mh-overlay-body');
  }, []);
  return children;
}

function AssistantControlGallery() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(MODEL_ITEMS[0].label);

  return (
    <StorySurface>
      <main className="assistant-controls">
        <header className="assistant-controls__header">
          <span className="assistant-controls__eyebrow">Assistant controls</span>
          <h1>Composed with the Maximal design system</h1>
          <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Use these
            populated states to verify focus, selection, dismissal, and content
            density.
          </p>
        </header>

        <section className="assistant-controls__section" aria-labelledby="assistant-buttons">
          <div>
            <h2 id="assistant-buttons">Actions</h2>
            <p>Primary, secondary, and destructive assistant decisions.</p>
          </div>
          <div className="assistant-controls__row">
            <Button variant="primary">Send lorem response</Button>
            <Button>Save dolor draft</Button>
            <Button variant="danger">Discard consectetur</Button>
          </div>
        </section>

        <section className="assistant-controls__section" aria-labelledby="assistant-menu">
          <div>
            <h2 id="assistant-menu">Selection menu</h2>
            <p>Choose a populated assistant task and confirm menu focus behavior.</p>
          </div>
          <MenuRoot
            popupProps={{ 'data-testid': 'assistant-controls-menu' }}
            trigger={(
              <Button
                className="mh-select-trigger"
                data-testid="assistant-controls-menu-trigger"
              >
                <span>{selectedModel}</span>
                <span aria-hidden="true">⌄</span>
              </Button>
            )}
          >
            {MODEL_ITEMS.map((item) => (
              <MenuItem
                description={item.description}
                key={item.label}
                onClick={() => setSelectedModel(item.label)}
              >
                {item.label}
              </MenuItem>
            ))}
          </MenuRoot>
        </section>

        <section className="assistant-controls__section" aria-labelledby="assistant-composer">
          <div>
            <h2 id="assistant-composer">Composer</h2>
            <p>Prompt input, attachment affordance, and submission action.</p>
          </div>
          <div className="assistant-controls__composer">
            <textarea
              aria-label="Assistant prompt"
              defaultValue="Lorem ipsum dolor sit amet. Explain how consectetur adipiscing affects this implementation."
              rows={3}
            />
            <div className="assistant-controls__composer-actions">
              <Tooltip
                trigger={(
                  <button
                    aria-label="Attach lorem fixture"
                    className="mh-composer__button"
                    type="button"
                  >
                    +
                  </button>
                )}
              >
                Attach a lorem fixture
              </Tooltip>
              <Tooltip
                trigger={(
                  <button
                    aria-label="Send lorem prompt"
                    className="mh-composer__button mh-composer__button-send"
                    type="button"
                  >
                    ↑
                  </button>
                )}
              >
                Send lorem prompt
              </Tooltip>
            </div>
          </div>
        </section>

        <section className="assistant-controls__section" aria-labelledby="assistant-dialog">
          <div>
            <h2 id="assistant-dialog">Confirmation dialog</h2>
            <p>Open the modeless assistant confirmation surface.</p>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            data-testid="assistant-controls-dialog-trigger"
          >
            Review assistant action
          </Button>
        </section>

        <section className="assistant-controls__section" aria-labelledby="assistant-response">
          <div>
            <h2 id="assistant-response">Response content</h2>
            <p>Representative answer, tool state, and status density.</p>
          </div>
          <article className="assistant-controls__response">
            <strong>Maximal</strong>
            <p>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
              eiusmod tempor incididunt ut labore et dolore magna aliqua.
            </p>
            <code>read_file · completed</code>
          </article>
        </section>
      </main>

      <Dialog
        className="assistant-controls__dialog"
        description="Lorem ipsum dolor sit amet, consectetur adipiscing elit."
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        showDescription
        showTitle
        popupProps={{ 'data-testid': 'assistant-controls-dialog' }}
        title="Review assistant action"
      >
        <p>
          The assistant will replace the selected consectetur passage with the
          proposed lorem implementation.
        </p>
        <div className="assistant-controls__row">
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => setDialogOpen(false)}
            variant="primary"
          >
            Apply change
          </Button>
        </div>
      </Dialog>
    </StorySurface>
  );
}

async function eventually(assertion: () => void): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  assertion();
}

function requireElement(document: Document, selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing assistant control: ${selector}`);
  return element;
}

const meta = {
  title: 'Assistant/Controls',
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
  },
};

export default meta;

export const Gallery: Story = {
  render: () => <AssistantControlGallery />,
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;

    requireElement(document, '[data-testid="assistant-controls-menu-trigger"]').click();
    await eventually(() => {
      const menu = requireElement(
        document,
        '[data-testid="assistant-controls-menu"]',
      );
      const items = menu.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (items.length !== MODEL_ITEMS.length) {
        throw new Error('Assistant menu does not show every populated item');
      }
      items[1]?.click();
    });
    await eventually(() => {
      const trigger = requireElement(
        document,
        '[data-testid="assistant-controls-menu-trigger"]',
      );
      if (!trigger.textContent?.includes(MODEL_ITEMS[1].label)) {
        throw new Error('Assistant menu selection did not update its trigger');
      }
    });

    requireElement(document, '[data-testid="assistant-controls-dialog-trigger"]').click();
    await eventually(() => {
      const dialog = requireElement(
        document,
        '[data-testid="assistant-controls-dialog"]',
      );
      if (!dialog.textContent?.includes('consectetur')) {
        throw new Error('Assistant dialog content is not visible');
      }
    });
  },
};

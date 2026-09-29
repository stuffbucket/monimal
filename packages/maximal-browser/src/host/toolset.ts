import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { Toolset } from '@maximal/maximal-harness/host';
import { Type } from 'typebox';

import type { BrowserHost } from './browser-host.js';

const sessionParameters = Type.Object({
  id: Type.String({
    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    description: 'Browser session id returned by browser_open or browser_list.',
  }),
});
const openParameters = Type.Object({
  url: Type.String({ maxLength: 8_192, description: 'HTTP or HTTPS URL to open.' }),
});
const navigateParameters = Type.Object({
  ...sessionParameters.properties,
  url: Type.String({ maxLength: 8_192, description: 'HTTP or HTTPS URL to navigate to.' }),
});
const commandParameters = Type.Object({
  ...sessionParameters.properties,
  command: Type.Union([
    Type.Literal('back'),
    Type.Literal('forward'),
    Type.Literal('reload'),
  ]),
});
const elementParameters = Type.Object({
  ...sessionParameters.properties,
  ref: Type.String({
    pattern: '^e\\d+$',
    description: 'Element reference returned by browser_inspect, such as e4.',
  }),
});
const typeParameters = Type.Object({
  ...elementParameters.properties,
  text: Type.String({ maxLength: 50_000, description: 'Text to enter or an option to select.' }),
  clear: Type.Optional(Type.Boolean({
    description: 'Replace existing content when true (default); append when false.',
  })),
});
const dragParameters = Type.Object({
  ...sessionParameters.properties,
  fromRef: elementParameters.properties.ref,
  toRef: elementParameters.properties.ref,
});
const pressParameters = Type.Object({
  ...sessionParameters.properties,
  key: Type.String({ maxLength: 16,
    description: 'Key to press, for example Enter, Escape, Tab, ArrowDown, or one printable character.',
  }),
});
const waitParameters = Type.Object({
  ...sessionParameters.properties,
  text: Type.Optional(Type.String({
    maxLength: 1_000,
    description: 'Visible text to wait for.',
  })),
  timeoutMs: Type.Optional(Type.Number({
    minimum: 0,
    maximum: 30_000,
    description: 'Maximum wait in milliseconds. Defaults to 5000.',
  })),
});
const scrollParameters = Type.Object({
  ...sessionParameters.properties,
  direction: Type.Union([
    Type.Literal('up'),
    Type.Literal('down'),
    Type.Literal('left'),
    Type.Literal('right'),
  ]),
  amount: Type.Optional(Type.Number({
    minimum: 1,
    maximum: 5_000,
    description: 'CSS pixels to scroll. Defaults to 600.',
  })),
});

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} };
}

function snapshotText(snapshot: Awaited<ReturnType<BrowserHost['inspect']>>): string {
  const elements = snapshot.elements.map((element) => {
    const value = element.value === undefined ? '' : ` value=${JSON.stringify(element.value)}`;
    const checked = element.checked === undefined ? '' : ` checked=${String(element.checked)}`;
    const disabled = element.disabled ? ' disabled' : '';
    return `[${element.ref}] ${element.role} ${JSON.stringify(element.name)}${value}${checked}${disabled}`;
  });
  return [
    `URL: ${snapshot.url}`,
    `Title: ${snapshot.title}`,
    '',
    'Interactive elements:',
    ...(elements.length > 0 ? elements : ['(none)']),
    '',
    'Visible text:',
    snapshot.text || '(none)',
  ].join('\n');
}

export function createBrowserToolset(host: BrowserHost): Toolset {
  const open: AgentTool<typeof openParameters, Record<string, never>> = {
    name: 'browser_open',
    label: 'Open browser',
    description: 'Open a URL in a browser tab shared with the user.',
    parameters: openParameters,
    execute: async (_toolCallId, { url }) => {
      const session = await host.open(url, 'agent');
      return textResult(JSON.stringify(session));
    },
  };
  const listParameters = Type.Object({});
  const listTabs: AgentTool<typeof listParameters, Record<string, never>> = {
    name: 'browser_list',
    label: 'List browser tabs',
    description: 'List browser tabs currently shared by the user or agent.',
    parameters: listParameters,
    execute: () => Promise.resolve(textResult(JSON.stringify(host.list()))),
  };
  const navigate: AgentTool<typeof navigateParameters, Record<string, never>> = {
    name: 'browser_navigate',
    label: 'Navigate browser',
    description: 'Navigate an existing shared browser tab to a URL.',
    parameters: navigateParameters,
    execute: async (_toolCallId, { id, url }) =>
      textResult(JSON.stringify(await host.navigate(id, url))),
  };
  const command: AgentTool<typeof commandParameters, Record<string, never>> = {
    name: 'browser_command',
    label: 'Control browser navigation',
    description: 'Go back, go forward, or reload a shared browser tab.',
    parameters: commandParameters,
    execute: (_toolCallId, { id, command: navigationCommand }) => {
      host.command(id, navigationCommand);
      return Promise.resolve(textResult(`Browser command completed: ${navigationCommand}.`));
    },
  };
  const close: AgentTool<typeof sessionParameters, Record<string, never>> = {
    name: 'browser_close',
    label: 'Close browser tab',
    description: 'Close a shared browser tab.',
    parameters: sessionParameters,
    execute: (_toolCallId, { id }) => {
      host.close(id);
      return Promise.resolve(textResult(`Closed browser session ${id}.`));
    },
  };
  const read: AgentTool<typeof sessionParameters, Record<string, never>> = {
    name: 'browser_read',
    label: 'Read browser',
    description: 'Read visible text from a shared browser tab.',
    parameters: sessionParameters,
    execute: async (_toolCallId, { id }) => textResult(await host.read(id)),
  };
  const inspect: AgentTool<typeof sessionParameters, Record<string, never>> = {
    name: 'browser_inspect',
    label: 'Inspect browser',
    description: 'Inspect visible page text and interactive elements, returning references for actions.',
    parameters: sessionParameters,
    execute: async (_toolCallId, { id }) => textResult(snapshotText(await host.inspect(id))),
  };
  const click: AgentTool<typeof elementParameters, Record<string, never>> = {
    name: 'browser_click',
    label: 'Click browser element',
    description: 'Click an element referenced by the latest browser_inspect result.',
    parameters: elementParameters,
    execute: async (_toolCallId, { id, ref }) => {
      await host.click(id, ref);
      return textResult(`Clicked ${ref}.`);
    },
  };
  const hover: AgentTool<typeof elementParameters, Record<string, never>> = {
    name: 'browser_hover',
    label: 'Hover browser element',
    description: 'Hover an element referenced by the latest browser_inspect result.',
    parameters: elementParameters,
    execute: async (_toolCallId, { id, ref }) => {
      await host.hover(id, ref);
      return textResult(`Hovered ${ref}.`);
    },
  };
  const type: AgentTool<typeof typeParameters, Record<string, never>> = {
    name: 'browser_type',
    label: 'Type in browser',
    description: 'Enter text into an editable element referenced by browser_inspect.',
    parameters: typeParameters,
    execute: async (_toolCallId, { id, ref, text, clear }) => {
      await host.type(id, ref, text, clear);
      return textResult(`Entered text in ${ref}.`);
    },
  };
  const drag: AgentTool<typeof dragParameters, Record<string, never>> = {
    name: 'browser_drag',
    label: 'Drag browser element',
    description: 'Drag one referenced element onto another referenced element.',
    parameters: dragParameters,
    execute: async (_toolCallId, { id, fromRef, toRef }) => {
      await host.drag(id, fromRef, toRef);
      return textResult(`Dragged ${fromRef} to ${toRef}.`);
    },
  };
  const press: AgentTool<typeof pressParameters, Record<string, never>> = {
    name: 'browser_press',
    label: 'Press browser key',
    description: 'Send one supported key to the focused element in a shared browser tab.',
    parameters: pressParameters,
    execute: (_toolCallId, { id, key }) => {
      host.press(id, key);
      return Promise.resolve(textResult(`Pressed ${key}.`));
    },
  };
  const wait: AgentTool<typeof waitParameters, Record<string, never>> = {
    name: 'browser_wait',
    label: 'Wait in browser',
    description: 'Wait for visible text or for a bounded duration in a shared browser tab.',
    parameters: waitParameters,
    execute: async (_toolCallId, { id, text, timeoutMs }, signal) => {
      await host.wait(id, { text, timeoutMs, signal });
      return textResult(text === undefined ? 'Wait completed.' : `Found visible text: ${text}`);
    },
  };
  const scroll: AgentTool<typeof scrollParameters, Record<string, never>> = {
    name: 'browser_scroll',
    label: 'Scroll browser',
    description: 'Scroll the page in a shared browser tab.',
    parameters: scrollParameters,
    execute: async (_toolCallId, { id, direction, amount }) => {
      await host.scroll(id, direction, amount);
      return textResult(`Scrolled ${direction}.`);
    },
  };
  const screenshot: AgentTool<typeof sessionParameters, Record<string, never>> = {
    name: 'browser_screenshot',
    label: 'Capture browser screenshot',
    description: 'Capture the visible area of a shared browser tab.',
    parameters: sessionParameters,
    execute: async (_toolCallId, { id }) => {
      const image = await host.screenshot(id);
      return {
        content: [
          { type: 'text', text: 'Captured the visible browser page.' },
          { type: 'image', data: image.data, mimeType: image.mimeType },
        ],
        details: {},
      };
    },
  };
  return {
    id: 'app',
    build: () => [
      { tool: listTabs, risk: 'safe' },
      { tool: open, risk: 'mutating' },
      { tool: navigate, risk: 'mutating' },
      { tool: command, risk: 'mutating' },
      { tool: close, risk: 'mutating' },
      { tool: read, risk: 'safe' },
      { tool: inspect, risk: 'safe' },
      { tool: click, risk: 'mutating' },
      { tool: hover, risk: 'safe' },
      { tool: type, risk: 'mutating' },
      { tool: drag, risk: 'mutating' },
      { tool: press, risk: 'mutating' },
      { tool: wait, risk: 'safe' },
      { tool: scroll, risk: 'safe' },
      { tool: screenshot, risk: 'safe' },
    ],
  };
}

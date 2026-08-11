import { app } from 'electron';
import {
  Literal,
  Object as TObject,
  Optional,
  String as TString,
  Union,
  type TSchema,
} from 'typebox';

import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';

import { getPreferences, setPreferences } from './preferences.js';
import type { ToolRisk } from './approval.js';

/**
 * Toolsets: named groups of tools the overlay agent can be given.
 *
 * Two problems this solves.
 *
 * **Swapping without a restart.** A fresh `Agent` is built for every run, so
 * the enabled set is read at run start. Toggling a toolset takes effect on the
 * next summon, which for a hotkey overlay is a second away. Nothing has to be
 * torn down.
 *
 * **Approval that survives new tools.** The gate used to key off a flat list of
 * read-only tool names, which silently gets stale as toolsets come and go. Each
 * tool now declares its own risk, so a toolset added later cannot widen what
 * runs unattended by forgetting to update a list somewhere else.
 *
 * The concierge case is why `app` exists. A small model picks a named verb out
 * of eight far more reliably than it composes a shell command, so narrow tools
 * lower the model floor. See `docs/roadmap.md`.
 */

/** What a tool can do, which is what the approval gate keys off. */
export type { ToolRisk };

export interface RiskyTool {
  tool: AgentTool<TSchema, unknown>;
  risk: ToolRisk;
}

export interface Toolset {
  id: string;
  label: string;
  description: string;
  build: () => RiskyTool[];
}

/* ------------------------------------------------------------ tool helper */

/** Wrap a plain function as a pi tool. Text in, text out. */
function defineTool<S extends TSchema>(
  spec: {
    name: string;
    label: string;
    description: string;
    parameters: S;
    risk: ToolRisk;
  },
  run: (params: unknown) => string | Promise<string>,
): RiskyTool {
  const tool = {
    name: spec.name,
    label: spec.label,
    description: spec.description,
    parameters: spec.parameters,
    execute: async (
      _toolCallId: string,
      params: unknown,
    ): Promise<AgentToolResult<unknown>> => {
      const text = await run(params);
      return { content: [{ type: 'text', text }], details: undefined };
    },
  } as unknown as AgentTool<TSchema, unknown>;

  return { tool, risk: spec.risk };
}

/* -------------------------------------------------------------- app tools */

const THEMES = ['system', 'light', 'dark'] as const;

function appToolset(): RiskyTool[] {
  return [
    defineTool(
      {
        name: 'get_app_state',
        label: 'Read application state',
        description:
          'Read the current state of this desktop application: its version, ' +
          'platform, and user preferences such as the theme. Call this before ' +
          'answering a question about how the application is set up.',
        parameters: TObject({}),
        risk: 'safe',
      },
      () => {
        const prefs = getPreferences();
        return JSON.stringify(
          {
            app: app.getVersion(),
            platform: process.platform,
            arch: process.arch,
            electron: process.versions.electron,
            preferences: prefs,
          },
          null,
          2,
        );
      },
    ),

    defineTool(
      {
        name: 'set_theme',
        label: 'Change the theme',
        description:
          'Change the appearance of this application. Use "light" for a light ' +
          'theme, "dark" for a dark theme, or "system" to follow the operating ' +
          'system setting. The window updates immediately.',
        parameters: TObject({
          theme: Union([Literal('system'), Literal('light'), Literal('dark')]),
        }),
        risk: 'mutating',
      },
      (params) => {
        const theme = (params as { theme?: string } | undefined)?.theme;
        if (!theme || !THEMES.includes(theme as (typeof THEMES)[number])) {
          // Never throw for a bad argument. The model reads this and retries,
          // where a thrown error would end the run.
          return `Unknown theme "${String(theme)}". Use system, light, or dark.`;
        }

        // No renderer call and no new channel. `setPreferences` broadcasts
        // `prefs:changed`, and the shell already tracks it, so the window
        // repaints on its own.
        setPreferences({ theme: theme as (typeof THEMES)[number] });
        return `Theme set to ${theme}.`;
      },
    ),

    defineTool(
      {
        name: 'set_preference',
        label: 'Change a preference',
        description:
          'Turn an application preference on or off. Valid names are ' +
          'menuBarIcon, dockBadge, splash, and agentTools.',
        parameters: TObject({
          name: TString(),
          enabled: Optional(TString()),
        }),
        risk: 'mutating',
      },
      (params) => {
        const input = (params as { name?: string; enabled?: unknown }) ?? {};
        const allowed = ['menuBarIcon', 'dockBadge', 'splash', 'agentTools'];
        if (!input.name || !allowed.includes(input.name)) {
          return `Unknown preference "${String(input.name)}". Valid: ${allowed.join(', ')}.`;
        }
        // Models send booleans as strings often enough that coercing here is
        // worth more than being strict and failing the call.
        const enabled = !/^(false|0|no|off)$/i.test(String(input.enabled));
        setPreferences({ [input.name]: enabled });
        return `${input.name} is now ${enabled ? 'on' : 'off'}.`;
      },
    ),
  ];
}

/* -------------------------------------------------------------- registry */

const registry = new Map<string, Toolset>();

export function registerToolset(toolset: Toolset): void {
  registry.set(toolset.id, toolset);
}

/** Build the tools for a set of toolset ids. Unknown ids are skipped. */
export function buildToolsetTools(ids: readonly string[]): RiskyTool[] {
  return ids.flatMap((id) => registry.get(id)?.build() ?? []);
}

registerToolset({
  id: 'app',
  label: 'This application',
  description: 'Read and change how this application is set up.',
  build: appToolset,
});

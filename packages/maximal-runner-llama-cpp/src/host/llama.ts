import { existsSync, readdirSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { ModelProgress } from '../contracts.js';
import { LLAMA_CONFIG, LLAMA_COPY } from '../constants.js';

import { listen, send } from './llama-host.js';

/**
 * The embedded model: where the weights live, and how they get there. The
 * floor under the provider chain, so that the application is never useless
 * with nothing installed. See `docs/agent.md`.
 *
 * The weights are not in the package. They are a third of a gigabyte and
 * change on a different schedule to the application, so shipping them would pin
 * the model to the app version and put that download on every update.
 *
 * **Nothing here loads `node-llama-cpp`.** The engine runs in a
 * `utilityProcess` because a native abort is not catchable and took the whole
 * application with it; the package's worker entry is the only source that
 * loads the library, and `llama-host.ts` supervises it. Issue #133.
 */

/**
 * Qwen3 0.6B, Q8_0, from Qwen's own GGUF repository.
 *
 * Chosen for the concierge case rather than for coding. In a published
 * comparison of 21 open-weight models it tied for the best agent score, and
 * the property that matters is restraint: it answers a general question
 * without reaching for a tool. Llama 3.2 at a similar size calls a tool on
 * every prompt, which trains people to dismiss the approval card unread.
 *
 * Only Q8_0 is published in that repository, so there is no smaller quant to
 * pick without moving to a community mirror.
 */
export const EMBEDDED_MODEL_LABEL = LLAMA_CONFIG.model.label;
export const EMBEDDED_MODEL_MB = LLAMA_CONFIG.model.approxMb;
export const DEFAULT_EMBEDDED_MODEL_FILE = LLAMA_CONFIG.model.file;

export interface EmbeddedModel {
  fileName: string;
  label: string;
}

let modelDirectory: string | undefined;
let selectedModelFile: string | undefined;

export function configureModel(options: { directory: string }): void {
  modelDirectory = options.directory;
  selectedModelFile = undefined;
}

/* ----------------------------------------------------------------- paths */

function configuredDirectory(): string {
  if (!modelDirectory) {
    throw new Error(LLAMA_COPY.engine.modelDirectoryNotConfigured);
  }
  return modelDirectory;
}

function overridePath(): string | undefined {
  // An override, for testing and for support. It lets a run point at weights
  // that are already on disk instead of fetching another copy into a throwaway
  // profile, which is what the end-to-end test does.
  const override = process.env['STUFFBUCKET_MODEL_PATH'];
  return override || undefined;
}

function usableFile(file: string): boolean {
  try {
    const info = statSync(file);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

export function listEmbeddedModels(): EmbeddedModel[] {
  const override = overridePath();
  if (override) {
    if (!usableFile(override)) return [];
    const fileName = path.basename(override);
    return [{ fileName, label: fileName.replace(/\.gguf$/iu, '') }];
  }

  const directory = configuredDirectory();
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.toLocaleLowerCase('en-US').endsWith('.gguf') &&
          usableFile(path.join(directory, entry.name)),
      )
      .map(({ name: fileName }) => ({
        fileName,
        label: fileName.replace(/\.gguf$/iu, ''),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return [];
    }
    throw error;
  }
}

export function selectEmbeddedModel(fileName: string): void {
  const selected = listEmbeddedModels().find((model) => model.fileName === fileName);
  if (!selected) throw new Error(`Local model "${fileName}" is not available.`);
  selectedModelFile = selected.fileName;
}

export function modelPath(): string {
  const override = overridePath();
  if (override) return override;
  return path.join(
    configuredDirectory(),
    selectedModelFile ?? DEFAULT_EMBEDDED_MODEL_FILE,
  );
}

/**
 * Is the model on disk and plausibly whole?
 *
 * A size floor rather than a checksum. A hash of a 610 MB file costs seconds
 * on every summon, and the failure this needs to catch is a truncated or
 * interrupted download, which the floor catches. The final rename is what
 * makes a partial file impossible to mistake for a finished one.
 */
export function isModelPresent(): boolean {
  const file = modelPath();
  if (!existsSync(file)) return false;
  try {
    return statSync(file).size >= LLAMA_CONFIG.model.minBytes;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------- download */

let inFlight: Promise<ModelProgress> | undefined;

/**
 * Fetch the model if it is missing.
 *
 * Concurrent callers share one download rather than racing for the same file.
 * Progress is reported through `onProgress`, which the main process forwards
 * as `model:progress` events. The bytes arrive in the engine process; this
 * side only relays what it is told.
 */
export async function ensureModel(
  onProgress: (progress: ModelProgress) => void,
): Promise<ModelProgress> {
  if (isModelPresent()) return { state: 'ready' };
  if (inFlight) return inFlight;

  inFlight = download(onProgress).finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

function download(
  onProgress: (progress: ModelProgress) => void,
): Promise<ModelProgress> {
  return new Promise((resolve) => {
    const id = randomUUID();
    let last: ModelProgress = { state: 'downloading', received: 0, total: 0 };

    const stop = listen(id, (event) => {
      if (event.kind === 'progress') {
        last = event.progress;
        onProgress(last);
        return;
      }
      if (event.kind === 'failed') {
        // The engine died mid-download. The reason names the fault, so the
        // download card says what happened rather than stalling at a
        // percentage that will never move.
        stop();
        last = { state: 'error', reason: event.reason };
        onProgress(last);
        resolve(last);
        return;
      }
      if (event.kind === 'done') {
        stop();
        if (last.state === 'ready') selectedModelFile = DEFAULT_EMBEDDED_MODEL_FILE;
        resolve(last);
      }
    });

    try {
      send({
        kind: 'ensure-model',
        id,
        modelPath: path.join(configuredDirectory(), DEFAULT_EMBEDDED_MODEL_FILE),
        url: LLAMA_CONFIG.model.url,
        minBytes: LLAMA_CONFIG.model.minBytes,
      });
    } catch (error) {
      // The engine has crashed too often to be started again.
      stop();
      const failed: ModelProgress = {
        state: 'error',
        reason: error instanceof Error ? error.message : String(error),
      };
      onProgress(failed);
      resolve(failed);
    }
  });
}

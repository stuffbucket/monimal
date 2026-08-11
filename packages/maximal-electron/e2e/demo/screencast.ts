import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { CDPSession, Page } from '@playwright/test';

/**
 * Frame capture, through the Chrome DevTools Protocol.
 *
 * `page.screenshot` is not usable here. A quiet run parks its windows off the
 * side of the display, macOS stops compositing an occluded window, and that
 * call then blocks until its timeout instead of returning. The same reasoning
 * is why `capture` in `e2e/harness.ts` reads the debugger.
 *
 * `Page.startScreencast` is the streaming form of the same idea, and it is the
 * one this uses. Measured on this application it delivers about twenty three
 * frames a second while the interface is changing, against about three a
 * second for a `Page.captureScreenshot` loop. It also emits nothing at all
 * while the screen is still, which is correct: a held frame carries the whole
 * pause, and the concat list gives it the duration it deserves.
 *
 * The polling fallback exists for the case where a screencast never starts.
 * It is slower and it is not what a normal run takes.
 */

/** Capture size, in device pixels. Downscaled to the output size by ffmpeg. */
const CAPTURE_WIDTH = 1920;
const CAPTURE_HEIGHT = 1200;
const CAPTURE_QUALITY = 92;

/** How long to wait for a first screencast frame before polling instead. */
const SCREENCAST_GRACE_MS = 2_000;
const POLL_INTERVAL_MS = 90;

export interface Frame {
  /** Wall-clock milliseconds at which the frame arrived. */
  at: number;
  /** Absolute path to the still on disk. */
  file: string;
}

export type CaptureMethod = 'screencast' | 'screenshot';

interface Source {
  session: CDPSession;
  frames: Frame[];
  method: CaptureMethod;
  poller?: NodeJS.Timeout;
}

export interface Recorder {
  /** Begin capturing a page. Repeat calls for the same page are ignored. */
  attach: (page: Page) => Promise<void>;
  /** Every frame captured from a page so far, in arrival order. */
  frames: (page: Page) => Frame[];
  /** Which method a page ended up using. */
  methodFor: (page: Page) => CaptureMethod;
  /** Stop every capture and flush the frames still being written. */
  stop: () => Promise<void>;
}

export function createRecorder(dir: string): Recorder {
  const sources = new Map<Page, Source>();
  const writes: Promise<unknown>[] = [];
  let sequence = 0;

  const store = (source: Source, data: string): void => {
    sequence += 1;
    const file = path.join(dir, `frame-${String(sequence).padStart(6, '0')}.jpg`);
    source.frames.push({ at: Date.now(), file });
    writes.push(writeFile(file, Buffer.from(data, 'base64')));
  };

  const poll = (page: Page, source: Source): void => {
    source.method = 'screenshot';
    source.poller = setInterval(() => {
      if (page.isClosed()) return;
      void source.session
        .send('Page.captureScreenshot', {
          format: 'jpeg',
          quality: CAPTURE_QUALITY,
          fromSurface: false,
        })
        .then((shot) => {
          store(source, shot.data);
        })
        .catch(() => undefined);
    }, POLL_INTERVAL_MS);
  };

  return {
    async attach(page) {
      if (sources.has(page)) return;

      const session = await page.context().newCDPSession(page);
      const source: Source = { session, frames: [], method: 'screencast' };
      sources.set(page, source);

      session.on('Page.screencastFrame', (frame) => {
        // Acknowledge first. Chromium withholds the next frame until the last
        // one is answered, so a slow write here would halve the frame rate.
        void session
          .send('Page.screencastFrameAck', { sessionId: frame.sessionId })
          .catch(() => undefined);
        store(source, frame.data);
      });

      await session.send('Page.startScreencast', {
        format: 'jpeg',
        quality: CAPTURE_QUALITY,
        maxWidth: CAPTURE_WIDTH,
        maxHeight: CAPTURE_HEIGHT,
        everyNthFrame: 1,
      });

      const deadline = Date.now() + SCREENCAST_GRACE_MS;
      while (source.frames.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (source.frames.length === 0) {
        await session.send('Page.stopScreencast').catch(() => undefined);
        poll(page, source);
      }
    },

    frames(page) {
      return sources.get(page)?.frames ?? [];
    },

    methodFor(page) {
      return sources.get(page)?.method ?? 'screencast';
    },

    async stop() {
      for (const source of sources.values()) {
        if (source.poller) clearInterval(source.poller);
        await source.session.send('Page.stopScreencast').catch(() => undefined);
        await source.session.detach().catch(() => undefined);
      }
      await Promise.all(writes);
    },
  };
}

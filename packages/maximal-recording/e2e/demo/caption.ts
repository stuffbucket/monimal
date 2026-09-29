import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { imageSize } from './encode.js';

/**
 * The lower third.
 *
 * Injected into the page rather than composited by ffmpeg, so it moves with
 * the window, respects the device pixel ratio, and needs no font handling in
 * the encoder. It is inert: `pointer-events: none` keeps it out of the way of
 * every click the timeline dispatches underneath it.
 *
 * `clear` runs in a `finally` at the end of a recording. A caption left behind
 * would leak into the next screenshot the suite takes from the same window.
 */

const CAPTION_ID = 'demo-recorder-caption';

/** Where the lower third sits. The overlay puts its card along the bottom. */
export type CaptionPlacement = 'bottom' | 'top';

/** Card geometry, in output pixels. Compose needs these to place the image. */
export const CARD_LEFT = 40;
export const CARD_TOP = 40;
export const CARD_BOTTOM = 44;

/**
 * Transparent border baked into a rendered card, in output pixels.
 *
 * The card carries `box-shadow: 0 18px 44px`, which reaches 44 pixels out and
 * 18 further down. Clipping to the element box alone would cut the shadow off
 * square. This margin is generous enough for both, and it is transparent, so
 * it costs only the overlay offset.
 */
export const CARD_MARGIN = 64;


const CAPTION_CSS = [
  'position:fixed',
  'left:40px',
  'z-index:2147483647',
  'pointer-events:none',
  'padding:14px 22px 15px',
  'border-radius:14px',
  'border:1px solid rgba(255,255,255,0.16)',
  'background:rgba(14,16,21,0.88)',
  'box-shadow:0 18px 44px rgba(0,0,0,0.45)',
  'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
  'color:#e9ecf2',
  'max-width:60%',
].join(';');

/** Show or update the caption on one page. */
export async function setCaption(
  page: Page,
  title: string,
  note?: string,
  placement: CaptionPlacement = 'bottom',
): Promise<void> {
  const css = `${CAPTION_CSS};${placement === 'top' ? 'top:40px' : 'bottom:44px'}`;

  await page.evaluate(
    ({ id, css: style, title: heading, note: subtitle }) => {
      let host = document.getElementById(id);
      if (!host) {
        host = document.createElement('div');
        host.id = id;
        document.body.append(host);
      }
      host.setAttribute('style', style);

      host.textContent = '';

      const line = document.createElement('div');
      line.textContent = heading;
      line.setAttribute(
        'style',
        'font-size:21px;font-weight:600;letter-spacing:-0.01em;line-height:1.2',
      );
      host.append(line);

      if (subtitle) {
        const second = document.createElement('div');
        second.textContent = subtitle;
        second.setAttribute(
          'style',
          'margin-top:5px;font-size:14px;opacity:0.72;line-height:1.35',
        );
        host.append(second);
      }
    },
    { id: CAPTION_ID, css, title, note },
  );
}

/**
 * Render one card to a transparent image.
 *
 * The card used to be injected into the page while recording, which burned it
 * into the frames. Moving one, hiding one, or changing where it sits then
 * meant driving the whole application again. Rendered separately it becomes an
 * overlay the cut controls.
 *
 * Still drawn by the browser rather than by the encoder. `drawtext` cannot do
 * the rounded corner, the hairline border, or the drop shadow, so a card drawn
 * by ffmpeg would be a visible downgrade. This keeps the typography exactly as
 * it was and only changes when it is applied.
 *
 * ## Why this makes its own window
 *
 * The obvious approach is to screenshot the card inside the shell with the
 * page background cleared. It does not work. `Emulation` can clear the page's
 * own canvas, but the shell window is opaque by construction
 * (`backgroundColor: '#16181d'` in `main-window.ts`), so every capture comes
 * back on a solid rectangle. Composited over the video that reads as a dark
 * box around the card rather than a shadow, which is exactly the artefact this
 * was meant to remove.
 *
 * A throwaway `transparent: true` window has real alpha. It also means a card
 * no longer depends on what the application happens to be showing, so cards
 * can be re-rendered on their own.
 *
 * Returns the image size in output pixels, margin included.
 */
export async function renderCard(
  app: ElectronApplication,
  file: string,
  title: string,
  note?: string,
  placement: CaptionPlacement = 'bottom',
  viewport: { width: number; height: number } = { width: 1440, height: 900 },
): Promise<{ width: number; height: number; margin: number; scale: number }> {
  const html = cardDocument(title, note, placement);

  const shot = await app.evaluate(
    async ({ BrowserWindow }, options) => {
      const win = new BrowserWindow({
        width: options.viewport.width,
        height: options.viewport.height,
        // Off the side of the display rather than hidden. A window that is not
        // on a display stops compositing, and the capture comes back blank.
        // The suite learned this once already; see `quietBounds`.
        x: -20_000,
        y: 0,
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        focusable: false,
        skipTaskbar: true,
        webPreferences: { backgroundThrottling: false, offscreen: false },
      });

      try {
        await win.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(options.html)}`,
        );
        // `showInactive` puts it on a display without taking the keyboard.
        win.showInactive();
        await new Promise((resolve) => setTimeout(resolve, 250));

        const box = (await win.webContents.executeJavaScript(
          `(() => {
             const el = document.getElementById(${JSON.stringify(options.id)});
             const r = el.getBoundingClientRect();
             return { x: r.x, y: r.y, width: r.width, height: r.height };
           })()`,
        )) as { x: number; y: number; width: number; height: number };

        const rect = {
          x: Math.floor(box.x - options.margin),
          y: Math.floor(box.y - options.margin),
          width: Math.ceil(box.width + options.margin * 2),
          height: Math.ceil(box.height + options.margin * 2),
        };
        if (rect.x < 0 || rect.y < 0) {
          // Clamping here would silently trim the margin on one side, and the
          // card would then sit that far off in the finished video.
          throw new Error(
            `The card needs ${String(options.margin)}px of margin and only has ` +
              `${String(Math.min(box.x, box.y))}px. Inset it further.`,
          );
        }

        const image = await win.webContents.capturePage(rect);
        return { png: image.toPNG().toString('base64'), rect };
      } finally {
        win.destroy();
      }
    },
    { html, id: CAPTION_ID, margin: CARD_MARGIN, viewport },
  );

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(shot.png, 'base64'));

  // Measure rather than assume. The capture comes back at the display's device
  // ratio, which is 2 on this hardware and 1 elsewhere, and a wrong guess would
  // place every card at half or double size.
  const pixels = await imageSize(file);
  const scale = pixels.width / shot.rect.width;

  return {
    width: shot.rect.width,
    height: shot.rect.height,
    margin: CARD_MARGIN,
    scale,
  };
}

/**
 * A standalone document holding nothing but the card.
 *
 * The rules go in a `<style>` block rather than a `style` attribute. The font
 * stack contains `"Segoe UI"`, and those double quotes close an HTML attribute
 * early, which silently drops every declaration after them. That cost a card
 * its colour and its typeface once already.
 */
function cardDocument(
  title: string,
  note: string | undefined,
  placement: CaptionPlacement,
): string {
  const escape = (text: string): string =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Inset by exactly the margin, so the capture rectangle can always take a
  // full margin on every side without being clamped at the edge of the page.
  // Clamping cost the card 24 pixels of its left margin, which then shifted it
  // 24 pixels left in the finished video. Compose puts it back where it
  // belongs by offsetting the image by the same margin.
  const edge = placement === 'top' ? `top:${CARD_MARGIN}px` : `bottom:${CARD_MARGIN}px`;
  const second = note ? `<div class="note">${escape(note)}</div>` : '';

  return [
    '<!doctype html><meta charset="utf-8">',
    '<style>',
    'html,body{margin:0;padding:0;background:transparent}',
    `#${CAPTION_ID}{${CAPTION_CSS};left:${CARD_MARGIN}px;${edge}}`,
    `#${CAPTION_ID} .title{font-size:21px;font-weight:600;letter-spacing:-0.01em;line-height:1.2}`,
    `#${CAPTION_ID} .note{margin-top:5px;font-size:14px;opacity:0.72;line-height:1.35}`,
    '</style>',
    `<div id="${CAPTION_ID}"><div class="title">${escape(title)}</div>${second}</div>`,
  ].join('');
}

/** Remove the caption from one page. Safe to call on a page that has none. */
export async function clearCaption(page: Page): Promise<void> {
  if (page.isClosed()) return;
  await page
    .evaluate((id) => {
      document.getElementById(id)?.remove();
    }, CAPTION_ID)
    .catch(() => undefined);
}

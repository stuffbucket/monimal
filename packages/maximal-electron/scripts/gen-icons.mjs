#!/usr/bin/env node
/**
 * Generate the application and menu bar icons.
 *
 * Icons are generated rather than committed, which follows
 * `stuffbucket/maximal`'s `shell/tools/gen-wordmark.py`: keep binary assets out
 * of git blame, and make the shape reproducible from source.
 *
 * ## Brand
 *
 * The geometry follows maximal's `build/macos/app-icon.svg`: a flat squircle on
 * Apple's Big Sur template, drawn at scale 0.842 rather than the documented
 * 0.8047. Apple's template assumes a rendered shadow filling the surrounding
 * margin. A flat mark has none, so at the documented scale it reads small
 * beside peers in the dock. The palette is the house red and cream.
 *
 * The glyph is geometric, not a letterform, so this script needs no font.
 * Replace it with a designer asset before a public release.
 *
 * ## Output
 *
 *   build/icons/icon.icns              macOS bundle icon
 *   build/icons/icon.ico               Windows bundle icon
 *   build/icons/icon.png               512, Linux, dock, taskbar, and window
 *   build/icons/trayTemplate.png       16, macOS menu bar
 *   build/icons/trayTemplate@2x.png    32, macOS menu bar, retina
 *   build/icons/tray.png               32, Windows and Linux tray
 *
 * `STUFFBUCKET_ICON_DIR` writes them somewhere else. That is the same variable
 * `forge.config.ts` and `src/main/native/icons.ts` read, so a consumer keeps
 * their own icon set outside this repository and never edits it. The six names
 * are the contract; see the icons section in `README.md`.
 *
 * The `.icns` and `.ico` files are written by hand rather than through
 * `iconutil`, so the script runs on any platform. Both formats accept PNG
 * payloads, so each is a container around the sizes generated above.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = process.env.STUFFBUCKET_ICON_DIR
  ? path.resolve(process.env.STUFFBUCKET_ICON_DIR)
  : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icons');

const BRAND = [0xc8, 0x33, 0x4a]; // house red, mirrors maximal tokens
const CREAM = [0xf4, 0xea, 0xd4]; // house cream

/* ------------------------------------------------------------ PNG writer */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Encode RGBA pixels as an 8-bit truecolour-with-alpha PNG. */
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // One filter byte (0 = None) per scanline, then that row's pixels.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------------------------------------------------------- shapes */

/** Signed distance to a rounded rectangle. Negative inside. */
function roundedRect(x, y, halfW, halfH, radius) {
  const dx = Math.abs(x) - (halfW - radius);
  const dy = Math.abs(y) - (halfH - radius);
  return (
    Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) +
    Math.min(Math.max(dx, dy), 0) -
    radius
  );
}

/** Coverage from a signed distance, antialiased across about one pixel. */
const coverage = (distance, feather) =>
  Math.min(Math.max(0.5 - distance / feather, 0), 1);

function blend(rgba, index, colour, alpha) {
  if (alpha <= 0) return;
  const existing = rgba[index + 3] / 255;
  const out = alpha + existing * (1 - alpha);
  for (let c = 0; c < 3; c += 1) {
    const src = colour[c] * alpha;
    const dst = rgba[index + c] * existing * (1 - alpha);
    rgba[index + c] = out > 0 ? Math.round((src + dst) / out) : 0;
  }
  rgba[index + 3] = Math.round(out * 255);
}

/**
 * The application icon: a house-red squircle carrying three cream bars.
 *
 * The bars narrow toward the bottom, which reads as a container. It is a
 * placeholder, but a deliberate one rather than a default.
 */
function drawAppIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const unit = size / 1024; // work in the 1024 design space
  const feather = Math.max(unit, 0.9);
  const centre = size / 2;

  // Big Sur template: an 824 body inside 1024, nudged to 862 so a flat mark
  // sits at the same optical size as peers that carry a shadow.
  const bodyHalf = (1024 * 0.842) / 2;
  const bodyRadius = 230 * 0.842;

  // Three bars, each narrower than the one above it.
  const bars = [
    { y: -150, halfW: 300, halfH: 62 },
    { y: 10, halfW: 240, halfH: 62 },
    { y: 170, halfW: 180, halfH: 62 },
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = (x + 0.5 - centre) / unit;
      const py = (y + 0.5 - centre) / unit;
      const index = (y * size + x) * 4;

      const body = coverage(
        roundedRect(px, py, bodyHalf, bodyHalf, bodyRadius) * unit,
        feather,
      );
      if (body <= 0) continue;
      blend(rgba, index, BRAND, body);

      for (const bar of bars) {
        const distance =
          roundedRect(px, py - bar.y, bar.halfW, bar.halfH, bar.halfH) * unit;
        blend(rgba, index, CREAM, coverage(distance, feather) * body);
      }
    }
  }

  return rgba;
}

/**
 * The menu bar icon: solid black with alpha only.
 *
 * macOS recolours a `*Template` image for light and dark menu bars, so the
 * shape must live entirely in the alpha channel.
 */
function drawTrayIcon(size, { template }) {
  const rgba = Buffer.alloc(size * size * 4);
  const unit = size / 32;
  const feather = Math.max(unit, 0.9);
  const centre = size / 2;

  const bodyHalf = 13;
  const bodyRadius = 4;
  const bars = [
    { y: -4.2, halfW: 7, halfH: 1.5 },
    { y: 0, halfW: 5.4, halfH: 1.5 },
    { y: 4.2, halfW: 3.8, halfH: 1.5 },
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = (x + 0.5 - centre) / unit;
      const py = (y + 0.5 - centre) / unit;
      const index = (y * size + x) * 4;

      const body = coverage(
        roundedRect(px, py, bodyHalf, bodyHalf, bodyRadius) * unit,
        feather,
      );
      if (body <= 0) continue;

      let bar = 0;
      for (const item of bars) {
        const distance =
          roundedRect(px, py - item.y, item.halfW, item.halfH, item.halfH) * unit;
        bar = Math.max(bar, coverage(distance, feather));
      }

      if (template) {
        // Knock the bars out of the alpha channel, leaving a black silhouette.
        blend(rgba, index, [0, 0, 0], Math.min(body, 1 - bar));
      } else {
        blend(rgba, index, BRAND, body);
        blend(rgba, index, CREAM, bar * body);
      }
    }
  }

  return rgba;
}

/* ----------------------------------------------------------------- ICNS */

/**
 * Build an `.icns` around PNG payloads.
 *
 * Layout: the magic `icns`, the total length, then one chunk per size. Each
 * chunk is a four-character type, its length, and the payload. The `ic**` types
 * all accept PNG, so no raw bitmap encoding is needed.
 */
function buildIcns(pngs) {
  const TYPES = [
    ['icp4', 16],
    ['icp5', 32],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
    ['ic11', 32],
    ['ic12', 64],
    ['ic13', 256],
    ['ic14', 512],
  ];

  const chunks = TYPES.filter(([, size]) => pngs.has(size)).map(([type, size]) => {
    const payload = pngs.get(size);
    const header = Buffer.alloc(8);
    header.write(type, 0, 'ascii');
    header.writeUInt32BE(payload.length + 8, 4);
    return Buffer.concat([header, payload]);
  });

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

/* ------------------------------------------------------------------ ICO */

/**
 * Build an `.ico` around PNG payloads.
 *
 * Windows Vista and later accept a PNG inside an ICO, so each entry points at
 * the PNG already generated. A dimension of 256 or more is stored as 0.
 */
function buildIco(pngs, sizes) {
  const entries = sizes.filter((size) => pngs.has(size));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;
  const payloads = [];

  entries.forEach((size, index) => {
    const png = pngs.get(size);
    const at = index * 16;
    directory[at] = size >= 256 ? 0 : size; // width
    directory[at + 1] = size >= 256 ? 0 : size; // height
    directory[at + 2] = 0; // palette size
    directory[at + 3] = 0; // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += png.length;
    payloads.push(png);
  });

  return Buffer.concat([header, directory, ...payloads]);
}

/* ----------------------------------------------------------------- main */

mkdirSync(OUT_DIR, { recursive: true });

const write = (name, data) => {
  const file = path.join(OUT_DIR, name);
  writeFileSync(file, data);
  console.log(`wrote ${path.relative(process.cwd(), file)} (${data.length} bytes)`);
};

// One render per size, reused by every container format.
const APP_SIZES = [16, 32, 64, 128, 256, 512, 1024];
const appPngs = new Map(
  APP_SIZES.map((size) => [size, encodePng(size, drawAppIcon(size))]),
);

write('icon.png', appPngs.get(512));
write('icon.icns', buildIcns(appPngs));
write('icon.ico', buildIco(appPngs, [16, 32, 48, 64, 128, 256]));

write('trayTemplate.png', encodePng(16, drawTrayIcon(16, { template: true })));
write('trayTemplate@2x.png', encodePng(32, drawTrayIcon(32, { template: true })));
write('tray.png', encodePng(32, drawTrayIcon(32, { template: false })));

#!/usr/bin/env node
/**
 * Install the canonical Maximal application and menu bar icons.
 *
 * `icon-source` contains the exact application assets retired with the Tauri
 * shell at `fe3102c4`. The tray PNGs below are the matching normal-state
 * assets from that commit. Keeping the shipped bytes here avoids depending on
 * a font or platform-specific SVG rasterizer during packaging.
 *
 * `STUFFBUCKET_ICON_DIR` writes the five runtime files somewhere else. The
 * variable is shared with `forge.config.ts` and `src/main/native/icons.ts`, so
 * a consumer can replace the complete set without editing this repository.
 */

import {
  copyFileSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.join(SCRIPT_DIR, 'icon-source');
const OUT_DIR = process.env.STUFFBUCKET_ICON_DIR
  ? path.resolve(process.env.STUFFBUCKET_ICON_DIR)
  : path.join(SCRIPT_DIR, '..', 'build', 'icons');

const TAURI_TRAY_1X = Buffer.from(
  `iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAABmJLR0QA/wD/AP+gvaeTAAAB2UlEQVQ4
jbWUz08TQRTHP2/ZtBQKF6NGD/Ir/AHYGuyNxBONhph48+AFE46URIghBkMI4MENMf4BcvdggoWbHAGV
xsQEf8SWAwncNJZdsMjueNju0mSh1HT7vcy8N/M+82by5kGDJJXGejI9JA4ZJSSB1hoZFqgPSmGkcitL
AfBGYnBeIRP1ZKlEZlMfs5M+eD2ZHkLxph6oJ1Hc6c8tv9UAxCETBhRACWMAmmtIIiwwkPTBoOIhgtsq
wGerqbWFWE8HTfGTItHb48S6ryG6fmZcYCVy+SJ92VcAFKYX6Hw0ghZrxikdkZ96TktvF1cf3EN0neOi
yY/JZ/xeywXAVTPuyDzE+pbHNi20aISep2NcuX+X/U9b2KaF3h6n+8koiARiq4K3516yNTxOfspwNzdH
KUwv8GXkMYWZF+4NL11Abwv+pargg+8FAA63d3yf+fkrAKWdvRNINPJ/YOU47sQbAWXbwX0qGHtuVdSk
U8jhgE9RwzIu17GY3u+zrQN2F18DcFw03XHf9H22dQjA35+/fJ/zp1TJLILX3RKDqyADoWQP725uLt/S
yjcxQoIiiAHlN07lVpaUyGwI3Jn+zWzWPaBCG9fTt91+Kjdq73hignoviOFBG6p/RzWZ0Hjto7sAAAAA
SUVORK5CYII=`,
  'base64',
);
const TAURI_TRAY_2X = Buffer.from(
  `iVBORw0KGgoAAAANSUhEUgAAACwAAAAsCAYAAAAehFoBAAAABmJLR0QA/wD/AP+gvaeTAAADkklEQVRY
he2ZS2wbRRiAv3Fix3nYoRFV0iQNfSDyUgmqk7q0J8Sp5ZBEkJ5AgBAHBBKIVo3gAK0AoaQ5tOVYiRuX
UlEH0XAinIAA2SAQ7htHVCHItKSScZzEif1zaL31ZmtnMXF3LfU7zfzz786n0b8z2l24T3FR+QbDnQOe
WEW8XynVC+wEmoHqdXaYB2aAKRFC/qXqUGf402Su5JzCE937n0YYBrats2BeFPyWFnX48alzn+UYN3J6
YKCsJZIYAjlYfL18yEhQCw4qjqSzo67Vac6QBVCHJnb+8KEpmt25XQZn7p3U2iikP6h9GbrTv024c8AT
986fF9huj1pOpn2L1W2ZB1EviVhFvN+BsgBb495Eb6ajCyvos8fHEmZhlArYomIBQboz7axdQm2yQ8Ya
qinTyhKWGjtUrHHHzbQPO52SEy7/vzdQLhdVbdvxNjWAy8XSbJR4+BKkxZjnLse3ox1Pw0YklWL+whUW
r80WR9j3aDsdH48YYj/tew7vQ81se+cNKhrrDWOL1/4g8v5J/pn6FZRi07P9NL54gHK/z5AX+/FnIu+d
YGk2alm44JKo2dFG68mjJlkAb0sTrcePUNFYz5bBV2h5/SWTLIC/p4uOU0O4H6wrvvCWt17D5fHkHC+r
qqT1xFHqn3kq73089RvZ/OrzluctuIbdG2pJXJlmbvwb0gtL1O4JULvrMUNO5dbNACQuT3NjbJx0Mknd
E3vw93QZ8uqe3Mv0Bx8hKyvFE47/cpHzLx9GUikA/vzkLK3H3+WBvT2GvMTlCOEXDpJO3nqJiJ45R8ep
YXxdHXpOWVUl7g1+ktfn1py34JK4MTauywIgwtxX35ryoqe/0GUBSAs3v/7OlFfms3ZuFSycvP63KbY8
d9MUW/h9xhRbicXNIl6vpXkLFpaVlLVYctnqHS1lOeekk1ITtohzhEtuha35OkdYSm6FLeIg4VJb4f9e
w8p8/DiHWKahf/mZCOy/BDxii87aXNytjbWDsSQ0m2TWRjGZaerCIoTunu0EZDTT0oXdKnoW1FV7hPIS
8S3UfJ7p6MLdmrYswqA9TnlQvJn9C8Gwrd36TC8j5qvsQSFDuyfHRrNjpn04qAUHURy7d1p3R4ThXVrw
7dXxnD9lvg/s6xNcx0AeLq7aatRVlBxavbL6aL5LJwMBd4qGPqBXkACo5vX/aKjiIDMKpYlKh8rlr9Fu
TbP6mnKfdedffAQdvFCpoBYAAAAASUVORK5CYII=`,
  'base64',
);

mkdirSync(OUT_DIR, { recursive: true });
for (const obsolete of ['trayTemplate.png', 'trayTemplate@2x.png']) {
  rmSync(path.join(OUT_DIR, obsolete), { force: true });
}

for (const name of ['icon.png', 'icon.icns', 'icon.ico']) {
  const source = path.join(SOURCE_DIR, name);
  const destination = path.join(OUT_DIR, name);
  copyFileSync(source, destination);
  console.log(
    `wrote ${path.relative(process.cwd(), destination)} (${String(statSync(destination).size)} bytes)`,
  );
}

for (const [name, data] of [
  ['tray.png', TAURI_TRAY_1X],
  ['tray@2x.png', TAURI_TRAY_2X],
]) {
  const destination = path.join(OUT_DIR, name);
  writeFileSync(destination, data);
  console.log(`wrote ${path.relative(process.cwd(), destination)} (${String(data.length)} bytes)`);
}

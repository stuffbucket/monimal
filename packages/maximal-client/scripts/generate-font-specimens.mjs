import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import fonts from '../src/shared/terminal-font-downloads.json' with { type: 'json' }

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const outputDirectory = join(
  packageRoot,
  'src',
  'renderer',
  'settings',
  'general',
  'font-specimens',
)

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

await mkdir(outputDirectory, { recursive: true })
for (const font of fonts) {
  const family = escapeXml(font.family)
  const label = escapeXml(font.label)
  const specimen = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="32" viewBox="0 0 320 32" role="img" aria-label="${label}">
  <style>
    text { fill: #f4f5f7; }
    @media (prefers-color-scheme: light) { text { fill: #17191d; } }
  </style>
  <text x="0" y="23" font-family="${family}" font-size="18" font-weight="600">${label}</text>
</svg>
`
  const typeRamp = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="154" viewBox="0 0 720 154" role="img" aria-label="${label} type size ramp">
  <style>
    text { fill: #f4f5f7; }
    .meta { fill: #9da5b4; font-family: ui-sans-serif, system-ui, sans-serif; }
    @media (prefers-color-scheme: light) {
      text { fill: #17191d; }
      .meta { fill: #606775; }
    }
  </style>
  <text class="meta" x="0" y="14" font-size="11">TYPE RAMP</text>
  <text class="meta" x="0" y="39" font-size="11">11 pt</text>
  <text x="54" y="39" font-family="${family}" font-size="11">The quick brown fox jumps over the lazy dog.</text>
  <text class="meta" x="0" y="65" font-size="11">14 pt</text>
  <text x="54" y="65" font-family="${family}" font-size="14">The quick brown fox jumps over the lazy dog.</text>
  <text class="meta" x="0" y="94" font-size="11">18 pt</text>
  <text x="54" y="94" font-family="${family}" font-size="18">The quick brown fox jumps over the lazy dog.</text>
  <text class="meta" x="0" y="127" font-size="11">24 pt</text>
  <text x="54" y="127" font-family="${family}" font-size="24">Aa0 {} =&gt; !=</text>
  <text class="meta" x="0" y="150" font-size="11">32 pt</text>
  <text x="54" y="150" font-family="${family}" font-size="32">Aa0</text>
</svg>
`
  const weightRamp = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="150" viewBox="0 0 720 150" role="img" aria-label="${label} weight ramp">
  <style>
    text { fill: #f4f5f7; }
    .meta { fill: #9da5b4; font-family: ui-sans-serif, system-ui, sans-serif; }
    @media (prefers-color-scheme: light) {
      text { fill: #17191d; }
      .meta { fill: #606775; }
    }
  </style>
  <text class="meta" x="0" y="14" font-size="11">WEIGHT RAMP</text>
  <text class="meta" x="0" y="39" font-size="11">300</text>
  <text x="54" y="39" font-family="${family}" font-size="17" font-weight="300">Light — Hamburgefontsiv 0123456789</text>
  <text class="meta" x="0" y="66" font-size="11">400</text>
  <text x="54" y="66" font-family="${family}" font-size="17" font-weight="400">Regular — Hamburgefontsiv 0123456789</text>
  <text class="meta" x="0" y="93" font-size="11">500</text>
  <text x="54" y="93" font-family="${family}" font-size="17" font-weight="500">Medium — Hamburgefontsiv 0123456789</text>
  <text class="meta" x="0" y="120" font-size="11">600</text>
  <text x="54" y="120" font-family="${family}" font-size="17" font-weight="600">Semibold — Hamburgefontsiv 0123456789</text>
  <text class="meta" x="0" y="147" font-size="11">700</text>
  <text x="54" y="147" font-family="${family}" font-size="17" font-weight="700">Bold — Hamburgefontsiv 0123456789</text>
</svg>
`
  await Promise.all([
    writeFile(join(outputDirectory, `${font.id}.svg`), specimen),
    writeFile(join(outputDirectory, `${font.id}-type-ramp.svg`), typeRamp),
    writeFile(join(outputDirectory, `${font.id}-weight-ramp.svg`), weightRamp),
  ])
}

const imports = fonts.flatMap((font, index) => [
  `import specimen${String(index)} from './font-specimens/${font.id}.svg'`,
  `import typeRamp${String(index)} from './font-specimens/${font.id}-type-ramp.svg'`,
  `import weightRamp${String(index)} from './font-specimens/${font.id}-weight-ramp.svg'`,
]).join('\n')
const entries = fonts.map((font, index) =>
  `  '${font.id}': { name: specimen${String(index)}, typeRamp: typeRamp${String(index)}, weightRamp: weightRamp${String(index)} },`,
).join('\n')
await writeFile(
  join(outputDirectory, '..', 'font-specimens.ts'),
  `${imports}\n\ninterface FontSpecimen {\n  name: string\n  typeRamp: string\n  weightRamp: string\n}\n\nexport const FONT_SPECIMENS: Readonly<Record<string, FontSpecimen>> = {\n${entries}\n}\n`,
)

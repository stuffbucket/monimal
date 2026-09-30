import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'

import type { TerminalFontAxis } from '@maximal/maximal-client/shared/host'

interface SystemFont {
  path?: string
  typefaces?: Array<{ family?: string }>
}

interface SystemFontReport {
  SPFontsDataType?: SystemFont[]
}

function execute(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30_000 },
      (error, stdout) => {
        if (error) reject(new Error(`Failed to execute ${file}`, { cause: error }))
        else resolve(stdout)
      },
    )
  })
}

function fixed1616(buffer: Buffer, offset: number): number {
  return buffer.readInt32BE(offset) / 65_536
}

function faceOffsets(buffer: Buffer): number[] {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'ttcf') {
    return [0]
  }
  const count = buffer.readUInt32BE(8)
  if (count === 0 || count > 256 || buffer.length < 12 + (count * 4)) return []
  return Array.from(
    { length: count },
    (_, index) => buffer.readUInt32BE(12 + (index * 4)),
  )
}

export function parseFontVariationAxes(buffer: Buffer): TerminalFontAxis[] {
  const axes = new Map<string, TerminalFontAxis>()
  for (const faceOffset of faceOffsets(buffer)) {
    if (faceOffset + 12 > buffer.length) continue
    const tableCount = buffer.readUInt16BE(faceOffset + 4)
    for (let index = 0; index < tableCount; index += 1) {
      const recordOffset = faceOffset + 12 + (index * 16)
      if (recordOffset + 16 > buffer.length) break
      if (buffer.toString('ascii', recordOffset, recordOffset + 4) !== 'fvar') {
        continue
      }
      const offset = buffer.readUInt32BE(recordOffset + 8)
      const length = buffer.readUInt32BE(recordOffset + 12)
      if (offset + Math.min(length, 16) > buffer.length || length < 16) continue
      const axesOffset = buffer.readUInt16BE(offset + 4)
      const axisCount = buffer.readUInt16BE(offset + 8)
      const axisSize = buffer.readUInt16BE(offset + 10)
      if (axisSize < 20 || axisCount > 64) continue
      for (let axisIndex = 0; axisIndex < axisCount; axisIndex += 1) {
        const axisOffset = offset + axesOffset + (axisIndex * axisSize)
        if (axisOffset + 20 > buffer.length) break
        const tag = buffer.toString('ascii', axisOffset, axisOffset + 4)
        const axis = {
          tag,
          minimum: fixed1616(buffer, axisOffset + 4),
          default: fixed1616(buffer, axisOffset + 8),
          maximum: fixed1616(buffer, axisOffset + 12),
        }
        if (
          /^[\x20-\x7e]{4}$/u.test(tag)
          && axis.minimum <= axis.default
          && axis.default <= axis.maximum
        ) {
          axes.set(tag, axis)
        }
      }
    }
  }
  return [...axes.values()]
}

export async function discoverFontVariationAxes(
  families: readonly string[],
  dependencies: {
    profile?: () => Promise<string>
    read?: (path: string) => Promise<Buffer>
  } = {},
): Promise<Record<string, TerminalFontAxis[]>> {
  if (families.length === 0 || process.platform !== 'darwin') return {}
  const profile = dependencies.profile
    ?? (() => execute('/usr/sbin/system_profiler', ['SPFontsDataType', '-json']))
  const read = dependencies.read ?? readFile
  const report = JSON.parse(await profile()) as SystemFontReport
  const normalize = (family: string): string =>
    family.toLocaleLowerCase().replaceAll(/[^a-z0-9]/gu, '')
  const requested = new Map(families.map((family) => [normalize(family), family]))
  const paths = new Map<string, Set<string>>()
  for (const font of report.SPFontsDataType ?? []) {
    if (font.path === undefined) continue
    for (const typeface of font.typefaces ?? []) {
      if (typeface.family === undefined) continue
      const family = requested.get(normalize(typeface.family))
      if (family === undefined) continue
      const pathFamilies = paths.get(font.path) ?? new Set<string>()
      pathFamilies.add(family)
      paths.set(font.path, pathFamilies)
    }
  }
  const result: Record<string, TerminalFontAxis[]> = {}
  for (const [path, pathFamilies] of paths) {
    const axes = parseFontVariationAxes(await read(path))
    if (axes.length === 0) continue
    for (const family of pathFamilies) result[family] = axes
  }
  return result
}

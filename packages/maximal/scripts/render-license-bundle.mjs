import fs from 'node:fs/promises'
import path from 'node:path'

export async function renderPlainTextLicenses(packageRoot, {
  fallbackPath = path.join(packageRoot, 'THIRD-PARTY-LICENSE'),
  outputPath = path.join(packageRoot, 'THIRD-PARTY-LICENSES.txt'),
  sbomPath = path.join(packageRoot, 'SBOM.cdx.json'),
} = {}) {
  try {
    const bom = JSON.parse(await fs.readFile(sbomPath, 'utf8'))
    const rendered = (bom.components ?? [])
      .map((component) => {
        const name = typeof component.name === 'string' ? component.name : 'unknown'
        const version = typeof component.version === 'string' ? component.version : 'unknown'
        const licenses = (component.licenses ?? [])
          .map(({ license }) => license?.id ?? license?.name)
          .filter((license) => typeof license === 'string')
        return `${name}\nVersion: ${version}\nLicense: ${licenses.length > 0 ? licenses.join(', ') : 'UNKNOWN'}`
      })
      .join('\n\n----------------------------------------\n\n')
    await fs.writeFile(outputPath, `THIRD-PARTY SOFTWARE LICENSES\n\n${rendered}\n`, 'utf8')
  } catch (error) {
    if (fallbackPath === null) throw error
    await fs.copyFile(fallbackPath, outputPath)
  }
}

if (import.meta.main) {
  await renderPlainTextLicenses(path.resolve(import.meta.dirname, '..'))
}
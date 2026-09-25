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
      .filter((component) => component.group !== '@stuffbucket')
      .map((component) => {
        const name = typeof component.name === 'string' ? component.name : 'unknown'
        const version = typeof component.version === 'string' ? component.version : 'unknown'
        const licenseEntries = component.licenses ?? []
        const licenses = licenseEntries
          .map(({ license }) => license?.id ?? license?.name)
          .filter((license) => typeof license === 'string')
        const texts = licenseEntries
          .map(({ license }) => license?.text)
          .filter(({ content } = {}) => typeof content === 'string')
          .map(({ content, encoding }) =>
            encoding === 'base64' ? Buffer.from(content, 'base64').toString('utf8') : content,
          )
        const header = `${name}\nVersion: ${version}\nLicense: ${licenses.length > 0 ? licenses.join(', ') : 'UNKNOWN'}`
        return texts.length > 0 ? `${header}\n\n${[...new Set(texts)].join('\n\n')}` : header
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
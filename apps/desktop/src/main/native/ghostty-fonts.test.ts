import { describe, expect, it, vi } from 'vitest'

import {
  listGhosttyNerdFonts,
  parseGhosttyNerdFontCatalog,
  parseGhosttyNerdFonts,
  waitForGhosttyNerdFont,
} from './ghostty-fonts'

describe('Ghostty font discovery', () => {
  it('keeps supported terminal families and ignores indented faces', () => {
    expect(parseGhosttyNerdFonts([
      '0xProto Nerd Font Mono',
      '  0xProto Nerd Font Mono Regular',
      '',
      'JetBrainsMono Nerd Font',
      '  JetBrainsMono Nerd Font Bold',
      '',
      'Menlo',
      '  Menlo Regular',
      'Arial',
      '  Arial Regular',
      '',
      'MesloLGS NF',
      'MesloLGS NF',
    ].join('\n'))).toEqual([
      '0xProto Nerd Font Mono',
      'JetBrainsMono Nerd Font',
      'Menlo',
      'MesloLGS NF',
    ])
  })

  it('derives only the weights exposed by each static font family', () => {
    expect(parseGhosttyNerdFontCatalog([
      'AtkynsonMono Nerd Font Mono',
      '  AtkynsonMono NFM',
      '  AtkynsonMono NFM Light',
      '  AtkynsonMono NFM Medium Italic',
      '  AtkynsonMono NFM Bold',
    ].join('\n')).fontWeights).toEqual({
      'AtkynsonMono Nerd Font Mono': [300, 400, 500, 700],
    })
  })

  it('uses the Ghostty application bundle before PATH', async () => {
    const execFile = vi.fn(async () => [
      'FiraCode Nerd Font',
      '  FiraCode Nerd Font Retina',
    ].join('\n'))
    const catalog = await listGhosttyNerdFonts({
      platform: 'darwin',
      environment: { PATH: '/custom/bin' },
      home: '/Users/test',
      access: vi.fn(async (path: string) => {
        if (path !== '/Applications/Ghostty.app/Contents/MacOS/ghostty') {
          throw new Error('missing')
        }
      }),
      execFile,
    })

    expect(catalog).toMatchObject({
      status: 'available',
      fonts: ['FiraCode Nerd Font'],
      ghosttyPath: '/Applications/Ghostty.app/Contents/MacOS/ghostty',
    })
    expect(catalog.downloads.find(({ id }) => id === 'fira-code')).toMatchObject({
      installed: false,
    })
    expect(execFile).toHaveBeenCalledWith(
      '/Applications/Ghostty.app/Contents/MacOS/ghostty',
      ['+list-fonts'],
    )
  })

  it('reports an unavailable catalog when Ghostty is not installed', async () => {
    await expect(listGhosttyNerdFonts({
      platform: 'darwin',
      environment: {},
      home: '/Users/test',
      access: vi.fn(async () => {
        throw new Error('missing')
      }),
    })).resolves.toMatchObject({
      status: 'unavailable',
      fonts: [],
    })
  })

  it('waits for a newly installed font to appear in the terminal catalog', async () => {
    const pending = {
      status: 'available' as const,
      fonts: [],
      downloads: [],
      ghosttyPath: '/Applications/Ghostty.app/Contents/MacOS/ghostty',
    }
    const available = {
      ...pending,
      fonts: ['AtkynsonMono Nerd Font Mono'],
    }
    const list = vi.fn()
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(available)
    const delay = vi.fn(async () => undefined)

    await expect(waitForGhosttyNerdFont(
      'AtkynsonMono Nerd Font Mono',
      { list, delay },
    )).resolves.toEqual(available)
    expect(delay).toHaveBeenCalledTimes(2)
  })
})

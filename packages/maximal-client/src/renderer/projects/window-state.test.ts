import { describe, expect, it } from 'vitest'
import { createYProjectMapStore } from '@maximal/maximal-project-browser'
import { encodeProjectWindowState, restoreProjectWindowState } from './window-state'

describe('Projects document transfers', () => {
  it('restores every board page, item, and view without merging an empty default over it', () => {
    const source = createYProjectMapStore()
    const page = source.addPage('Planning')
    source.transact(page.id, (draft) => {
      draft.items.push({
        id: 'note', type: 'sticky', text: 'Keep this',
        x: 12, y: 24, width: 160, height: 112,
      })
    })
    const view = { query: 'workspace', pageId: page.id, camera: { x: -50, y: 100, zoom: 2 } }
    const encoded = encodeProjectWindowState(source, view)
    for (let index = 0; index < 20; index++) {
      const restored = restoreProjectWindowState(encoded)
      expect(restored.view).toEqual(view)
      expect(restored.store.getSnapshot(page.id).items).toEqual(source.getSnapshot(page.id).items)
      expect(restored.store.getSnapshot(page.id).pages).toEqual(source.getSnapshot(page.id).pages)
      restored.store.destroy()
    }
    source.destroy()
  })

  it.each([
    'not JSON',
    JSON.stringify({ version: 1, document: [-1], view: {} }),
    JSON.stringify({
      version: 1, document: [0],
      view: { query: '', pageId: 'projects', camera: { x: 0, y: 0, zoom: 0 } },
    }),
  ])('rejects malformed transfer state: %s', (encoded) => {
    expect(() => restoreProjectWindowState(encoded)).toThrow()
  })
})

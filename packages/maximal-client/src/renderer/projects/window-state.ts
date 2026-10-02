import { createYProjectMapStore, INITIAL_CAMERA, type Camera, type ProjectMapStore } from '@maximal/maximal-project-browser'

export interface ProjectBrowserView {
  query: string
  pageId: string
  camera: Camera
}

export const INITIAL_PROJECT_VIEW: ProjectBrowserView = {
  query: '',
  pageId: 'projects',
  camera: INITIAL_CAMERA,
}

function isCamera(value: unknown): value is Camera {
  return typeof value === 'object' && value !== null
    && 'x' in value && typeof value.x === 'number' && Number.isFinite(value.x)
    && 'y' in value && typeof value.y === 'number' && Number.isFinite(value.y)
    && 'zoom' in value && typeof value.zoom === 'number'
    && Number.isFinite(value.zoom) && value.zoom > 0
}

function isView(value: unknown): value is ProjectBrowserView {
  return typeof value === 'object' && value !== null
    && 'query' in value && typeof value.query === 'string'
    && 'pageId' in value && typeof value.pageId === 'string' && value.pageId !== ''
    && 'camera' in value && isCamera(value.camera)
}

export function encodeProjectWindowState(store: ProjectMapStore, view: ProjectBrowserView): string {
  return JSON.stringify({ version: 1, document: Array.from(store.encodeState()), view })
}

export function restoreProjectWindowState(encoded: string): {
  store: ProjectMapStore
  view: ProjectBrowserView
} {
  const value: unknown = JSON.parse(encoded)
  if (typeof value !== 'object' || value === null
    || !('version' in value) || value.version !== 1
    || !('document' in value) || !Array.isArray(value.document)
    || !value.document.every((byte: unknown) =>
      typeof byte === 'number' && Number.isInteger(byte) && byte >= 0 && byte <= 255)
    || !('view' in value) || !isView(value.view)) {
    throw new Error('The transferred project browser state is invalid.')
  }
  return {
    store: createYProjectMapStore({ initialUpdate: new Uint8Array(value.document) }),
    view: structuredClone(value.view),
  }
}

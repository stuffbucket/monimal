export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

// WebAssembly exports are positional at this ABI boundary.
// eslint-disable-next-line max-params
type Intersects = (
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
) => number

// Compiled from a dependency-free eight-float AABB intersection function.
const WASM_GEOMETRY = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 13, 1, 96, 8, 125, 125, 125, 125, 125, 125,
  125, 125, 1, 127, 3, 2, 1, 0, 7, 14, 1, 10, 105, 110, 116, 101, 114, 115, 101,
  99, 116, 115, 0, 0, 10, 39, 1, 37, 0, 32, 0, 32, 4, 32, 6, 146, 95, 32, 0, 32,
  2, 146, 32, 4, 96, 113, 32, 1, 32, 5, 32, 7, 146, 95, 113, 32, 1, 32, 3, 146,
  32, 5, 96, 113, 11,
])

const instance = new WebAssembly.Instance(new WebAssembly.Module(WASM_GEOMETRY))
const wasmIntersects = instance.exports.intersects

if (typeof wasmIntersects !== "function") {
  throw new TypeError(
    "The project-map WebAssembly geometry export is unavailable",
  )
}

const intersects = wasmIntersects as Intersects

export const geometryBackend = "wasm" as const

export function rectanglesIntersect(a: Rectangle, b: Rectangle): boolean {
  return (
    intersects(a.x, a.y, a.width, a.height, b.x, b.y, b.width, b.height) === 1
  )
}

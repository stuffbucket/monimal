import { describe, expect, it } from "vitest"

import { positionInspectorCard } from "../src/positioning.js"

function box(values: Partial<DOMRect>): DOMRect {
  return {
    bottom: 500,
    height: 200,
    left: 200,
    right: 300,
    top: 300,
    width: 100,
    x: 200,
    y: 300,
    toJSON: () => ({}),
    ...values,
  }
}

describe("inspector card positioning", () => {
  it("chooses below when a target has equal space on either side", () => {
    const card = document.createElement("section")
    const target = document.createElement("button")
    card.getBoundingClientRect = () => box({ width: 380 })
    target.getBoundingClientRect = () => box({})

    positionInspectorCard(card, target, {
      innerHeight: 800,
      innerWidth: 1000,
    })

    expect(card.style.top).toBe("508px")
    expect(card.style.bottom).toBe("")
    expect(card.style.maxHeight).toBe("276px")
  })

  it("clamps both horizontal anchors to the viewport gutter", () => {
    const card = document.createElement("section")
    const target = document.createElement("button")
    card.getBoundingClientRect = () => box({ width: 380 })
    target.getBoundingClientRect = () =>
      box({ left: 200, right: 300, top: 600, bottom: 700 })

    positionInspectorCard(card, target, {
      innerHeight: 800,
      innerWidth: 500,
    })
    expect(card.style.left).toBe("104px")
    expect(card.style.right).toBe("")

    target.getBoundingClientRect = () =>
      box({ left: 260, right: 360, top: 600, bottom: 700 })
    positionInspectorCard(card, target, {
      innerHeight: 800,
      innerWidth: 500,
    })
    expect(card.style.right).toBe("104px")
    expect(card.style.left).toBe("")
  })
})

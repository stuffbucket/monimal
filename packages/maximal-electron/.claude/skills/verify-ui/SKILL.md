---
name: verify-ui
description: Verify shared renderer behavior in a real browser
---

# Verify a renderer change

1. Run `npm run storybook:build`.
2. Run `npm run storybook:check`.
3. Inspect computed layout or bounding boxes rather than class names.
4. Add the invariant to the responsible Storybook browser check.
5. Run the consuming desktop end-to-end scenario for product composition.

Unit tests MUST NOT be treated as layout evidence because jsdom has no layout
engine.

Screenshots MUST NOT be the only oracle.

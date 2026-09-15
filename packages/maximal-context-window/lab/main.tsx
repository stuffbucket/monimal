import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./theme.ts"
import "@stuffbucket/maximal-electron/renderer/styles.css"

import "../src/styles.css"
import { ContextWindowLab } from "./ContextWindowLab.tsx"

const root = document.querySelector("#root")
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <ContextWindowLab />
    </StrictMode>,
  )
}

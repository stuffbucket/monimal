import assert from "node:assert/strict"
import test from "node:test"

import { createManifest, QWEN3_0_6B_Q8_0_ARTIFACT } from "../src/manifest.ts"

void test("manifest pins the verified Qwen artifact lock", () => {
  assert.deepEqual(QWEN3_0_6B_Q8_0_ARTIFACT, {
    expectedBytes: 639_446_688,
    fileName: "Qwen3-0.6B-Q8_0.gguf",
    fileSignature: "47475546",
    sha256: "9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031",
    url: "https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/23749fefcc72300e3a2ad315e1317431b06b590a/Qwen3-0.6B-Q8_0.gguf",
  })
  const manifest = createManifest("none")
  assert.equal(manifest.fileSignature.hex, "47475546")
  assert.equal(manifest.sha256, QWEN3_0_6B_Q8_0_ARTIFACT.sha256)
  assert.equal(manifest.expectedBytes, QWEN3_0_6B_Q8_0_ARTIFACT.expectedBytes)
})

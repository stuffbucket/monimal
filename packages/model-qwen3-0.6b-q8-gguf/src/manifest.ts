import type {
  LocalModelManifest,
  LocalModelPublication,
} from "@stuffbucket/local-model-registry"

export const QWEN3_0_6B_Q8_0_ARTIFACT = Object.freeze({
  expectedBytes: 639_446_688,
  fileName: "Qwen3-0.6B-Q8_0.gguf",
  fileSignature: "47475546",
  sha256: "9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031",
  url: "https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/23749fefcc72300e3a2ad315e1317431b06b590a/Qwen3-0.6B-Q8_0.gguf",
})

export function createManifest(
  publication: LocalModelPublication,
): LocalModelManifest {
  return Object.freeze({
    capabilities: Object.freeze({
      input: Object.freeze(["text"]),
      output: Object.freeze(["text"]),
    }),
    context: Object.freeze({ contextWindow: 40_960 }),
    displayName: "Qwen3 0.6B Q8_0",
    expectedBytes: QWEN3_0_6B_Q8_0_ARTIFACT.expectedBytes,
    fileName: QWEN3_0_6B_Q8_0_ARTIFACT.fileName,
    fileSignature: Object.freeze({
      hex: QWEN3_0_6B_Q8_0_ARTIFACT.fileSignature,
    }),
    format: "gguf",
    key: "qwen3-0.6b-q8-gguf",
    modelId: "qwen3-0.6b",
    publication,
    sha256: QWEN3_0_6B_Q8_0_ARTIFACT.sha256,
  })
}

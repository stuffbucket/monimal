import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, URL } from "node:url"
import StyleDictionary from "style-dictionary"

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const formatName = "maximal/typescript-inspector-tokens"
const generatedRoot = path.join(packageRoot, "src/generated")
const temporaryBuildPath = fs.mkdtempSync(
  path.join(generatedRoot, ".inspector-tokens-"),
)

function propertyName(tokenPath) {
  return tokenPath
    .slice(1)
    .map((part, index) =>
      index === 0 ? part : `${part[0].toUpperCase()}${part.slice(1)}`,
    )
    .join("")
}

StyleDictionary.registerFormat({
  name: formatName,
  format: ({ dictionary }) => {
    const entries = dictionary.allTokens.map(
      (token) =>
        `  ${propertyName(token.path)}: ${JSON.stringify(
          token.$value,
        ).replaceAll(",", ", ")},`,
    )
    return `export const inspectorTokens = {\n${entries.join("\n")}\n} as const\n`
  },
})

const dictionary = new StyleDictionary({
  usesDtcg: true,
  tokens: JSON.parse(
    fs.readFileSync(path.join(packageRoot, "tokens/inspector.json"), "utf8"),
  ),
  platforms: {
    typescript: {
      transforms: ["name/camel"],
      buildPath: `${temporaryBuildPath}${path.sep}`,
      files: [
        {
          destination: "inspector-tokens.ts",
          format: formatName,
        },
      ],
    },
  },
})

try {
  await dictionary.buildAllPlatforms()
  fs.renameSync(
    path.join(temporaryBuildPath, "inspector-tokens.ts"),
    path.join(generatedRoot, "inspector-tokens.ts"),
  )
} finally {
  fs.rmSync(temporaryBuildPath, { recursive: true, force: true })
}

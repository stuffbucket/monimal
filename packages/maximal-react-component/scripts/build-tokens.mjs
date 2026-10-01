import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, URL } from "node:url"
import StyleDictionary from "style-dictionary"

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const formatName = "maximal/typescript-inspector-tokens"

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
      buildPath: `${path.join(packageRoot, "src/generated")}${path.sep}`,
      files: [
        {
          destination: "inspector-tokens.ts",
          format: formatName,
        },
      ],
    },
  },
})

await dictionary.buildAllPlatforms()

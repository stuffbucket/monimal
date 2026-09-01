import path from "node:path"

import * as ts from "typescript"

const ALLOWED_PROVIDER_HOST_PACKAGE =
  "@stuffbucket/maximal-provider-contract"
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const

export interface ProviderHostBoundaryViolation {
  file: string
  specifier: string
}

const forbiddenProviderHostSpecifier = (specifier: string): boolean => {
  if (
    specifier === ALLOWED_PROVIDER_HOST_PACKAGE
    || specifier.startsWith(`${ALLOWED_PROVIDER_HOST_PACKAGE}/`)
  ) {
    return false
  }

  const normalized = specifier.toLowerCase()
  return (
    normalized.includes("anthropic-provider")
    || normalized.includes("maximal-dsh-host")
    || /(?:^|[/@._-])(?:cordis|dsh|omlx)(?:$|[/@._-])/u.test(normalized)
  )
}

const literalText = (node: ts.Node | undefined): string | undefined =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ?
    node.text
  : undefined

export function findProviderHostImports(
  source: string,
  file = "source.ts",
): ProviderHostBoundaryViolation[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const violations: ProviderHostBoundaryViolation[] = []

  const record = (specifier: string | undefined): void => {
    if (specifier && forbiddenProviderHostSpecifier(specifier)) {
      violations.push({ file, specifier })
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      record(literalText(node.moduleSpecifier))
    } else if (ts.isImportEqualsDeclaration(node)) {
      const reference = node.moduleReference
      if (ts.isExternalModuleReference(reference)) {
        record(literalText(reference.expression))
      }
    } else if (ts.isImportTypeNode(node)) {
      record(
        ts.isLiteralTypeNode(node.argument) ?
          literalText(node.argument.literal)
        : undefined,
      )
    } else if (
      ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression)
          && node.expression.text === "require"))
    ) {
      record(literalText(node.arguments[0]))
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

export function findProviderHostManifestDependencies(
  manifest: Record<string, unknown>,
  file = "package.json",
): ProviderHostBoundaryViolation[] {
  const violations: ProviderHostBoundaryViolation[] = []
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = manifest[field]
    if (!dependencies || typeof dependencies !== "object") continue
    for (const name of Object.keys(dependencies)) {
      if (forbiddenProviderHostSpecifier(name)) {
        violations.push({ file: `${file}#${field}`, specifier: name })
      }
    }
  }
  return violations
}

export async function checkProviderHostBoundary(
  root: string,
): Promise<ProviderHostBoundaryViolation[]> {
  const violations: ProviderHostBoundaryViolation[] = []
  const manifestPath = path.join(root, "package.json")
  const manifest: unknown = await Bun.file(manifestPath).json()
  if (manifest && typeof manifest === "object") {
    violations.push(
      ...findProviderHostManifestDependencies(
        manifest as Record<string, unknown>,
        "package.json",
      ),
    )
  }

  const glob = new Bun.Glob("**/*.{ts,tsx,mts,cts}")
  for await (const relative of glob.scan({ cwd: path.join(root, "src") })) {
    const file = path.join("src", relative)
    const source = await Bun.file(path.join(root, file)).text()
    violations.push(...findProviderHostImports(source, file))
  }

  return violations
}

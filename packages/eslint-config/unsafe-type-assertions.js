const TEST_PATH_PATTERN = /(?:^|[/\\])(?:tests?|__tests__)(?:[/\\]|$)|\.test\.[cm]?[jt]sx?$/u

function assertionType(node) {
  return node.typeAnnotation ?? node.type
}

function isAssertion(node) {
  return node?.type === "TSAsExpression" || node?.type === "TSTypeAssertion"
}

function isMemberNamed(node, name) {
  return node?.type === "MemberExpression"
    && !node.computed
    && node.property.type === "Identifier"
    && node.property.name === name
}

function isJsonParse(node) {
  return node?.type === "CallExpression"
    && isMemberNamed(node.callee, "parse")
    && node.callee.object.type === "Identifier"
    && node.callee.object.name === "JSON"
}

function isJsonMethodCall(node) {
  const expression = node?.type === "AwaitExpression" ? node.argument : node
  return expression?.type === "CallExpression"
    && isMemberNamed(expression.callee, "json")
}

function isEnvironmentAccess(node) {
  if (node?.type !== "MemberExpression") return false
  if (
    isMemberNamed(node.object, "env")
    && node.object.object.type === "Identifier"
    && node.object.object.name === "process"
  ) {
    return true
  }
  if (
    isMemberNamed(node.object, "env")
    && node.object.object.type === "MetaProperty"
    && node.object.object.meta.name === "import"
  ) {
    return true
  }
  return isEnvironmentAccess(node.object)
}

function boundaryKind(node) {
  if (isJsonParse(node)) return "json-parse"
  if (isJsonMethodCall(node)) return "response-json"
  if (isEnvironmentAccess(node)) return "environment"
  return undefined
}

function unsafeAssertionKind(node, filename) {
  const target = assertionType(node)
  if (
    isAssertion(node.expression)
    && ["TSAnyKeyword", "TSUnknownKeyword"].includes(
      assertionType(node.expression)?.type,
    )
  ) {
    return "double-assertion"
  }
  if (
    target?.type === "TSAnyKeyword"
    && !isAssertion(node.parent)
  ) {
    return "as-any"
  }
  if (
    target?.type === "TSNeverKeyword"
    && !TEST_PATH_PATTERN.test(filename)
  ) {
    return "as-never"
  }
  const boundary = boundaryKind(node.expression)
  return boundary === undefined ? undefined : `unvalidated-${boundary}`
}

export const unsafeTypeAssertionsRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Warn about unsafe TypeScript assertions at trust boundaries.",
    },
    messages: {
      unsafe:
        "Unsafe type assertion ({{kind}}); validate the value or narrow it without an assertion.",
      directive:
        "Unsafe TypeScript suppression ({{kind}}); use a checked expectation or fix the type.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename
    const checkAssertion = (node) => {
      const kind = unsafeAssertionKind(node, filename)
      if (kind !== undefined) {
        context.report({ node, messageId: "unsafe", data: { kind } })
      }
    }
    return {
      TSAsExpression: checkAssertion,
      TSTypeAssertion: checkAssertion,
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const match = comment.value.match(/@ts-(ignore|nocheck)\b/u)
          if (match !== null) {
            context.report({
              loc: comment.loc,
              messageId: "directive",
              data: { kind: `ts-${match[1]}` },
            })
          }
        }
      },
    }
  },
}

export const unsafeTypeAssertionsPlugin = {
  rules: {
    "no-unsafe-type-assertions": unsafeTypeAssertionsRule,
  },
}

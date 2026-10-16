#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const NAMED_COLORS = new Set(`
  aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond
  blue blueviolet brown burlywood cadetblue chartreuse chocolate coral
  cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
  darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid
  darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey
  darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
  firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod
  gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
  lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon
  lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue
  lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
  mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen
  mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
  navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod
  palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
  powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon
  sandybrown seagreen seashell sienna silver skyblue slateblue slategray
  slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet
  wheat white whitesmoke yellow yellowgreen
`.trim().split(/\s+/u));

const COLOR_FUNCTION =
  /\b(?:color|color-mix|device-cmyk|hsl|hsla|hwb|lab|lch|oklab|oklch|rgb|rgba)\s*\(/giu;
const HEX_COLOR = /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\da-f])/giu;
const DIMENSION = /(?<![\w.-])-?(?:\d+\.\d+|\d+|\.\d+)(?:px|rem|em)\b/giu;
const TIME = /(?<![\w.-])(?:\d+\.\d+|\d+|\.\d+)(?:ms|s)\b/giu;

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function filesBelow(directory, extensions) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) =>
    compareText(left.name, right.name)
  )) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await filesBelow(absolute, extensions));
    } else if (extensions.has(path.extname(entry.name))) {
      files.push(absolute);
    }
  }
  return files;
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function finding(source, offset, message, priority = 0) {
  return { line: lineNumber(source, offset), message, offset, priority };
}

function propertyNameText(name) {
  if (
    ts.isIdentifier(name)
    || ts.isStringLiteral(name)
    || ts.isNumericLiteral(name)
    || ts.isPrivateIdentifier(name)
  ) {
    return name.text;
  }
  if (
    ts.isComputedPropertyName(name)
    && (ts.isStringLiteral(name.expression)
      || ts.isNoSubstitutionTemplateLiteral(name.expression))
  ) {
    return name.expression.text;
  }
  return undefined;
}

function declaredPropertyName(node) {
  if (
    ts.isPropertySignature(node)
    || ts.isMethodSignature(node)
    || ts.isPropertyDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
    || ts.isPropertyAssignment(node)
    || ts.isShorthandPropertyAssignment(node)
    || ts.isJsxAttribute(node)
  ) {
    return propertyNameText(node.name);
  }
  if (
    ts.isBindingElement(node)
    && node.parent
    && ts.isObjectBindingPattern(node.parent)
  ) {
    return propertyNameText(node.propertyName ?? node.name);
  }
  if (
    ts.isParameter(node)
    && node.modifiers?.some(({ kind }) =>
      kind === ts.SyntaxKind.PublicKeyword
      || kind === ts.SyntaxKind.ProtectedKeyword
      || kind === ts.SyntaxKind.PrivateKeyword
      || kind === ts.SyntaxKind.ReadonlyKeyword
    )
  ) {
    return propertyNameText(node.name);
  }
  if (
    ts.isPropertyAccessExpression(node)
    || ts.isPropertyAccessChain(node)
  ) {
    return node.name.text;
  }
  if (
    (ts.isElementAccessExpression(node) || ts.isElementAccessChain(node))
    && node.argumentExpression
    && (ts.isStringLiteral(node.argumentExpression)
      || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
  ) {
    return node.argumentExpression.text;
  }
  return undefined;
}

function domLikePropFindings(source, fileName, forbiddenProps) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings = [];

  function visit(node) {
    const name = declaredPropertyName(node);
    if (name && forbiddenProps.has(name)) {
      const nameNode = node.name ?? node.propertyName ?? node.argumentExpression ?? node;
      findings.push(finding(
        source,
        nameNode.getStart(sourceFile),
        `invented DOM-like prop: ${name}`,
      ));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

function skipCssCommentOrString(source, position, end) {
  if (source.startsWith('/*', position)) {
    const close = source.indexOf('*/', position + 2);
    return close === -1 || close + 2 > end ? end : close + 2;
  }
  const quote = source[position];
  if (quote !== '"' && quote !== "'") return position;
  for (let cursor = position + 1; cursor < end; cursor += 1) {
    if (source[cursor] === '\\') {
      cursor += 1;
    } else if (source[cursor] === quote) {
      return cursor + 1;
    }
  }
  return end;
}

function cssDeclarations(source) {
  const declarations = [];
  let nextBlockId = 1;

  function addDeclaration(start, colon, end, blockId) {
    const propertySource = source.slice(start, colon);
    const property = propertySource
      .replaceAll(/\/\*[\s\S]*?\*\//gu, ' ')
      .trim()
      .toLowerCase();
    if (!/^(?:--)?[\w-]+$/u.test(property)) return;
    let propertyStart = start;
    while (propertyStart < colon) {
      if (/\s/u.test(source[propertyStart])) {
        propertyStart += 1;
        continue;
      }
      const skipped = skipCssCommentOrString(source, propertyStart, colon);
      if (skipped !== propertyStart && source.startsWith('/*', propertyStart)) {
        propertyStart = skipped;
        continue;
      }
      break;
    }
    const valueStart = colon + 1 + (source.slice(colon + 1, end).match(/^\s*/u)?.[0].length ?? 0);
    const valueEnd = end - (source.slice(colon + 1, end).match(/\s*$/u)?.[0].length ?? 0);
    declarations.push({
      blockId,
      property,
      propertyStart,
      value: source.slice(valueStart, valueEnd),
      valueStart,
    });
  }

  function parseBlock(start, end, blockId) {
    let segmentStart = start;
    let colon = -1;
    let parentheses = 0;
    let brackets = 0;

    for (let cursor = start; cursor < end; cursor += 1) {
      const skipped = skipCssCommentOrString(source, cursor, end);
      if (skipped !== cursor) {
        cursor = skipped - 1;
        continue;
      }
      const character = source[cursor];
      if (character === '(') parentheses += 1;
      else if (character === ')' && parentheses > 0) parentheses -= 1;
      else if (character === '[') brackets += 1;
      else if (character === ']' && brackets > 0) brackets -= 1;
      else if (parentheses === 0 && brackets === 0 && character === '{') {
        const childBlockId = nextBlockId;
        nextBlockId += 1;
        cursor = parseBlock(cursor + 1, end, childBlockId);
        segmentStart = cursor + 1;
        colon = -1;
      } else if (
        parentheses === 0
        && brackets === 0
        && character === ':'
        && colon === -1
      ) {
        colon = cursor;
      } else if (
        parentheses === 0
        && brackets === 0
        && (character === ';' || character === '}')
      ) {
        if (colon !== -1) addDeclaration(segmentStart, colon, cursor, blockId);
        segmentStart = cursor + 1;
        colon = -1;
        if (character === '}') return cursor;
      }
    }
    if (colon !== -1) addDeclaration(segmentStart, colon, end, blockId);
    return end;
  }

  parseBlock(0, source.length, 0);
  return declarations;
}

function maskedCssValue(value) {
  const characters = value.split('');
  for (let cursor = 0; cursor < value.length; cursor += 1) {
    const skipped = skipCssCommentOrString(value, cursor, value.length);
    if (skipped !== cursor) {
      for (let index = cursor; index < skipped; index += 1) {
        if (characters[index] !== '\n') characters[index] = ' ';
      }
      cursor = skipped - 1;
    }
  }

  const masked = characters.join('');
  for (const match of masked.matchAll(/\burl\s*\(/giu)) {
    let depth = 1;
    let cursor = match.index + match[0].length;
    for (; cursor < masked.length && depth > 0; cursor += 1) {
      if (masked[cursor] === '(') depth += 1;
      else if (masked[cursor] === ')') depth -= 1;
      if (depth > 0 && characters[cursor] !== '\n') characters[cursor] = ' ';
    }
  }
  return characters.join('');
}

function declarationText(declaration) {
  return `${declaration.property}: ${declaration.value}`;
}

function isColorProperty(property) {
  return property.startsWith('--')
    || /(?:^|-)(?:background|border|color|fill|outline|shadow|stroke)(?:-|$)/u.test(property)
    || /^(?:accent-color|caret-color|column-rule|filter|text-decoration|text-emphasis)$/u.test(property);
}

function colorMatches(maskedValue) {
  const matches = [
    ...maskedValue.matchAll(HEX_COLOR),
    ...maskedValue.matchAll(COLOR_FUNCTION),
  ];
  return matches.sort((left, right) => left.index - right.index);
}

function namedColorMatches(maskedValue) {
  return [...maskedValue.matchAll(/(?<![-\w])[\w]+(?![-\w])/gu)]
    .filter((match) => NAMED_COLORS.has(match[0].toLowerCase()));
}

function visuallyHiddenBlocks(declarations) {
  const byBlock = new Map();
  for (const declaration of declarations) {
    const properties = byBlock.get(declaration.blockId) ?? new Map();
    properties.set(declaration.property, declaration.maskedValue.trim().toLowerCase());
    byBlock.set(declaration.blockId, properties);
  }
  return new Set(
    [...byBlock]
      .filter(([, properties]) =>
        properties.get('position') === 'absolute'
        && properties.get('width') === '1px'
        && properties.get('height') === '1px'
        && properties.get('overflow') === 'hidden'
        && /^rect\(\s*0(?:\s*,\s*0){3}\s*\)$/u.test(properties.get('clip') ?? '')
      )
      .map(([blockId]) => blockId),
  );
}

function hasForbiddenSpatialLiteral(
  declaration,
  maskedValue,
  allowedVisuallyHiddenBlocks,
) {
  for (const match of maskedValue.matchAll(DIMENSION)) {
    const literal = match[0].toLowerCase();
    const absolute = literal.startsWith('-') ? literal.slice(1) : literal;
    if (/^0(?:\.0+)?(?:px|rem|em)$/u.test(absolute)) continue;
    if (
      absolute === '1px'
      && allowedVisuallyHiddenBlocks.has(declaration.blockId)
      && /^(?:height|width)$/u.test(declaration.property)
    ) {
      continue;
    }
    return true;
  }
  return false;
}

function cssPolicyFindings(source, config) {
  const declarations = cssDeclarations(source);
  const prepared = declarations.map((declaration) => ({
    ...declaration,
    maskedValue: maskedCssValue(declaration.value),
  }));
  const allowedVisuallyHiddenBlocks = visuallyHiddenBlocks(prepared);
  const findings = [];

  if (config.forbidImportantDeclarations) {
    for (const declaration of prepared) {
      const match = /!\s*important\b/iu.exec(declaration.maskedValue);
      if (match) {
        findings.push(finding(
          source,
          declaration.valueStart + match.index,
          'important declaration: !important',
          0,
        ));
      }
    }
  }

  if (config.forbidLiteralColors) {
    for (const declaration of prepared) {
      const matches = colorMatches(declaration.maskedValue);
      if (isColorProperty(declaration.property)) {
        matches.push(...namedColorMatches(declaration.maskedValue));
        matches.sort((left, right) => left.index - right.index);
      }
      for (const match of matches) {
        findings.push(finding(
          source,
          declaration.valueStart + match.index,
          `literal color: ${declaration.value.slice(match.index, match.index + match[0].length)}`,
          1,
        ));
      }
    }
  }

  if (config.forbidLiteralSpatialDimensions) {
    for (const declaration of prepared) {
      if (hasForbiddenSpatialLiteral(
        declaration,
        declaration.maskedValue,
        allowedVisuallyHiddenBlocks,
      )) {
        findings.push(finding(
          source,
          declaration.propertyStart,
          `literal spatial dimension: ${declarationText(declaration)}`,
          2,
        ));
      }
    }
  }

  if (config.forbidLiteralStackingLevels) {
    for (const declaration of prepared) {
      if (
        declaration.property === 'z-index'
        && /(?<![\w.-])-?\d+(?![\w.-])/u.test(declaration.maskedValue)
      ) {
        findings.push(finding(
          source,
          declaration.propertyStart,
          `literal stacking level: ${declarationText(declaration)}`,
          3,
        ));
      }
    }
  }

  if (config.forbidLiteralMotionDurations) {
    for (const declaration of prepared) {
      if (
        /^(?:animation|transition)(?:-|$)/u.test(declaration.property)
        && TIME.test(declaration.maskedValue)
      ) {
        TIME.lastIndex = 0;
        findings.push(finding(
          source,
          declaration.propertyStart,
          `literal motion duration: ${declarationText(declaration)}`,
          4,
        ));
      }
      TIME.lastIndex = 0;
    }
  }

  return findings;
}

export async function qualityPolicyFindings(root = process.cwd()) {
  const config = JSON.parse(await readFile(path.join(root, 'quality.config.json'), 'utf8'));
  const findings = [];
  const sourceRoot = path.join(root, 'src');
  const sourceFiles = await filesBelow(sourceRoot, new Set(['.ts', '.tsx']));
  const styleFiles = await filesBelow(path.join(sourceRoot, 'styles'), new Set(['.css']));
  const forbiddenProps = new Set(config.source.forbiddenDomLikeProps);

  for (const file of sourceFiles) {
    if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
    const source = await readFile(file, 'utf8');
    for (const sourceFinding of domLikePropFindings(
      source,
      file,
      forbiddenProps,
    )) {
      findings.push({
        file: path.relative(root, file),
        ...sourceFinding,
      });
    }
  }

  for (const file of styleFiles) {
    const source = await readFile(file, 'utf8');
    for (const styleFinding of cssPolicyFindings(source, config.source)) {
      findings.push({
        file: path.relative(root, file),
        ...styleFinding,
      });
    }
  }

  return findings
    .sort((left, right) =>
      compareText(left.file, right.file)
      || left.line - right.line
      || left.priority - right.priority
      || left.offset - right.offset
      || compareText(left.message, right.message)
    )
    .map(({ file, line, message }) => ({ file, line, message }));
}

export async function main(argv = process.argv.slice(2)) {
  const positional = argv.filter((argument) => argument !== '--');
  if (positional.length > 1) {
    throw new Error('Usage: maximal-ds-source-quality [project-root]');
  }
  const root = path.resolve(positional[0] ?? process.cwd());
  const findings = await qualityPolicyFindings(root);
  if (findings.length === 0) {
    console.log(`Source quality policy passed for ${root}.`);
    return;
  }

  for (const policyFinding of findings) {
    console.error(
      `${policyFinding.file}:${String(policyFinding.line)} ${policyFinding.message}`,
    );
  }
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

# Export Query Tool

A lightweight workspace tool for querying the monorepo's package export maps without running full verification gates.

## Purpose

When writing code in Package A that mirrors or echoes an export available in Package B, you need to quickly check:
- Does Package B export this symbol?
- What exports does Package B provide?
- Is this export already available, or do I need to write it?

This tool answers those questions in milliseconds by parsing `package.json#exports` fields across all packages.

## Usage

### List all packages and their exports

```bash
# Summary counts
node scripts/query-exports.mjs --summary

# Full list (human-readable)
node scripts/query-exports.mjs --all

# Full list (JSON)
node scripts/query-exports.mjs --all --json
```

Example output:
```json
{
  "packages": 15,
  "exports": 58,
  "byPackage": {
    "@stuffbucket/maximal-core": 9,
    "@stuffbucket/maximal-electron": 11,
    ...
  }
}
```

### Query a specific package

```bash
# List all exports from a package
node scripts/query-exports.mjs @stuffbucket/maximal-core

# Check if a specific export exists
node scripts/query-exports.mjs @stuffbucket/maximal-core ./settings-types
```

Example output:
```
✓ @stuffbucket/maximal-core exports ./settings-types
```

or

```
✗ @stuffbucket/maximal-core does not export ./nonexistent

  Available exports:
    ./client
    ./configurator-host
    ./contract
    ...
```

### JSON output

Add `--json` to get structured output:

```bash
node scripts/query-exports.mjs @stuffbucket/maximal-core --json
node scripts/query-exports.mjs @stuffbucket/maximal-core ./settings-types --json
```

## Integration

The tool is automatically checked during `pnpm run verify:workspace`:

```bash
pnpm run verify:workspace
# ...
# ok   workspace export map is loadable (for query-exports tooling)  [15 packages with exports]
```

This verifies that the export map is loadable and accessible to tools that depend on it.

## Design

- **No context window bloat** — Returns concise results suitable for embedding in LLM prompts
- **Fast** — Reads manifests once, not invoking verification gates
- **Queryable** — Supports both programmatic imports and CLI usage
- **Integrated** — Part of workspace verification, so it's kept in sync as packages evolve

## Programmatic Usage

Import and use `loadWorkspaceExports` from your own scripts:

```javascript
import { loadWorkspaceExports } from './query-exports.mjs';

const packages = loadWorkspaceExports(ROOT);
// Map<string, { path, exports, manifest }>

packages.forEach((pkg, name) => {
  console.log(`${name}: ${pkg.exports.length} exports`);
});
```

## FAQ

**Q: Why not just read `package.json` files directly?**  
A: This tool uses `pnpm ls` to ensure it sees the same package set that the package manager knows about, and to handle absolute paths correctly.

**Q: Is this a substitute for the individual `verify:exports` gates?**  
A: No. This is a discovery and query tool. Each package's `verify:exports` or equivalent still runs the strict checks (missing files, broken links, accessibility). This tool is for "does this export exist?" questions before you start writing code.

**Q: How often is the export map updated?**  
A: Every time you modify a `package.json#exports` field in the workspace. The tool reads from the working tree.

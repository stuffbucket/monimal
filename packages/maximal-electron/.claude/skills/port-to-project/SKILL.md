---
name: port-to-project
description: Consume the Maximal Electron library from an Electron application
---

# Consume this package

1. Install the peers for the subpaths the application imports.
2. Import host APIs only from the declared package export map.
3. Supply an application-owned preload and renderer loader.
4. Import the renderer stylesheet and define the required `--shell-*` tokens.
5. Keep native terminal modules external and unpack their prebuild directory.
6. Run `@maximal/maximal-electron/verify` against the application artifact.
7. Keep application packaging, signing, icons, and release policy in the
   consumer.

The consumer MUST NOT copy internal package modules or recreate a standalone
application inside this package.

# Signing

Nothing in this repository is signed. There is no code-signing step on either
platform, and no credential of any kind. `npm run package` produces an unsigned
`.app` and an unsigned `win32` directory.

**No Apple credential belongs in this repository.** If you find one here, that
is a defect. That rule outlives the pipeline that used to need one.

## Why there is none

Signing existed to produce a signed dmg. The dmg is gone, and so is everything
that produced it. See `docs/release.md` for the removal and the reasons.

The macOS half never worked in the first place. It required a builder
credential that nobody ever minted, so no signed build was ever produced for
this repository (#69). The Windows half was never attempted: `maximal`'s
release workflow states the same position, "Windows Authenticode signing —
DEFERRED. v1 ships unsigned."

## What this costs

- **macOS.** Gatekeeper refuses to open an unsigned bundle on a machine other
  than the one that built it. Right-click, Open, and confirm is the local
  workaround. There is no workaround for distribution.
- **Windows.** SmartScreen warns on first run, and would keep warning until a
  certificate accumulated reputation.

Neither cost lands on `stuffbucket/maximal`, which consumes this shell as a
library and signs its own application.

## Restoring macOS signing

Recorded so that a fork does not have to rediscover it.

`stuffbucket` is a personal GitHub user account, not an organisation, so shared
self-hosted runners are unavailable and client repositories are public. A
self-hosted runner or an Apple secret on a public repository is a serious risk:
a fork can open a pull request that runs code.

The answer that shape produces is a private builder. One private repository,
`stuffbucket/macos-builder`, concentrates the runner and every Apple secret.
Public repositories only trigger it.

| Side | Holds |
| --- | --- |
| Builder (private) | The runner, and every Apple secret |
| A client repository | One secret, scoped to Actions: write on the builder |

That secret's only power is to start a build. It cannot read an Apple secret or
reach another repository. The builder reaches back with a short-lived,
per-client installation token from the `app-repoman` GitHub App, so there is no
long-lived builder token.

A client supplies two files: a config declaring the bundle identifier, the
entitlement set, and the artifact name, and a producer script that builds the
unsigned `.app` and stops. It also does two manual onboarding steps that cannot
be scripted: installing `app-repoman` with Contents read and write, and adding
the secret.

The entitlement set is one of the builder's enumerated names: `default`
(hardened runtime, no added capability), `network`, `virtualization`, or
`bun-runtime`. An Electron application with no sidecar needs `default`. Do not
widen it. Each added capability weakens the hardened runtime, and the builder
validates the value against an allow-list anyway.

## Restoring Windows signing

1. A code-signing certificate. An Extended Validation certificate gets
   SmartScreen reputation immediately; a standard one accumulates it over
   downloads. Azure Trusted Signing avoids handling a private key.
2. Two secrets on the repository, or a `signCommand` pointing at a key vault.
3. A signing step in whatever job produces the artifact, before any checksum is
   taken. Sign the `.exe` inside the package as well as any wrapper around it.

The checksum-after-signing ordering is the part that is easy to get wrong.

## Verifying a signed build

macOS, on a Mac, once signing exists:

```bash
codesign --verify --deep --strict --verbose=2 /Applications/Stuffbucket.app
spctl -a -t exec -vv /Applications/Stuffbucket.app
```

Windows, once signing exists:

```powershell
Get-AuthenticodeSignature .\Stuffbucket.exe | Format-List
```

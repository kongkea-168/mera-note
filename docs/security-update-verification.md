# Dependency security verification — 2026-11-05

Updates PR #3 from commit `7117ff2bfe0d4eed809baa7a1be6452f32560bf5`.

## Changes

- Refresh direct dependency minimum versions and the complete npm lockfile.
- Upgrade Electron from 42.5.1 to the current stable 45.2.3, including its Chromium/Node runtime. Development now requires Node 22.12.0 or newer.
- Resolve the remaining packaging-tool advisory with `minimatch` overridden to `^11.0.4`. Explicit consumer exceptions retain patched version 3 for `@electron/asar`, `dir-compare`, and `glob`, and patched version 5 for `filelist`. Both modern packaging consumers use supported named exports (`minimatch` and `Minimatch`). The explicit overrides remain valid even without npm's hidden dependency-tree cache; the original range-based override did not.
- Add real Electron smoke tests, an `npm run verify` command, and macOS/Windows CI with read-only repository permissions and pinned GitHub Actions. CI builds and tests without publishing.
- Fix an existing toolbar overflow discovered during runtime testing: the controls now wrap into two rows so all themes and Hide fit inside the default window. No note format or storage location changed.

Selected resolved versions:

| Dependency | Updated version |
| --- | --- |
| Electron | 45.2.3 |
| electron-builder | 26.18.0 |
| Vite | 8.3.6 |
| brace-expansion | 1.1.21 / 2.1.7 / 5.0.12 |
| fast-uri | 3.1.9 |
| undici | 6.29.1 / 7.30.1 |
| postcss | 8.5.32 |
| nanoid | 3.3.20 |
| shell-quote | 1.12.0 |
| minimatch (affected consumers) | 11.0.4 |

## Verification performed

Host: macOS ARM64, Node 22.22.3, npm 10.9.8.

| Check | Result |
| --- | --- |
| Fresh `npm ci` with lifecycle scripts enabled | PASS |
| `npm ls --all` after fresh install and a packaging check | PASS |
| Full `npm audit`, including development dependencies | PASS: 0 known vulnerabilities |
| `npm run lint` and production renderer build | PASS |
| Production-source Electron smoke suite | PASS: 7 scenarios plus enclosing test, 8/8 reported |
| Packaged macOS ARM64 executable, same smoke suite | PASS: 8/8 reported |
| macOS x64 and ARM64 DMG generation | PASS |
| Windows x64 + ARM64 NSIS installer generation from macOS | PASS |
| All four app payloads contain renderer/preload/main and exclude test tooling | PASS |
| Screenshot inspection | PASS: Khmer text and toolbar controls visible |
| `git diff --check` | PASS |

The smoke suite exercises local loading, sandbox/context isolation, absence of renderer Node access, the limited preload bridge, CSP, Khmer/English editing and autosave, literal HTML handling, all ten themes, bundled font loading, font and color controls, persistence across restart, rejection of note access from another window, IPC size/font limits, popup refusal, and hide/restore behavior. Every run uses a temporary user-data directory; existing user notes are not read or modified.

Local logs and screenshots are in the ignored `test-results/` directory. Installers are in the ignored `release/` directory.

## Remaining merge gates and limits

- Native Windows execution has not run on this macOS host. Require the new Windows CI job to pass, including its packaged executable test, before merging.
- The macOS x64 package was built and inspected, but not executed on a physical Intel Mac.
- Installers remain unsigned and unnotarized, as before. No installer was published or installed over the user's existing app.
- Global shortcut registration is application behavior, but physical keyboard shortcut activation and OS context-menu/Telegram integration were not automated by this suite.
- Zero audit findings means no matching advisories in npm's database at verification time, not proof that every possible vulnerability is absent.

## Reproduce

```sh
npm ci
npm ls --all
npm run verify
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build -- --x64 --arm64 --publish never
MERA_TEST_EXECUTABLE="$PWD/release/mac-arm64/MERA Note.app/Contents/MacOS/MERA Note" node --test tests/electron.test.mjs
```

On Windows, use the platform-specific build and packaged test commands in `.github/workflows/verify.yml`.

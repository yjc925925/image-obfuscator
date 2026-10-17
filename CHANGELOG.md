# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-10-17

### Added

- **ZIP import.** Drop a `.zip` on the page (or pick it with **选 ZIP**) and the images inside are
  extracted in the browser, so nothing has to be unzipped on a phone. `src/unzip.js` reads the
  central directory itself and inflates entries with `DecompressionStream('deflate-raw')`; stored
  entries are copied as-is. Password-protected archives are refused with a readable message, nested
  folders are flattened, non-image entries are skipped, and one broken entry never fails the batch.
- Per-row checkboxes in the result list, with a **全选** toggle and **一键下载 / 一键删除** buttons
  that only act on the ticked rows.
- `test/unzip.mjs` (14 checks) — hand-built archives (stored, deflated, encrypted, truncated, empty,
  unsupported method) asserted without touching the network.

### Changed

- The build now inlines six modules (`unzip.js` added) and refuses to write output unless it finds
  exactly six inlined scripts.
- `test/e2e.js` grew to 94 checks: ZIP import through both the drop path and the file picker, the
  latter with a deflate-compressed archive built in-page so the inflate branch is exercised.

## [1.1.0] - 2026-10-16

The repository now holds the project rather than only its output: the full source tree, the test
suites, and the build script were folded in from the `img-mixer` repository, which is retired.
Everything below the app's UI is unchanged — `index.html` here is byte-for-byte the file that was
published as v1.0.1.

### Added

- `src/` — the five JavaScript modules the single file is assembled from (`crypto.js`, `codec.js`,
  `codec2.js`, `zip.js`, `app.js`), the page shell `src/index.html`, and the development-only
  in-page self-check `src/selftest.js`.
- `test/core.mjs` (83 checks) and `test/core2.mjs` (177 checks) — Node suites that assert the
  thorough and envelope codecs directly, including SHA-256 vectors checked against `node:crypto`,
  round-trips across ten image sizes and five passwords, obfuscation strength, and rejection of
  wrong passwords, tampered headers, and foreign PNGs.
- `test/browser.mjs`, `test/ui.mjs`, `test/e2e.js`, `test/fsa.mjs`, `test/live.mjs` — in-browser and
  end-to-end suites driven over the Chrome DevTools Protocol.
- `build.mjs` and `tools/clean.mjs` — the bundler. It inlines the five modules, then refuses to
  write output unless it finds exactly five inlined scripts and no remaining external `src`/`href`
  references, which is what keeps the artifact genuinely self-contained.
- `index.html` and `图片混淆器.html` at the repository root: the same 50,901 bytes under an English
  and a Chinese name. GitHub Pages serves `index.html`, which also makes the project directly
  playable from the repository page.
- `docs/img-mixer-notes.md` — the retired repository's README, archived for its Chinese guide.

### Changed

- The build now writes to the repository root instead of `dist/` and `docs/index.html`. One
  artifact in one place beats three copies that drift.
- `README.md` rewritten around measured behaviour: an algorithm comparison table, a measured
  canvas-size table, per-platform instructions, the byte format of both algorithms, and the
  original Chinese guide, kept and extended rather than replaced.
- `tests/codec-smoke.mjs` removed — the two codec suites cover everything it did and far more.

### Fixed

- Corrected the size claims carried in v1.0.0 and v1.0.1. The English notes stated that standard
  mode scaled the picture up by ~1.2247× per side and that thorough mode grew volume by up to
  1.7×. Both were inferred from the design rather than measured, and both are wrong: the envelope
  sizes its canvas to the *embedded payload*, so at typical JPEG densities the output is **smaller**
  than the original (0.283×–0.297× per side), and only a heavy file inside a small picture scales
  it up (1.88× per side for 20 MB inside 1920×1080). Thorough mode adds `ceil(16 / height)`
  columns, i.e. 1.0008× per side at 1280×720. The numbers in the README now come from running the
  codec.

## [1.0.1] - 2026-10-16

### Fixed

- Clicking **下载** on a finished item now always routes through the save path. Previously, when
  "保存到文件夹" was ticked but no folder had been chosen yet, the click fell through to the
  browser's default download instead of opening the directory picker, so output landed in the
  downloads folder even though the checkbox asked for a folder.

## [1.0.0] - 2026-10-08

First public release. Single-file, zero-dependency, offline image obfuscator.

### Added

- **Standard · file envelope** algorithm: rebuilds the original picture on a canvas scaled
  ~1.2247× per side, then embeds the complete original file — header, filename, and bytes —
  into the remaining pixels. Restore returns the original file byte-for-byte along with its
  name and true dimensions.
- **Thorough · full scramble** algorithm: pads the canvas by up to 16 columns of encryption
  room, permutes every pixel with a keyed Fisher–Yates shuffle, and XORs the RGB stream, so
  the output reads as static while restore is pixel-perfect.
- Password-derived key: `SHA-256(password ‖ 8-byte nonce)` iterated 4096 times, seeding an
  `sfc32` keystream that drives both the pixel permutation and the XOR mask. A built-in
  default key applies when the password is left empty.
- Self-describing format with a payload `SHA-256` checksum and an authentication tag, so a
  wrong password is reported as a wrong password and corruption is reported as corruption.
  Legacy `CWO1` (algorithm version 1) images decode but are no longer produced.
- Auto-detection: the restore tab identifies which algorithm produced a file and unpacks it
  without the user choosing anything.
- Batch workflow: multi-file and whole-folder selection (drag-and-drop or picker), per-item
  progress with a cancel button, preview overlay, and a ZIP export writer built from scratch
  (UTF-8 names, CRC-32, duplicate-name tolerance) so no third-party library is needed.
- Optional "save into a folder" mode via the File System Access API, with automatic fallback
  to ordinary downloads on browsers that lack it.
- Hard limits surfaced as plain-language errors: 48,000,000 pixels per canvas, 32,000 px per
  side, 100 characters for the embedded filename, PNG-only output.
- `tests/codec-smoke.mjs`: loads the three DOM-free codec blocks in Node and verifies SHA-256
  vectors, keystream determinism, pixel-perfect round-trips (empty, ASCII, and non-ASCII
  passwords), byte-for-byte file round-trips, wrong-password rejection, algorithm
  auto-detection, and rejection of foreign PNGs.
- Bilingual README (English and Chinese) documenting the format, the threat model, and the
  deliberate limits of the obfuscation.

### Security

- The page is fully offline: no external URLs, no `fetch`/`XMLHttpRequest`/`WebSocket`, no
  `eval`/`new Function`/`document.write`, and no inline event handlers.
- Passwords are never stored, transmitted, or written to disk; they exist only in the input
  field for the duration of a session.
- The mechanism is documented honestly as obfuscation rather than encryption. A password
  raises the cost of an offline attack but is not a defence against one.

[1.0.0]: https://github.com/yjc925925/image-obfuscator/releases/tag/v1.0.0
[1.0.1]: https://github.com/yjc925925/image-obfuscator/releases/tag/v1.0.1
[1.1.0]: https://github.com/yjc925925/image-obfuscator/releases/tag/v1.1.0

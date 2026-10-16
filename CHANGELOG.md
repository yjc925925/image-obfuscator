# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

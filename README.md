# Image Obfuscator · 图片混淆器

**Let obscure-looking PNGs stand in for images you'd rather not show.** Pick one or many
images, mix them into scrambled PNGs, and share those instead. Same password restores the
originals — byte-for-byte.

A **single HTML file**. No build step, no install, no server, **no network**: the page never
makes a single request once it is loaded, and every pixel is processed locally in your browser.

![Image Obfuscator](docs/screenshot.png)

---

## Quick start

1. Download [`image-obfuscator.html`](image-obfuscator.html) (or run it from GitHub Pages) — [Run it in your browser →](https://yjc925925.github.io/image-obfuscator/)
2. Open the file in a browser.
3. Drop in images, type a password, press **开始混淆** (Mix).
4. Share the resulting `*.mix.png` files.
5. To restore: switch to the **还原图片** (Restore) tab, drop the PNGs in, enter the same password.

Everything works offline forever; there is nothing to keep alive.

---

## The two algorithms

| | 标准 · 原文件封装<br>Standard · file envelope | 彻底 · 全图打散<br>Thorough · full scramble |
|---|---|---|
| What you share | a PNG that **visually preserves the picture**, scaled up ~1.22× per side | a PNG of **static** — the visible picture is destroyed |
| What comes back | the original file, byte-for-byte, **and its filename** | the original image, pixel-for-pixel |
| Size vs original | image ≈ 1.2× the original volume | canvas = original size (up to ≈1.7× volume, max 25×) |
| Ceiling | any file up to ~70 MB inside one PNG | 48 MP per image |
| Best for | drafts, screenshots, WIP art, PDFs-as-images | anything you genuinely don't want recognized |

Both are **lossless and reversible**. Neither changes the password requirement.

### Why "standard" keeps the picture visible

It is an *envelope*, not a redaction: the tool paints a canvas roughly `sqrt(1.5) ≈ 1.2247`
times larger than the original, tiles the original pixels into the first part of it, and packs
the whole original file (header + filename + bytes) into the remainder. The original width and
height live in the header, so restore gives you the exact original dimensions back. Someone
scrolling past sees a slightly bigger version of your picture; someone downloading it gets the
file.

That also means **standard mode is not privacy** — it hides the *file*, not the *picture*.

### Why the output must stay PNG

The payload is stored in the pixel data itself. Re-encode to JPEG, resize, crop, screenshot, or
let any tool touch it and the data is gone for good. The app itself always writes lossless PNG.

---

## Mechanism

Nothing here is home-grown crypto, but nothing here pretends to be, either. The codec is a
deterministic scramble: a key derived from `SHA-256(password ‖ nonce)`, iterated 4096 times,
seeds an `sfc32` keystream. That stream both XORs the pixel bytes and drives a Fisher–Yates
permutation of the pixels. Reversing the process requires the same password, so a wrong one
fails cleanly instead of returning garbage.

Both algorithms store a payload checksum and an authentication tag inside the image, which is
how the app tells "wrong password" apart from "this isn't a mixed image at all".

> **Not cryptographic protection.** 4096 rounds of SHA-256 is not a memory-hard KDF, and a
> password-protected PNG is offline-attackable by anyone who has the file. Against a determined
> attacker with the PNG, treat the password as a speed bump. This tool is for keeping images out
> of casual view — chat previews, shared drives, public folders, strolling eyes.

Leaving the password empty uses a fixed built-in key: anyone with this tool can restore it, which
is exactly what you want for "please stop showing this thumbnail in the preview pane". Set a real
password the moment it matters.

---

## Restoring with the right tool

- The **Restore** tab auto-detects which algorithm produced a file; there is nothing to pick.
- Same password, same PNG, same result — on any machine, in any browser, years later. The
  codec has no dependency on this app's UI.
- On Chrome/Edge, tick **保存到文件夹** once and every output lands in a folder you choose
  instead of the downloads folder.
- Batch output can be collected with **打包 ZIP** (a from-scratch ZIP writer with UTF-8 names
  and CRC-32, no library).

---

## Limits

| Limit | Value |
|---|---|
| Max pixels per canvas | 48,000,000 (48 MP) |
| Max side length | 32,000 px |
| Max filename embedded | 100 characters |
| Output format | PNG only, always lossless |
| Password storage | none — forgotten means unrecoverable |

Input formats are whatever your browser can decode (JPEG, PNG, WebP, GIF, AVIF…). HEIC
generally is not decodable in-browser and is reported as such. Transparency is flattened to
white only when **彻底** mode needs it — the plain "透明区域填白" checkbox.

---

## Browser support

The app itself runs anywhere modern (ES5-era syntax, no modules, no polyfills). Two features
degrade gracefully:

| Feature | Needs | If unsupported |
|---|---|---|
| Pick a whole folder | `webkitdirectory` | use file multi-select |
| Save straight to a folder | File System Access API (Chromium) | falls back to normal downloads |

Firefox and Safari therefore work fully; they just download files the ordinary way.

---

## File format

Both modes write a valid PNG whose pixel stream carries the data. Bytes are read in RGB order,
skipping the alpha byte of each pixel, so the usable capacity is 3 bytes per pixel.

**Algorithm 1 — `IMGX`, version 1.** The canvas is the original plus `ceil(16 / height)` columns
of padding. A 9-byte prefix holds an 8-byte nonce plus `0xA5`, then a 32-byte header (magic,
version, password flag, original `w`/`h`, payload length, and a `SHA-256(key ‖ header)` check),
then the permuted original pixels. Legacy `CWO1` images are accepted on decode only.

**Algorithm 2 — envelope, version 2.** A 9-byte prefix (same nonce layout), a 64-byte header
(magic, version, flags, embedded filename length, original `w`/`h`, payload length, payload
`SHA-256`, and the authentication tag), then the UTF-8 filename, then the raw file bytes.

---

## Development

There is no build. Editing the HTML *is* editing the app.

The codec lives in three DOM-free `<script>` blocks, and `tests/codec-smoke.mjs` loads exactly
those blocks in Node to prove the round-trips instead of merely asserting the file parses:

```bash
node tests/codec-smoke.mjs
```

It checks SHA-256 vectors, keystream determinism, pixel-perfect round-trips for password-empty,
ASCII, and non-ASCII passwords, byte-for-byte file round-trips, wrong-password rejection,
auto-detection of both algorithms, and rejection of a foreign PNG.

Verification performed on this release: **0 external URLs, 0 `fetch`/`XHR`/`WebSocket` calls, 0
`eval`/`new Function`/`document.write`, 0 inline event handlers, all 19 smoke checks passing, and
the page rendering correctly in a headless browser.**

---

## Known gaps

- UI and messages are Chinese-only; there is no i18n layer.
- No CLI or library build — the codec is inlined in the HTML, so scripting the tool means
  scraping the script blocks (which is what the test does).
- Format has no forward-compatibility story beyond a version byte; a future version bump will
  refuse to decode older images loudly rather than guess.
- The `probe()` helper is vestigial: detection actually happens in `autoDecode()`.

---

## License

[MIT](LICENSE) — Copyright (c) 2026 DeepSeek. Do whatever you like with it.

---

# 中文说明

**用一个看起来无害的 PNG，代替你不想直接给人看的图片。** 选一张或多张图片，混淆成杂乱
的 PNG 发出去；用同一个密码还原，得到的是逐字节一致的原始文件。

**单个 HTML 文件**，无需构建、无需安装、无需服务器，**全程不联网**：页面加载后不会发出
任何请求，所有像素都在你自己的浏览器里处理。

## 快速开始

1. 下载 [`image-obfuscator.html`](image-obfuscator.html)（或直接打开 [在线版](https://yjc925925.github.io/image-obfuscator/)）
2. 用浏览器打开这个文件。
3. 拖入图片 → 输入密码 → 点「开始混淆」。
4. 把生成的 `*.mix.png` 发出去。
5. 要还原就切到「还原图片」标签页，拖入 PNG，输入同一个密码。

离线可用，不依赖任何服务。

## 两种算法怎么选

| | 标准 · 原文件封装 | 彻底 · 全图打散 |
|---|---|---|
| 发出去的东西 | 一张**画面还在、只是放大了一点**的 PNG（每边约 1.22 倍） | 一张**花屏**，原画面彻底看不见 |
| 还原得到 | 原始文件本身（逐字节一致）**+ 原文件名** | 原始图像（像素级一致） |
| 体积 | 约为原文件的 1.2 倍 | 与原图等尺寸（最大约 25 倍） |
| 适合 | 草稿、截图、过程稿、当成图片传的文件 | 真的不想被认出来的图 |

**注意「标准」模式保留画面**：它是个信封，不是打码。它藏的是**文件**，不是**画面**。

## 几条硬限制

- 输出**必须保持 PNG 原样**：数据就藏在像素里，转 JPEG、缩放、裁剪、截图都会永久毁掉它。
- 图片上限 4800 万像素、单边最长 32000 像素；嵌入的文件名最多 100 字符。
- 密码不保存在任何地方，**忘了就还原不回来**；密码留空则用内置默认密钥，任何人拿到本工具
  都能还原——只适合防随手翻看。
- 输入格式取决于浏览器能解什么（JPEG / PNG / WebP / GIF / AVIF 都可以，HEIC 一般不行）。

## 安全性说明

这是**混淆，不是加密**。密钥由 `SHA-256(密码 ‖ 随机数)` 迭代 4096 轮导出，再用 `sfc32`
流同时做像素异或和像素重排，拿不到密码就还原不了；但 4096 轮 SHA-256 不是抗内存硬的
KDF，一张受密码保护的 PNG 对拿到文件的人来说是可以离线爆破的。**把它当减速带，不要当
保险箱**：它挡的是聊天预览、共享盘、公共文件夹里的随手一瞥。

## 许可

[MIT](LICENSE)。

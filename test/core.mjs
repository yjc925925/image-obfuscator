/* ImageMixer 核心测试：SHA-256 对照 node:crypto + 编解码可逆性 + 边界 + 性能 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (p) => fs.readFileSync(path.join(here, '..', p), 'utf8');
const api = new Function(
  load('src/crypto.js') + '\n' + load('src/codec.js') +
  '\nreturn { C: HashCore, K: Codec };')();
const C = api.C, K = api.K;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ FAIL: ' + msg); } };
const eq = (a, b, msg) => ok(a === b, msg + '  (得到 ' + a + '，期望 ' + b + ')');

/* ---------- 1. SHA-256 对照 node:crypto ---------- */
console.log('[1] SHA-256 向量对照');
for (const n of [0, 1, 3, 55, 56, 57, 63, 64, 65, 127, 128, 1000, 4096, 100000]) {
  const buf = Buffer.alloc(n);
  for (let i = 0; i < n; i++) buf[i] = (i * 137 + 11) & 255;
  const mine = C.hex(C.sha256(new Uint8Array(buf)));
  const ref = crypto.createHash('sha256').update(buf).digest('hex');
  eq(mine, ref, 'sha256(' + n + ' 字节)');
}
/* 空串与 "abc" 的标准向量 */
eq(C.hex(C.sha256(C.utf8(''))), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'sha256("")');
eq(C.hex(C.sha256(C.utf8('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'sha256("abc")');

/* ---------- 2. 合成图 ---------- */
function synth(w, h, seed) {
  const d = new Uint8ClampedArray(w * h * 4);
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      d[o] = (x * 255 / Math.max(1, w - 1)) | 0;
      d[o + 1] = (y * 255 / Math.max(1, h - 1)) | 0;
      d[o + 2] = ((x ^ y) * 7) & 255;
      d[o + 3] = 255;
    }
  }
  for (let i = 0; i < Math.min(500, w * h); i++) { const o = ((rnd() * w * h) | 0) * 4; d[o] = (rnd() * 256) | 0; }
  return d;
}
const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
const firstDiff = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i; return -1; };

/* ---------- 3. 往返可逆 ---------- */
console.log('[2] 编解码往返可逆性');
const sizes = [[1, 1], [1, 5], [5, 1], [2, 2], [7, 13], [16, 16], [64, 48], [100, 100], [333, 257], [640, 480]];
for (const [w, h] of sizes) {
  const pw = 'p@ss 中文密码' + w;
  const src = synth(w, h, w * 31 + h);
  const enc = K.encode(src, w, h, pw);
  eq(enc.width * enc.height >= w * h + 16, true, w + 'x' + h + ' 追加像素足够');
  let alphaOK = true;
  for (let p = 0; p < enc.width * enc.height; p++) if (enc.data[(p << 2) + 3] !== 255) { alphaOK = false; break; }
  ok(alphaOK, w + 'x' + h + ' 输出 alpha 全为 255');
  const dec = K.decode(enc.data, enc.width, enc.height, pw);
  eq(dec.width, w, w + 'x' + h + ' 还原宽度');
  eq(dec.height, h, w + 'x' + h + ' 还原高度');
  ok(same(new Uint8ClampedArray(dec.data), new Uint8ClampedArray(src)),
     w + 'x' + h + ' 像素逐字节一致（首个差异 @' + firstDiff(dec.data, src) + '）');
}
for (const pw of ['', 'a', '123456', '中文密码 🌈', 'x'.repeat(200)]) {
  const w = 71, h = 43, src = synth(w, h, 9);
  const enc = K.encode(src, w, h, pw);
  const dec = K.decode(enc.data, enc.width, enc.height, pw);
  ok(same(dec.data, src), '密码 "' + pw.slice(0, 12) + '"(' + pw.length + ' 字符) 往返一致');
}

/* ---------- 4. 混淆强度 ---------- */
console.log('[3] 混淆效果');
{
  const w = 200, h = 150, src = synth(w, h, 7);
  const enc = K.encode(src, w, h, 'k');
  const e = enc.data, N2 = enc.width * enc.height;
  let diff = 0, tot = 0;
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 3; c++) { tot++; if (e[(14 + i) * 4 + c] !== src[i * 4 + c]) diff++; }
  }
  ok(diff / tot > 0.99, '载荷区与原图像素差异率 ' + (100 * diff / tot).toFixed(2) + '% (>99%)');
  /* 相邻像素相关性：混淆后应接近 0 */
  let sxy = 0, sx = 0, sy = 0, n = 0;
  for (let i = 0; i + 1 < N2; i++) {
    if (i === 13 || i + 1 === 14) continue;
    const a = e[i * 4], b = e[(i + 1) * 4];
    sx += a; sy += b; sxy += a * b; n++;
  }
  const cov = sxy / n - (sx / n) * (sy / n);
  ok(Math.abs(cov) < 400, '相邻像素协方差 ' + cov.toFixed(1) + '（应接近 0，原图约 2000+）');
}

/* ---------- 5. 密码 / 完整性 ---------- */
console.log('[4] 密码与完整性校验');
{
  const w = 90, h = 60, src = synth(w, h, 3);
  const enc = K.encode(src, w, h, 'right');
  const t = (pw, label, want) => {
    let got = null;
    try { K.decode(new Uint8ClampedArray(enc.data), enc.width, enc.height, pw); got = 'ok'; }
    catch (e) { got = e.message; }
    ok(want === 'ok' ? got === 'ok' : got !== 'ok', label + ' -> ' + got);
  };
  t('right', '正确密码', 'ok');
  t('wrong', '错误密码', 'err');
  t('', '空密码', 'err');
  /* 载荷区被改 1 字节：只该坏掉 1 个字节，不该整张拒收 */
  const bad = new Uint8ClampedArray(enc.data); bad[(50 << 2)] ^= 0x5A;
  let msg = null, d2 = null;
  try { d2 = K.decode(bad, enc.width, enc.height, 'right'); } catch (e) { msg = e.message; }
  if (d2) {
    let nd = 0;
    for (let i = 0; i < src.length; i++) if (d2.data[i] !== src[i]) nd++;
    ok(nd >= 1 && nd <= 2, '载荷区被改 1 字节 -> 受影响 ' + nd + ' 字节');
  } else { ok(false, '载荷被改后意外抛错: ' + msg); }
  /* 头部被改：必须拒收 */
  const bad2 = new Uint8ClampedArray(enc.data); bad2[K._li(9)] ^= 0x5A;
  let msg2 = null; try { K.decode(bad2, enc.width, enc.height, 'right'); } catch (e) { msg2 = e.message; }
  ok(msg2 !== null, '头部被篡改后拒收 -> ' + msg2);
  /* 当普通 PNG 丢进去 */
  const plain = synth(90, 60, 5);
  msg = null; try { K.decode(plain, 90, 60, 'right'); } catch (e) { msg = e.message; }
  ok(/不是本工具/.test(msg || ''), '普通图片被识别 -> ' + msg);
  /* 无密码混淆仍可还原，但和有密码的产物不同 */
  const a = K.encode(src, w, h, ''), b = K.encode(src, w, h, 'x');
  ok(!same(a.data, b.data), '有/无密码产物不同');
  ok(same(K.decode(a.data, a.width, a.height, '').data, src), '无密码产物可用空密码还原');
  /* 随机数使同一输入两次产物不同 */
  const c1 = K.encode(src, w, h, 'z'), c2 = K.encode(src, w, h, 'z');
  ok(!same(c1.data, c2.data), '两次混淆产物不同（随机数生效）');
}

/* ---------- 6. 性能 ---------- */
console.log('[5] 性能');
{
  const w = 1280, h = 720, src = synth(w, h, 1);
  let t0 = Date.now();
  const enc = K.encode(src, w, h, 'perf');
  let t1 = Date.now();
  const dec = K.decode(enc.data, enc.width, enc.height, 'perf');
  let t2 = Date.now();
  ok(same(dec.data, src), '1280x720 往返一致');
  console.log('  1280x720 (0.92MP): 混淆 ' + (t1 - t0) + ' ms / 还原 ' + (t2 - t1) + ' ms');
  console.log('  参考：1200 万像素照片约需 ' + (((t1 - t0) / (w * h) * 12e6) / 1000).toFixed(1) + ' 秒');
}

console.log('\n==== ' + (fail === 0 ? 'ALL PASS' : fail + ' FAILED') + ' ==== 通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail === 0 ? 0 : 1);
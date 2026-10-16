

var Codec = (function () {
  'use strict';
  var C = HashCore;

  var MAGIC   = [0x49, 0x4D, 0x47, 0x58];
  var VERSION = 1;
  var EXTRA   = 16;
  var HDR_OFF = 9;
  var HDR_LEN = 32;
  var PAY_OFF = 42;
  var PAY_PIX = 14;
  var KDF_ROUNDS = 4096;
  var MAX_PIXELS = 48000000;
  var MAX_SIDE   = 32000;

  var T_PERM = new Uint8Array([0x50]);
  var T_DATA = new Uint8Array([0x44]);

  function li(k) { return ((k / 3) | 0) * 4 + (k % 3); }

  function fillRandom(b) {
    if (typeof crypto !== 'undefined' && crypto && crypto.getRandomValues) {
      crypto.getRandomValues(b);
      return b;
    }
    for (var i = 0; i < b.length; i++) b[i] = (Math.random() * 256) | 0;
    return b;
  }

  function deriveKey(pw, nonce) {
    var p = C.utf8(pw || '');
    var buf = new Uint8Array(p.length + 8);
    buf.set(p, 0);
    buf.set(nonce, p.length);
    var h = C.sha256(buf);
    for (var i = 1; i < KDF_ROUNDS; i++) h = C.sha256(h);
    return h;
  }

  function buildPerm(N, key) {
    var perm = new Int32Array(N);
    var i;
    for (i = 0; i < N; i++) perm[i] = i;
    var r = C.streamFrom(key, T_PERM);
    for (i = N - 1; i > 0; i--) {
      var j = (r() / 4294967296 * (i + 1)) | 0;
      var t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    return perm;
  }

  function xorStream(buf, p0, p1, key) {
    var r = C.streamFrom(key, T_DATA);
    var cur = 0, avail = 0;
    for (var p = p0; p < p1; p++) {
      var o = p << 2;
      for (var c = 0; c < 3; c++) {
        if (avail === 0) { cur = r(); avail = 4; }
        buf[o + c] = buf[o + c] ^ (cur & 255);
        cur = cur >>> 8;
        avail--;
      }
    }
  }

  function isMagic(h) {
    if (h[0] === MAGIC[0] && h[1] === MAGIC[1] && h[2] === MAGIC[2] && h[3] === MAGIC[3]) return true;
    return h[0] === 0x43 && h[1] === 0x57 && h[2] === 0x4F && h[3] === 0x31;
  }

  function encode(src, w, h, pw) {
    w = w | 0; h = h | 0;
    if (!(w > 0 && h > 0)) throw new Error('图片尺寸无效');
    var N = w * h;
    var dh = Math.ceil(EXTRA / h);
    var W2 = w + dh, H2 = h, N2 = W2 * H2;
    if (W2 > MAX_SIDE || H2 > MAX_SIDE) throw new Error('图片尺寸超过上限 ' + MAX_SIDE + ' 像素');
    if (N2 > MAX_PIXELS) throw new Error('图片过大：' + (N2 / 1e6).toFixed(1) + ' 百万像素，超过上限 ' + (MAX_PIXELS / 1e6) + ' 百万');

    var out = new Uint8ClampedArray(N2 * 4);
    var p, i;
    for (p = 0; p < N2; p++) out[(p << 2) + 3] = 255;

    var nonce = fillRandom(new Uint8Array(8));
    for (i = 0; i < 8; i++) out[li(i)] = nonce[i];
    out[li(8)] = 0xA5;

    var key = deriveKey(pw, nonce);

    var hdr = new Uint8Array(HDR_LEN);
    hdr[0] = MAGIC[0]; hdr[1] = MAGIC[1]; hdr[2] = MAGIC[2]; hdr[3] = MAGIC[3];
    hdr[4] = VERSION;
    hdr[5] = pw ? 1 : 0;
    hdr[6] = 0; hdr[7] = 0;
    C.writeU32(hdr, 8, w);
    C.writeU32(hdr, 12, h);
    C.writeU32(hdr, 16, N * 3);
    C.writeU32(hdr, 20, 0);
    var chk = C.sha256(C.concat(key, hdr.subarray(0, 24)));
    for (i = 0; i < 8; i++) hdr[24 + i] = chk[i];
    for (i = 0; i < HDR_LEN; i++) out[li(HDR_OFF + i)] = hdr[i];

    var perm = buildPerm(N, key);
    for (i = 0; i < N; i++) {
      var s = perm[i] << 2, d = (PAY_PIX + i) << 2;
      out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2];
    }
    perm = null;

    xorStream(out, 3, N2, key);

    return { data: out, width: W2, height: H2 };
  }

  function decode(src, w2, h2, pw) {
    w2 = w2 | 0; h2 = h2 | 0;
    var N2 = w2 * h2;
    if (!(N2 > EXTRA)) throw new Error('这不是本工具生成的混淆图');

    var nonce = new Uint8Array(8);
    for (var i = 0; i < 8; i++) nonce[i] = src[li(i)];
    var key = deriveKey(pw, nonce);

    xorStream(src, 3, N2, key);

    var hdr = new Uint8Array(HDR_LEN);
    for (i = 0; i < HDR_LEN; i++) hdr[i] = src[li(HDR_OFF + i)];

    if (!isMagic(hdr)) {
      throw new Error('不是本工具生成的混淆图，或图片被压缩/裁剪/转过格式（请务必保持 PNG 原样）');
    }
    if (hdr[4] !== VERSION) throw new Error('版本不匹配：本图 v' + hdr[4] + '，本页 v' + VERSION);

    var W = C.readU32(hdr, 8), H = C.readU32(hdr, 12), PB = C.readU32(hdr, 16);
    if (!(W > 0 && H > 0)) throw new Error('文件头数据损坏');
    var N = W * H;
    if (PB !== N * 3) throw new Error('文件头数据损坏（长度不符）');
    if (N > N2 - PAY_PIX) throw new Error('图片被裁剪过，无法还原');

    var chk = C.sha256(C.concat(key, hdr.subarray(0, 24)));
    var ok = true;
    for (i = 0; i < 8; i++) if (chk[i] !== hdr[24 + i]) { ok = false; break; }
    if (!ok) throw new Error('密码错误，或图片文件已损坏');

    var perm = buildPerm(N, key);
    var out = new Uint8ClampedArray(N * 4);
    for (i = 0; i < N; i++) {
      var s = (PAY_PIX + i) << 2, d = perm[i] << 2;
      out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = 255;
    }
    return { data: out, width: W, height: H };
  }

  function probe(src, w2, h2, pw) {
    try {
      var n = new Uint8Array(8), i;
      for (i = 0; i < 8; i++) n[i] = src[li(i)];
      var key = deriveKey(pw, n);
      var tmp = new Uint8ClampedArray(64 * 4);
      for (i = 0; i < 64; i++) { tmp[(i << 2)] = src[(i << 2)]; }
      return { nonce: n, ok: true };
    } catch (e) { return { ok: false }; }
  }

  return { encode: encode, decode: decode, probe: probe,
           MAGIC: MAGIC, VERSION: VERSION, EXTRA: EXTRA, KDF_ROUNDS: KDF_ROUNDS,
           MAX_PIXELS: MAX_PIXELS, _li: li };
})();
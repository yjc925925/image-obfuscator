const HashCore = (function () {
  'use strict';
  var KTAB = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  var H0 = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function readU32(b, o) {
    return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  }
  function writeU32(b, o, v) {
    b[o] = (v >>> 24) & 255; b[o + 1] = (v >>> 16) & 255;
    b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255;
  }
  function sha256(msg) {
    var len = msg.length;
    var total = Math.ceil((len + 9) / 64) * 64;
    var buf = new Uint8Array(total);
    buf.set(msg);
    buf[len] = 0x80;
    writeU32(buf, total - 8, Math.floor(len / 536870912));
    writeU32(buf, total - 4, (len % 536870912) * 8);
    var H = new Uint32Array(H0);
    var W = new Uint32Array(64);
    var i, off;
    for (off = 0; off < total; off += 64) {
      for (i = 0; i < 16; i++) W[i] = readU32(buf, off + i * 4);
      for (i = 16; i < 64; i++) {
        var x = W[i - 15], y = W[i - 2];
        W[i] = (W[i - 16] + (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) + W[i - 7]
                + (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10))) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + KTAB[i] + W[i]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    var out = new Uint8Array(32);
    for (i = 0; i < 8; i++) writeU32(out, i * 4, H[i]);
    return out;
  }
  function sfc32(a, b, c, d) {
    var f = function () {
      a |= 0; b |= 0; c |= 0; d |= 0;
      var t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return t >>> 0;
    };
    for (var i = 0; i < 16; i++) f();
    return f;
  }
  function concat(a, b) {
    var o = new Uint8Array(a.length + b.length);
    o.set(a, 0); o.set(b, a.length);
    return o;
  }
  function streamFrom(seed, tag) {
    var h = sha256(concat(seed, tag));
    return sfc32(readU32(h, 0), readU32(h, 4), readU32(h, 8), readU32(h, 12));
  }
  var _te = null;
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') {
      if (!_te) _te = new TextEncoder();
      return _te.encode(s);
    }
    var out = [], i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }
  function hex(b) {
    var s = '', i;
    for (i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  }
  return { sha256: sha256, sfc32: sfc32, streamFrom: streamFrom, concat: concat,
           utf8: utf8, hex: hex, readU32: readU32, writeU32: writeU32 };
})();


const Codec = (function () {
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



(function () {
  'use strict';
  var C = HashCore;
  var MAGIC2 = [0x49, 0x4D, 0x47, 0x58];
  var PREFIX = 9;
  var HB_LEN = 64;
  var FIXED = PREFIX + HB_LEN;
  var NAME_MAX = 240;
  var KDF_ROUNDS = 4096;
  var MAX_PIXELS = 48000000;
  var MAX_SIDE = 32000;
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
  function nameBytes(name) {
    var s = String(name == null ? '' : name);
    var chars = Array.from ? Array.from(s) : s.split('');
    if (chars.length > 100) s = chars.slice(0, 100).join('');
    var b = C.utf8(s);
    if (b.length > NAME_MAX) {
      var n = NAME_MAX;
      while (n > 0 && (b[n] & 0xC0) === 0x80) n--;
      b = b.subarray(0, n);
    }
    return b;
  }
  function nameFromBytes(b) {
    if (!b.length) return '';
    try {
      return new TextDecoder('utf-8', { fatal: false }).decode(b);
    } catch (e) {
      var s = '';
      for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      return s;
    }
  }
  function canvasFor(total, ow, oh) {
    var need = Math.ceil(total / 3);
    if (need > MAX_PIXELS) {
      throw new Error('文件太大：需要 ' + (need / 1e6).toFixed(1) + ' 百万像素的混淆图，超过上限 ' + (MAX_PIXELS / 1e6) + ' 百万');
    }
    var w0 = (ow | 0) > 0 ? (ow | 0) : 1;
    var h0 = (oh | 0) > 0 ? (oh | 0) : 1;
    var base = Math.sqrt(need / (w0 * h0));
    var k = 1, t, W, H;
    for (t = 0; t < 90; t++) {
      W = Math.round(w0 * base * k);
      H = Math.round(h0 * base * k);
      if (W < 8) W = 8;
      if (H < 8) H = 8;
      if (W > MAX_SIDE) W = MAX_SIDE;
      if (H > MAX_SIDE) H = MAX_SIDE;
      if (W * H >= need) return { w: W, h: H };
      k *= 1.05;
    }
    throw new Error('文件太大，放不进混淆图');
  }
  function encode2(pay, pw, opts) {
    opts = opts || {};
    var data = (pay instanceof Uint8Array) ? pay : new Uint8Array(pay);
    var nb = nameBytes(opts.name);
    var total = FIXED + nb.length + data.length;
    var dims = canvasFor(total, opts.w, opts.h);
    var W2 = dims.w, H2 = dims.h, N2 = W2 * H2;
    var out = new Uint8ClampedArray(N2 * 4);
    var i, p;
    for (p = 0; p < N2; p++) out[(p << 2) + 3] = 255;
    var nonce = fillRandom(new Uint8Array(8));
    for (i = 0; i < 8; i++) out[li(i)] = nonce[i];
    out[li(8)] = 0xA5;
    var key = deriveKey(pw, nonce);
    var hb = new Uint8Array(HB_LEN);
    hb[0] = MAGIC2[0]; hb[1] = MAGIC2[1]; hb[2] = MAGIC2[2]; hb[3] = MAGIC2[3];
    hb[4] = 2;
    hb[5] = (pw ? 1 : 0) | (nb.length ? 2 : 0);
    hb[6] = nb.length & 255;
    hb[7] = (nb.length >> 8) & 255;
    C.writeU32(hb, 8, opts.w | 0);
    C.writeU32(hb, 12, opts.h | 0);
    C.writeU32(hb, 16, data.length);
    C.writeU32(hb, 20, 0);
    var ps = C.sha256(data);
    for (i = 0; i < 32; i++) hb[24 + i] = ps[i];
    var tg = C.sha256(C.concat(key, hb.subarray(0, 56)));
    for (i = 0; i < 8; i++) hb[56 + i] = tg[i];
    var off = PREFIX;
    for (i = 0; i < HB_LEN; i++) out[li(off + i)] = hb[i];
    off += HB_LEN;
    for (i = 0; i < nb.length; i++) out[li(off + i)] = nb[i];
    off += nb.length;
    for (i = 0; i < data.length; i++) out[li(off + i)] = data[i];
    xorStream(out, 3, N2, key);
    return { data: out, width: W2, height: H2, need: Math.ceil(total / 3), total: total };
  }
  function decode2(src, w2, h2, pw, key) {
    var N2 = (w2 | 0) * (h2 | 0);
    var i;
    if (!key) {
      var nonce = new Uint8Array(8);
      for (i = 0; i < 8; i++) nonce[i] = src[li(i)];
      key = deriveKey(pw, nonce);
    }
    xorStream(src, 3, N2, key);
    var hb = new Uint8Array(HB_LEN);
    for (i = 0; i < HB_LEN; i++) hb[i] = src[li(PREFIX + i)];
    var nameLen = hb[6] | (hb[7] << 8);
    var ow = C.readU32(hb, 8), oh = C.readU32(hb, 12), plen = C.readU32(hb, 16);
    var tg = C.sha256(C.concat(key, hb.subarray(0, 56)));
    for (i = 0; i < 8; i++) if (tg[i] !== hb[56 + i]) throw new Error('密码错误，或图片文件已损坏');
    if (nameLen > 4096 || plen > N2 * 3) throw new Error('图片文件已损坏（头部数据异常）');
    var payOff = PREFIX + HB_LEN + nameLen;
    if (payOff + plen > N2 * 3) throw new Error('混淆图被裁剪过，无法还原');
    var name = '';
    if (nameLen > 0) {
      var nb = new Uint8Array(nameLen);
      for (i = 0; i < nameLen; i++) nb[i] = src[li(PREFIX + HB_LEN + i)];
      name = nameFromBytes(nb);
    }
    var pay = new Uint8Array(plen);
    for (i = 0; i < plen; i++) pay[i] = src[li(payOff + i)];
    var ps = C.sha256(pay);
    for (i = 0; i < 32; i++) if (ps[i] !== hb[24 + i]) throw new Error('图片数据已损坏（还原出来的文件不完整）');
    return { kind: 'file', bytes: pay, name: name, origW: ow, origH: oh };
  }
  function autoDecode(src, w2, h2, pw) {
    var N2 = (w2 | 0) * (h2 | 0);
    if (!(N2 > 3)) throw new Error('这不是本工具生成的混淆图');
    var nonce = new Uint8Array(8), i;
    for (i = 0; i < 8; i++) nonce[i] = src[li(i)];
    var key = deriveKey(pw, nonce);
    var stream = C.streamFrom(key, T_DATA);
    var w0 = stream(), w1 = stream();
    var ks = [w0 & 255, (w0 >>> 8) & 255, (w0 >>> 16) & 255, (w0 >>> 24) & 255, w1 & 255];
    var b = new Uint8Array(5);
    for (i = 0; i < 5; i++) b[i] = src[li(PREFIX + i)] ^ ks[i];
    var isNew = (b[0] === 0x49 && b[1] === 0x4D && b[2] === 0x47 && b[3] === 0x58);
    var isOld = (b[0] === 0x43 && b[1] === 0x57 && b[2] === 0x4F && b[3] === 0x31);
    if (!isNew && !isOld) {
      if (src[li(8)] === 0xA5) throw new Error('密码错误，或图片文件已损坏');
      throw new Error('这不是本工具生成的混淆图，或图片被压缩/裁剪/转过格式（请务必保持 PNG 原样）');
    }
    if (isOld || b[4] === 1) {
      var o = Codec.decode(src, w2, h2, pw);
      return { kind: 'pixels', data: o.data, width: o.width, height: o.height };
    }
    if (b[4] !== 2) throw new Error('版本不匹配：本图来自算法版本 ' + b[4]);
    return decode2(src, w2, h2, pw, key);
  }
  Codec.encode2 = encode2;
  Codec.decode2 = decode2;
  Codec.autoDecode = autoDecode;
  Codec.V2 = 2;
  Codec.HDR2 = FIXED;
  Codec.NAME_MAX = NAME_MAX;
  Codec._li2 = li;
})();



// ---------------------------------------------------------------- smoke test
const te = new TextEncoder();
let failed = 0;
function check(name, cond, extra) {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  ${tag}  ${name}${extra ? '  (' + extra + ')' : ''}`);
}
function randBytes(n, seed) {
  const b = new Uint8Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    b[i] = (s >>> 24) & 255;
  }
  return b;
}
// Node exposes webcrypto on globalThis; the app uses crypto.getRandomValues.
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = (await import('node:crypto')).webcrypto;
}

console.log('HashCore');
check('sha256("") known vector',
  HashCore.hex(HashCore.sha256(new Uint8Array(0))) ===
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
check('sha256("abc") known vector',
  HashCore.hex(HashCore.sha256(te.encode('abc'))) ===
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
{
  const a = HashCore.streamFrom(randBytes(32, 1), new Uint8Array([0x50]));
  const b = HashCore.streamFrom(randBytes(32, 1), new Uint8Array([0x50]));
  const c = HashCore.streamFrom(randBytes(32, 1), new Uint8Array([0x44]));
  const x = [a(), a(), a()], y = [b(), b(), b()], z = [c(), c(), c()];
  check('streamFrom is deterministic for one seed', String(x) === String(y));
  check('streamFrom differs across tags', String(x) !== String(z));
}

console.log('');
console.log('Algorithm 1 (full-scramble pixel codec)');
{
  const W = 64, H = 48;
  const src = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    src[i * 4] = (i * 7) & 255; src[i * 4 + 1] = (i * 13) & 255;
    src[i * 4 + 2] = (i * 29) & 255; src[i * 4 + 3] = 255;
  }
  const before = Array.from(src);
  for (const pw of ['', 'hunter2', '\u4e2d\u6587\u5bc6\u7801']) {
    const enc = Codec.encode(src, W, H, pw);
    check(`encode pw=${JSON.stringify(pw)} grew the canvas`, enc.width > W,
      `${W}x${H} -> ${enc.width}x${enc.height}`);
    const dec = Codec.decode(enc.data, enc.width, enc.height, pw);
    check(`round-trip pw=${JSON.stringify(pw)} restores pixels`,
      dec.width === W && dec.height === H &&
      Array.from(dec.data).every((v, i) => v === before[i]));
  }
  const enc = Codec.encode(src, W, H, 'right');
  let threw = null;
  try { Codec.decode(enc.data, enc.width, enc.height, 'wrong'); } catch (e) { threw = e.message; }
  // With the wrong key the header itself fails to unscramble, so the codec reports the
  // image as unrecognised rather than as a wrong password. Either refusal is correct.
  check('wrong password is rejected (never returns garbage)',
    !!threw && (/password|\u5bc6\u7801/.test(threw) || /\u4e0d\u662f\u672c\u5de5\u5177/.test(threw)),
    threw);
}

console.log('');
console.log('Algorithm 2 (original-file envelope)');
{
  const payload = randBytes(5000, 42);
  const enc = Codec.encode2(payload, 'pw', { name: '\u6d4b\u8bd5.txt', w: 300, h: 200 });
  check('envelope fits its payload', enc.total <= enc.width * enc.height * 3,
    `${enc.total} bytes into ${enc.width}x${enc.height}`);
  const dec = Codec.decode2(enc.data, enc.width, enc.height, 'pw');
  check('filename round-trips', dec.name === '\u6d4b\u8bd5.txt', JSON.stringify(dec.name));
  check('payload round-trips byte-for-byte',
    dec.bytes.length === payload.length && dec.bytes.every((v, i) => v === payload[i]));
  let threw = null;
  try { Codec.decode2(enc.data, enc.width, enc.height, 'nope'); } catch (e) { threw = e.message; }
  check('wrong password is rejected', !!threw, threw);
}

console.log('');
console.log('autoDecode dispatch (restore tab picks the algorithm itself)');
{
  const W = 64, H = 48;
  const src = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { src[i * 4 + 1] = i & 255; src[i * 4 + 3] = 255; }
  const a1 = Codec.encode(src, W, H, 'x');
  const r1 = Codec.autoDecode(a1.data, a1.width, a1.height, 'x');
  check('detects algorithm 1', r1.kind === 'pixels' && r1.width === W && r1.height === H);

  const pay = randBytes(2000, 7);
  const a2 = Codec.encode2(pay, 'x', { name: 'a.bin', w: 128, h: 128 });
  const r2 = Codec.autoDecode(a2.data, a2.width, a2.height, 'x');
  check('detects algorithm 2', r2.kind === 'file' && r2.name === 'a.bin' &&
    r2.bytes.every((v, i) => v === pay[i]));

  let threw = null;
  const noise = new Uint8ClampedArray(32 * 32 * 4);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 11) & 255;
  try { Codec.autoDecode(noise, 32, 32, 'x'); } catch (e) { threw = e.message; }
  check('rejects a foreign PNG', !!threw, threw);
}

console.log('');
console.log(failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);

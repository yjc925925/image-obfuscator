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
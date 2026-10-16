

var SelfTest = (function () {
  'use strict';

  function bytesEq(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function synth(w, h, seed) {
    var d = new Uint8ClampedArray(w * h * 4), x, y, o, s = seed >>> 0;
    var rnd = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      o = (y * w + x) * 4;
      d[o] = (x * 255 / Math.max(1, w - 1)) | 0;
      d[o + 1] = (y * 255 / Math.max(1, h - 1)) | 0;
      d[o + 2] = ((x ^ y) * 7 + seed) & 255;
      d[o + 3] = 255;
    }
    for (var i = 0; i < Math.min(300, w * h); i++) { o = ((rnd() * w * h) | 0) * 4; d[o] = (rnd() * 256) | 0; }
    return d;
  }

  function loadImg(blob) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(blob), img = new Image();
      img.onload = function () { res({ img: img, url: u }); };
      img.onerror = function () { URL.revokeObjectURL(u); rej(new Error('PNG 重新加载失败')); };
      img.src = u;
    });
  }
  function toBlob(canvas) {
    return new Promise(function (res, rej) {
      canvas.toBlob(function (b) { b ? res(b) : rej(new Error('toBlob 失败')); }, 'image/png');
    });
  }
  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  async function run() {
    var R = [], C = HashCore, K = Codec, i;
    var add = function (name, ok, info) { R.push({ name: name, ok: !!ok, info: info || '' }); };

    add('SHA-256("abc") 标准向量',
      C.hex(C.sha256(C.utf8('abc'))) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', '');
    add('SHA-256 输出 32 字节', C.sha256(C.utf8('x')).length === 32, '');
    var s1 = C.streamFrom(C.sha256(C.utf8('seed')), new Uint8Array([1]));
    var s2 = C.streamFrom(C.sha256(C.utf8('seed')), new Uint8Array([1]));
    add('伪随机流可复现', s1() === s2() && s1() === s2(), '');

    var sizes = [[1, 1], [1, 9], [9, 1], [3, 3], [17, 5], [64, 64], [137, 91], [401, 233]];
    var allRT = true, badRT = '';
    for (i = 0; i < sizes.length; i++) {
      var w = sizes[i][0], h = sizes[i][1], pw = '密码' + i;
      var src = synth(w, h, i * 13 + 1);
      var enc = K.encode(src, w, h, pw);
      var dec = K.decode(enc.data, enc.width, enc.height, pw);
      if (dec.width !== w || dec.height !== h || !bytesEq(dec.data, src)) { allRT = false; badRT = w + 'x' + h; break; }
    }
    add('内存往返逐字节一致（8 尺寸含 1x1 / 1x9 / 401x233）', allRT, allRT ? '全部通过' : '失败于 ' + badRT);

    var src2 = synth(120, 80, 5);
    var enc2 = K.encode(src2, 120, 80, '正确密码');
    var rejected = 0, msgs = [];
    try { K.decode(new Uint8ClampedArray(enc2.data), enc2.width, enc2.height, '错误密码'); }
    catch (e) { rejected++; msgs.push('错误密码: ' + e.message.slice(0, 16)); }
    try { K.decode(new Uint8ClampedArray(enc2.data), enc2.width, enc2.height, ''); }
    catch (e) { rejected++; msgs.push('空密码: ' + e.message.slice(0, 16)); }
    try { K.decode(synth(120, 80, 9), 120, 80, '正确密码'); }
    catch (e) { rejected++; msgs.push('普通图: ' + e.message.slice(0, 16)); }
    add('错误密码 / 空密码 / 非本工具图 均被拒绝', rejected === 3, msgs.join(' | '));

    var outAlpha = true;
    for (i = 0; i < enc2.width * enc2.height; i++) if (enc2.data[(i << 2) + 3] !== 255) { outAlpha = false; break; }
    add('输出图全部不透明（规避预乘精度损失）', outAlpha, '');

    if (typeof document === 'undefined') {
      add('canvas/PNG 端到端', true, '（Node 环境跳过）');
    } else {
      var W = 137, H = 91, P = '测试密码';
      var orig = synth(W, H, 77);
      var c1 = mkCanvas(W, H);
      var x1 = c1.getContext('2d', { willReadFrequently: true });
      x1.putImageData(new ImageData(new Uint8ClampedArray(orig), W, H), 0, 0);
      add('canvas 写入/读回无损', bytesEq(x1.getImageData(0, 0, W, H).data, orig), '');

      var enc3 = K.encode(new Uint8ClampedArray(orig), W, H, P);
      var c2 = mkCanvas(enc3.width, enc3.height);
      var x2 = c2.getContext('2d', { willReadFrequently: true });
      x2.putImageData(new ImageData(enc3.data, enc3.width, enc3.height), 0, 0);

      var blob = await toBlob(c2);
      var got = await loadImg(blob);
      var c3 = mkCanvas(got.img.naturalWidth, got.img.naturalHeight);
      var x3 = c3.getContext('2d', { willReadFrequently: true });
      x3.drawImage(got.img, 0, 0);
      URL.revokeObjectURL(got.url);
      var back = x3.getImageData(0, 0, c3.width, c3.height).data;

      var pngOK = bytesEq(back, enc3.data);
      add('PNG 存盘重新打开 逐字节无损', pngOK, pngOK ? blob.size + ' 字节' : 'PNG 往返有损！');

      var dec3 = K.decode(back, c3.width, c3.height, P);
      add('端到端还原 = 原图（逐字节）',
        dec3.width === W && dec3.height === H && bytesEq(dec3.data, orig), '还原 ' + dec3.width + 'x' + dec3.height);

      var diff = 0, tot = 0;
      for (i = 0; i < W * H; i++) for (var ch = 0; ch < 3; ch++) { tot++; if (enc3.data[(14 + i) * 4 + ch] !== orig[i * 4 + ch]) diff++; }
      add('载荷区像素差异率 > 99%', diff / tot > 0.99, (100 * diff / tot).toFixed(2) + '%');

      add('混淆图尺寸 ' + enc3.width + 'x' + enc3.height + '（原图 ' + W + 'x' + H + '，最省扩展）',
        enc3.width * enc3.height >= W * H + 16 && enc3.width * enc3.height <= W * H + 16 + H, '');
    }

    if (typeof Codec.encode2 === 'function') {
      var v2cases = [[104, 64, 48], [700, 1920, 1080], [40000, 400, 3000]];
      var v2ok = true, v2note = '', last = null, lastPw = '';
      for (var v2i = 0; v2i < v2cases.length; v2i++) {
        var pv = new Uint8Array(v2cases[v2i][0]), v2q;
        for (v2q = 0; v2q < pv.length; v2q++) pv[v2q] = (v2q * 31 + v2i * 7 + 3) & 255;
        var nm = '原文件' + v2i + '.jpeg';
        lastPw = 'pw' + v2i;
        last = Codec.encode2(pv, lastPw, { name: nm, w: v2cases[v2i][1], h: v2cases[v2i][2] });
        var d2 = Codec.autoDecode(new Uint8ClampedArray(last.data), last.width, last.height, lastPw);
        if (d2.kind !== 'file' || !bytesEq(d2.bytes, pv) || d2.name !== nm) { v2ok = false; v2note = '载荷 ' + pv.length + ' 字节失败'; break; }
      }
      add('标准算法：原文件与文件名逐字节还原', v2ok, v2note || '3 组尺寸通过');

      var v2msg = '';
      try { Codec.autoDecode(new Uint8ClampedArray(last.data), last.width, last.height, '不对的密码'); } catch (e) { v2msg = (e && e.message) || ''; }
      add('标准算法：错误密码提示「密码错误」', v2msg.indexOf('密码') >= 0, v2msg.slice(0, 20));

      var v2bad = new Uint8ClampedArray(last.data);
      v2bad[(400 << 2)] = v2bad[(400 << 2)] ^ 0x5A;
      var v2bmsg = '';
      try { Codec.autoDecode(v2bad, last.width, last.height, lastPw); } catch (e) { v2bmsg = (e && e.message) || ''; }
      add('标准算法：载荷被改动即被检出', v2bmsg.indexOf('损坏') >= 0, v2bmsg.slice(0, 20));

      var v2jmsg = '';
      try { Codec.autoDecode(synth(60, 60, 7), 60, 60, 'x'); } catch (e) { v2jmsg = (e && e.message) || ''; }
      add('标准算法：非本工具图被拒', v2jmsg.indexOf('不是本工具') >= 0, v2jmsg.slice(0, 20));

      var need = Math.ceil((Codec.HDR2 + 260 + 40000) / 3);
      add('标准算法：画布只按载荷开（不按原图）',
        last.width * last.height >= need && last.width * last.height <= need * 1.5 + 4096,
        last.width + 'x' + last.height + ' 需 ' + need + ' 像素');
      add('标准算法：宽高比保持',
        Math.abs((last.width / last.height) - (400 / 3000)) < 0.02,
        (last.width / last.height).toFixed(3) + ' vs ' + (400 / 3000).toFixed(3));
    } else {
      add('标准算法：接口可用', false, 'Codec.encode2 不存在');
    }

    if (typeof document !== 'undefined' && typeof Codec.encode2 === 'function') {
      var vW = 200, vH = 150, vPx = synth(vW, vH, 42);
      var vcv = mkCanvas(vW, vH);
      vcv.getContext('2d', { willReadFrequently: true }).putImageData(new ImageData(vPx, vW, vH), 0, 0);
      var vSrc = new Uint8Array(await (await toBlob(vcv)).arrayBuffer());
      var vEnc = Codec.encode2(vSrc, 'P2', { name: '照片.png', w: vW, h: vH });
      var vMix = mkCanvas(vEnc.width, vEnc.height);
      vMix.getContext('2d', { willReadFrequently: true }).putImageData(new ImageData(vEnc.data, vEnc.width, vEnc.height), 0, 0);
      var vBlob = await toBlob(vMix);
      var vIm = await loadImg(vBlob);
      var vBackCv = mkCanvas(vIm.img.naturalWidth, vIm.img.naturalHeight);
      var vBackG = vBackCv.getContext('2d', { willReadFrequently: true });
      vBackG.drawImage(vIm.img, 0, 0);
      URL.revokeObjectURL(vIm.url);
      var vBack = vBackG.getImageData(0, 0, vBackCv.width, vBackCv.height).data;
      var vDec = Codec.autoDecode(new Uint8ClampedArray(vBack), vBackCv.width, vBackCv.height, 'P2');
      add('标准算法 PNG 端到端：还原出原文件（逐字节）',
        vDec.kind === 'file' && bytesEq(vDec.bytes, vSrc) && vDec.name === '照片.png',
        '原文件 ' + vSrc.length + 'B -> 混淆图 ' + vBlob.size + 'B');

      var vOld = Codec.encode(new Uint8ClampedArray(vPx), vW, vH, 'P2');
      var vPic = mkCanvas(vOld.width, vOld.height);
      vPic.getContext('2d', { willReadFrequently: true }).putImageData(new ImageData(vOld.data, vOld.width, vOld.height), 0, 0);
      var vPicBlob = await toBlob(vPic);
      add('标准算法体积远小于彻底算法（同图）', vBlob.size * 3 < vPicBlob.size,
        '标准 ' + vBlob.size + 'B vs 彻底 ' + vPicBlob.size + 'B（' + (100 * vBlob.size / vPicBlob.size).toFixed(0) + '%）');
      var vDecOld = Codec.autoDecode(new Uint8ClampedArray(vOld.data), vOld.width, vOld.height, 'P2');
      add('彻底算法仍可还原（像素模式自动识别）',
        vDecOld.kind === 'pixels' && vDecOld.width === vW && vDecOld.height === vH, vDecOld.kind);
    }

    if (typeof ZipWriter !== 'undefined') {
      add('ZIP 重名自动改名', ZipWriter.zipNames(['a.png', 'a.png', 'a.png']).join(',') === 'a.png,a(2).png,a(3).png',
        ZipWriter.zipNames(['a.png', 'a.png', 'a.png']).join(','));
      var z = ZipWriter.build([
        { name: 'a.png', data: new Uint8Array([1, 2, 3, 4]) },
        { name: '同 名.png', data: new Uint8Array([9, 8, 7]) }
      ]);
      var zb = new Uint8Array(await z.arrayBuffer());
      var sigOK = zb[0] === 80 && zb[1] === 75 && zb[2] === 3 && zb[3] === 4;
      var eocdOK = zb[zb.length - 22] === 80 && zb[zb.length - 21] === 75 && zb[zb.length - 20] === 5 && zb[zb.length - 19] === 6;
      add('ZIP 结构合法（本地头 + EOCD）', sigOK && eocdOK, zb.length + ' 字节');
    }

    return R;
  }

  return { run: run, bytesEq: bytesEq, synth: synth };
})();
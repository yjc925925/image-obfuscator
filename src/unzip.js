var Unzip = (function () {
  'use strict';
  var IMG = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
  var MAX_ENTRIES = 4000;

  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function isImageName(n) { return IMG.test(n); }

  function isZip(file) {
    if (!file) return false;
    var t = file.type || '';
    if (t === 'application/zip' || t === 'application/x-zip-compressed' || t === 'multipart/x-zip') return true;
    return /\.zip$/i.test(file.name || '');
  }

  function utf8(bytes) {
    try {
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
      var s = '', i;
      for (i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return s;
    }
  }

  function decodeName(bytes, flags) {
    if (flags & 0x800) return utf8(bytes);
    var s = utf8(bytes);
    if (s.indexOf('\uFFFD') < 0) return s;
    try { return new TextDecoder('gbk').decode(bytes); } catch (e) { return s; }
  }

  function baseName(n) {
    var p = n.lastIndexOf('/');
    return p < 0 ? n : n.slice(p + 1);
  }

  function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('这个浏览器不支持解压，请用较新的 Chrome、Edge 或 Safari'));
    }
    var st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(st).arrayBuffer();
  }

  async function read(file) {
    var buf = new Uint8Array(await file.arrayBuffer());
    if (buf.length < 22) throw new Error('这不是有效的 ZIP 压缩包');
    var eocd = -1, i, low = Math.max(0, buf.length - 66000);
    for (i = buf.length - 22; i >= low; i--) {
      if (u32(buf, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('这不是有效的 ZIP 压缩包，或者文件没有传完整');
    var count = u16(buf, eocd + 10);
    if (!count) throw new Error('压缩包是空的');
    if (count > MAX_ENTRIES) throw new Error('压缩包里的文件太多（' + count + ' 个），请先自己整理一下');
    var p = u32(buf, eocd + 16), out = [], k;
    for (k = 0; k < count; k++) {
      if (p + 46 > buf.length || u32(buf, p) !== 0x02014b50) break;
      var flags = u16(buf, p + 8);
      var method = u16(buf, p + 10);
      var csize = u32(buf, p + 20);
      var usize = u32(buf, p + 24);
      var nlen = u16(buf, p + 28);
      var elen = u16(buf, p + 30);
      var clen = u16(buf, p + 32);
      var lho = u32(buf, p + 42);
      var name = decodeName(buf.subarray(p + 46, p + 46 + nlen), flags);
      p += 46 + nlen + elen + clen;
      if (!name || name.charAt(name.length - 1) === '/') continue;
      if (!isImageName(name)) continue;
      if (flags & 1) throw new Error('压缩包设了密码，请自己解压之后再选图片');
      if (csize === 0xffffffff || usize === 0xffffffff) throw new Error('压缩包超过 4GB，请分开打包');
      if (lho + 30 > buf.length || u32(buf, lho) !== 0x04034b50) continue;
      var start = lho + 30 + u16(buf, lho + 26) + u16(buf, lho + 28);
      if (start + csize > buf.length) throw new Error('压缩包损坏，数据不完整');
      var raw = buf.subarray(start, start + csize);
      var bytes = null;
      try {
        if (method === 0) bytes = raw;
        else if (method === 8) bytes = new Uint8Array(await inflateRaw(raw));
      } catch (e) { bytes = null; }
      if (bytes && bytes.length) out.push({ name: baseName(name), bytes: bytes });
    }
    return out;
  }

  return { read: read, isZip: isZip, isImageName: isImageName };
})();
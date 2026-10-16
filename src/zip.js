

var ZipWriter = (function () {
  'use strict';
  var T = (function () {
    var t = new Uint32Array(256), n, k, c;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(b) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < b.length; i++) c = (T[(c ^ b[i]) & 255] ^ (c >>> 8)) >>> 0;
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zipNames(names) {
    var seen = Object.create(null), out = [];
    for (var i = 0; i < names.length; i++) {
      var orig = names[i];
      var dot = orig.lastIndexOf('.');
      var base = dot > 0 ? orig.slice(0, dot) : orig;
      var ext = dot > 0 ? orig.slice(dot) : '';
      var cand = orig, k = 1;
      while (seen[cand]) { k++; cand = base + '(' + k + ')' + ext; }
      seen[cand] = 1;
      out.push(cand);
    }
    return out;
  }

  function build(files) {
    var enc = new TextEncoder();
    var now = new Date();
    var dTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
    var dDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
    var parts = [], cd = [], offset = 0, i, j;

    for (i = 0; i < files.length; i++) {
      var nameB = enc.encode(files[i].name);
      var data = files[i].data;
      var crc = crc32(data);

      var lh = new Uint8Array(30 + nameB.length);
      var v = new DataView(lh.buffer);
      v.setUint32(0, 0x04034B50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, 0x0800, true);
      v.setUint16(8, 0, true);
      v.setUint16(10, dTime, true);
      v.setUint16(12, dDate, true);
      v.setUint32(14, crc, true);
      v.setUint32(18, data.length, true);
      v.setUint32(22, data.length, true);
      v.setUint16(26, nameB.length, true);
      v.setUint16(28, 0, true);
      lh.set(nameB, 30);
      parts.push(lh, data);

      var ch = new Uint8Array(46 + nameB.length);
      var w = new DataView(ch.buffer);
      w.setUint32(0, 0x02014B50, true);
      w.setUint16(4, 20, true);
      w.setUint16(6, 20, true);
      w.setUint16(8, 0x0800, true);
      w.setUint16(10, 0, true);
      w.setUint16(12, dTime, true);
      w.setUint16(14, dDate, true);
      w.setUint32(16, crc, true);
      w.setUint32(20, data.length, true);
      w.setUint32(24, data.length, true);
      w.setUint16(28, nameB.length, true);
      w.setUint16(30, 0, true);
      w.setUint16(32, 0, true);
      w.setUint16(34, 0, true);
      w.setUint16(36, 0, true);
      w.setUint32(38, 0, true);
      w.setUint32(42, offset, true);
      ch.set(nameB, 46);
      cd.push(ch);

      offset += lh.length + data.length;
    }

    var cdSize = 0;
    for (j = 0; j < cd.length; j++) cdSize += cd[j].length;

    var eo = new Uint8Array(22);
    var e = new DataView(eo.buffer);
    e.setUint32(0, 0x06054B50, true);
    e.setUint16(4, 0, true);
    e.setUint16(6, 0, true);
    e.setUint16(8, files.length, true);
    e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true);
    e.setUint32(16, offset, true);
    e.setUint16(20, 0, true);

    var all = parts.concat(cd);
    all.push(eo);
    return new Blob(all, { type: 'application/zip' });
  }

  return { build: build, crc32: crc32, zipNames: zipNames };
})();
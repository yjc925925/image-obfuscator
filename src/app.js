(function () {
  'use strict';

  var els = {}, items = [], autoId = 1;
  var mode = 'mix', running = false, stopFlag = false;

  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function human(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function stamp() {
    var d = new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '_' + pad2(d.getHours()) + pad2(d.getMinutes());
  }
  function isImage(file) {
    if (file.type && file.type.indexOf('image/') === 0) return true;
    return /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(file.name || '');
  }

  function imageSize(file) {
    return new Promise(function (res) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        res({ w: img.naturalWidth | 0, h: img.naturalHeight | 0 });
      };
      img.onerror = function () { URL.revokeObjectURL(url); res(null); };
      img.src = url;
    });
  }

  function safeName(n) {
    var s = String(n == null ? '' : n).replace(/[\\/:*?"<>|]/g, '_').replace(/[\u0000-\u001f]/g, '').replace(/^[.\s]+/, '').trim();
    if (s.length > 120) s = s.slice(0, 120);
    return s;
  }

  function splitName(n) {
    var dot = n.lastIndexOf('.');
    return dot > 0 ? { base: n.slice(0, dot), ext: n.slice(dot) } : { base: n, ext: '' };
  }
  function mixName(n) { return splitName(n).base + '.mix.png'; }
  function unmixName(n) {
    var s = splitName(n);
    return (/\.mix$/i.test(s.base) ? s.base.slice(0, -4) : 'unmix_' + s.base) + '.png';
  }

  function readImage(file, flatten) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, done = function () { URL.revokeObjectURL(url); };
        try {
          if (!w || !h) { done(); return rej(new Error('图片尺寸无效（可能是 HEIC 或损坏的文件）')); }
          if (w > 32000 || h > 32000 || w * h > (Codec.MAX_PIXELS || 48000000)) {
            done();
            return rej(new Error('图片太大：' + w + 'x' + h + '（上限 ' + Math.round((Codec.MAX_PIXELS || 48000000) / 1e6) + ' 百万像素）'));
          }
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          var x = c.getContext('2d', { willReadFrequently: true });
          if (!x) { done(); return rej(new Error('无法创建画布')); }
          if (flatten) { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); }
          x.drawImage(img, 0, 0);
          var d = x.getImageData(0, 0, w, h);
          c.width = 0; c.height = 0;
          done();
          res({ data: d.data, width: w, height: h });
        } catch (e) {
          done();
          rej(new Error('读取像素失败：' + (e && e.message ? e.message : e) + '（图片过大可能导致内存不足）'));
        }
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('无法打开：格式不被浏览器支持（如 HEIC）或文件已损坏')); };
      img.src = url;
    });
  }

  function toPng(data, w, h) {
    return new Promise(function (res, rej) {
      try {
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var x = c.getContext('2d');
        x.putImageData(new ImageData(data, w, h), 0, 0);
        c.toBlob(function (b) {
          c.width = 0; c.height = 0;
          if (b) res(b); else rej(new Error('PNG 编码失败（内存不足？）'));
        }, 'image/png');
      } catch (e) { rej(new Error('PNG 编码失败：' + (e && e.message ? e.message : e))); }
    });
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 8000);
  }

  var zipQueue = [], zipBusy = false, zipOpen = 0;

  function mimeOf(name) {
    var e = String(name).split('.').pop().toLowerCase();
    if (e === 'png') return 'image/png';
    if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
    if (e === 'webp') return 'image/webp';
    if (e === 'gif') return 'image/gif';
    if (e === 'bmp') return 'image/bmp';
    return '';
  }

  function isZipFile(f) {
    return typeof Unzip !== 'undefined' && Unzip.isZip(f);
  }

  function pushFiles(list) {
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (!f) continue;
      if (isZipFile(f)) { zipQueue.push(f); continue; }
      if (els.keepw.checked && !isImage(f)) continue;
      items.push({
        id: autoId++, file: f, name: f.name || ('image_' + autoId + '.bin'),
        size: f.size || 0, status: 'wait', msg: human(f.size || 0), blob: null, outName: '', pick: true
      });
      n++;
    }
    return n;
  }

  function drainZips() {
    if (zipBusy) return;
    zipBusy = true;
    (function step() {
      var f = zipQueue.shift();
      if (!f) { zipBusy = false; return; }
      zipOpen++;
      if (zipOpen > 8) { zipQueue.length = 0; zipBusy = false; zipOpen = 0; setStat('压缩包套得太深，请先自己解压一遍'); return; }
      setStat('正在解开 ' + f.name + ' …');
      Unzip.read(f).then(function (ents) {
        zipOpen--;
        if (!ents.length) { setStat(f.name + ' 里没有找到图片'); return step(); }
        var files = [], i;
        for (i = 0; i < ents.length; i++) files.push(new File([ents[i].bytes], ents[i].name, { type: mimeOf(ents[i].name) }));
        var n = pushFiles(files);
        if (n) renderList();
        setStat('从 ' + f.name + ' 里取出 ' + (n || ents.length) + ' 张图片');
        step();
      }, function (err) {
        zipOpen--;
        setStat('压缩包打不开：' + (err && err.message ? err.message : err));
        step();
      });
    })();
  }

  function addFiles(list) {
    var n = pushFiles(list);
    if (n) { renderList(); setStat(); }
    if (zipQueue.length) { drainZips(); return n + 1; }
    return n;
  }

  var dirHandle = null, dirNo = false, dirPend = null;
  function fsaOk() { return !!(window.isSecureContext && window.showDirectoryPicker); }
  function wantDir() { return !!(els.savedir && els.savedir.checked && fsaOk()); }
  function ensureDir() {
    if (dirHandle) return Promise.resolve(true);
    if (dirNo || !fsaOk()) return Promise.resolve(false);
    if (dirPend) return dirPend;
    dirPend = window.showDirectoryPicker({ mode: 'readwrite', id: 'imxout' }).then(function (hd) {
      dirHandle = hd; dirPend = null; return true;
    }, function (e) {
      dirPend = null;
      if (e && e.name === 'AbortError') dirNo = true;
      return false;
    });
    return dirPend;
  }
  function writeTo(blob, name) {
    return dirHandle.getFileHandle(name, { create: true }).then(function (fh) {
      return fh.createWritable();
    }).then(function (w) {
      return w.write(blob).then(function () { return w.close(); });
    }).then(function () {
      return true;
    }, function () {
      dirHandle = null;
      return false;
    });
  }
  function save(blob, name) {
    if (!wantDir()) { download(blob, name); return Promise.resolve(false); }
    return ensureDir().then(function (ok) {
      if (!ok) { download(blob, name); return false; }
      return writeTo(blob, name).then(function (done) {
        if (done) setStat('已保存到文件夹：' + name);
        else download(blob, name);
        return done;
      });
    });
  }

  var pvUrl = null;
  function openPreview(it) {
    if (!it || !it.blob) return;
    var box = $('pv'), img = $('pvimg');
    if (!box || !img) return;
    if (pvUrl) URL.revokeObjectURL(pvUrl);
    pvUrl = URL.createObjectURL(it.blob);
    img.src = pvUrl;
    $('pvname').textContent = (it.outName || it.name) + ' · ' + human(it.blob.size);
    box.className = 'on';
  }
  function closePreview() {
    var box = $('pv');
    if (!box || box.className !== 'on') return;
    box.className = '';
    $('pvimg').removeAttribute('src');
    if (pvUrl) { URL.revokeObjectURL(pvUrl); pvUrl = null; }
  }
  $('pv').onclick = function (ev) { if (ev.target.id !== 'pvimg' && ev.target.id !== 'pvclose') closePreview(); };
  $('pvclose').onclick = closePreview;
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closePreview(); });

  function rowFor(it) {
    var li = document.createElement('li');
    li.className = 'row'; li.id = 'r' + it.id;
    var pick = document.createElement('input');
    pick.type = 'checkbox'; pick.className = 'pick'; pick.checked = it.pick !== false;
    pick.onclick = function (ev) { ev.stopPropagation(); it.pick = pick.checked; updateBtns(); };
    var info = document.createElement('div'); info.className = 'info';
    var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = it.name;
    var mt = document.createElement('div'); mt.className = 'mt'; mt.textContent = it.msg;
    info.appendChild(nm); info.appendChild(mt);
    var chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = '待处理';
    var pv = document.createElement('button'); pv.type = 'button'; pv.className = 'pv'; pv.textContent = '预览'; pv.disabled = true;
    pv.onclick = function (ev) { ev.stopPropagation(); openPreview(it); };
    var del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.textContent = '删除';
    del.onclick = function (ev) { ev.stopPropagation(); removeItem(it); };
    li.appendChild(pick); li.appendChild(info); li.appendChild(chip); li.appendChild(pv); li.appendChild(del);
    it._del = del; it._pv = pv; it._pick = pick;
    it._chip = chip; it._mt = mt;
    return li;
  }

  function picked() {
    var out = [];
    for (var i = 0; i < items.length; i++) if (items[i].pick !== false) out.push(items[i]);
    return out;
  }

  function dlSelected() {
    var sel = picked(), list = [], i;
    for (i = 0; i < sel.length; i++) if (sel[i].status === 'done' && sel[i].blob) list.push(sel[i]);
    if (!list.length) { setStat('勾选的结果还没处理完，先点「开始」'); return; }
    var total = list.length;
    if (!wantDir()) {
      list.forEach(function (it, k) { setTimeout(function () { download(it.blob, it.outName); }, k * 120); });
      setStat('已发起下载 ' + total + ' 张' + (total > 1 ? '（浏览器可能会问是否允许下载多个文件；勾「保存到文件夹」可一次存到指定目录）' : ''));
      return;
    }
    var got = 0;
    setStat('正在保存 0 / ' + total + ' 张…');
    var chain = Promise.resolve();
    list.forEach(function (it) {
      chain = chain.then(function () {
        return save(it.blob, it.outName).then(function () {
          got++;
          setStat('正在保存 ' + got + ' / ' + total + ' 张…');
        });
      });
    });
    chain.then(function () { setStat('已保存 ' + got + ' / ' + total + ' 张'); });
  }

  function delSelected() {
    if (running) return;
    var sel = picked();
    if (!sel.length) return;
    if (sel.length >= items.length) { items = []; els.list.innerHTML = ''; els.prog.style.width = '0'; setStat(); return; }
    for (var i = 0; i < sel.length; i++) removeItem(sel[i]);
    setStat();
  }

  function removeItem(it) {
    if (running) return;
    var i = items.indexOf(it);
    if (i < 0) return;
    items.splice(i, 1);
    var row = document.getElementById('r' + it.id);
    if (row) {
      var a = row.querySelector('a.dl');
      if (a) URL.revokeObjectURL(a.href);
      if (row.parentNode) row.parentNode.removeChild(row);
    }
    setStat();
  }

  function renderList() {
    var ul = els.list;
    ul.innerHTML = '';
    for (var i = 0; i < items.length; i++) ul.appendChild(rowFor(items[i]));
    updateBtns();
  }

  function updateRow(it) {
    var c = it._chip, m = it._mt;
    if (!c) return;
    c.className = 'chip' + (it.status === 'work' ? ' work' : it.status === 'done' ? ' done' : it.status === 'fail' ? ' fail' : '');
    c.textContent = it.status === 'work' ? '处理中…' : it.status === 'done' ? '完成' : it.status === 'fail' ? '失败' : '待处理';
    if (it.status === 'done') {
      m.innerHTML = '';
      m.appendChild(document.createTextNode(human(it.size) + ' · ' + it.msg + ' · '));
      var a = document.createElement('a');
      a.className = 'dl'; a.textContent = '下载'; a.download = it.outName;
      a.href = URL.createObjectURL(it.blob);
      a.onclick = function (ev) { ev.preventDefault(); if (wantDir()) save(it.blob, it.outName); else download(it.blob, it.outName); };
      var row = document.getElementById('r' + it.id);
      if (row) {
        var old = row.querySelector('a.dl');
        if (old) { row.removeChild(old); URL.revokeObjectURL(old.href); }
        row.appendChild(a);
      }
    } else if (it.status === 'fail') {
      m.innerHTML = '';
      var s = document.createElement('span'); s.className = 'err'; s.textContent = it.msg;
      m.appendChild(s);
    } else { m.textContent = it.msg; }
  }

  function setStat(txt) {
    if (txt) { els.stat.textContent = txt; return; }
    var total = items.length, done = 0, fail = 0;
    for (var i = 0; i < items.length; i++) { if (items[i].status === 'done') done++; else if (items[i].status === 'fail') fail++; }
    els.prog.style.width = (total ? Math.round(100 * (done + fail) / total) : 0) + '%';
    if (!total) els.stat.textContent = '还没有选择图片';
    else els.stat.textContent = '共 ' + total + ' 张 · 完成 ' + done + (fail ? ' · 失败 ' + fail : '') + (running ? ' · 处理中…' : '');
    updateBtns();
  }

  function updateBtns() {
    var done = 0, left = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].status === 'done') done++; else left++;
    }
    var selN = 0, selDone = 0;
    for (var q = 0; q < items.length; q++) {
      if (items[q]._pv) items[q]._pv.disabled = running || items[q].status !== 'done';
      if (items[q]._pick) items[q]._pick.disabled = running;
      if (items[q].pick !== false) { selN++; if (items[q].status === 'done' && items[q].blob) selDone++; }
    }
    if (els.selline) els.selline.hidden = !items.length;
    if (els.pickall) { els.pickall.disabled = running || !items.length; els.pickall.checked = items.length > 0 && selN === items.length; }
    if (els.selinfo) els.selinfo.textContent = items.length ? ('已勾选 ' + selN + ' / ' + items.length + ' 张') : '';
    if (els.dlsel) els.dlsel.disabled = running || !selDone;
    if (els.delsel) els.delsel.disabled = running || !selN;
    els.zipbtn.disabled = !done;
    els.start.disabled = running || !left;
    els.start.textContent = running ? '处理中…（点我停止）' : (mode === 'mix' ? '开始混淆' : '开始还原');
    els.clear.disabled = running || !items.length;
    var dels = els.list.querySelectorAll('button.del');
    for (var j = 0; j < dels.length; j++) dels[j].disabled = running;
  }

  function mixPixels(it, pw, flatten) {
    return readImage(it.file, flatten).then(function (src) {
      return sleep(0).then(function () {
        var out = Codec.encode(src.data, src.width, src.height, pw);
        it.msg = src.width + 'x' + src.height + ' -> ' + out.width + 'x' + out.height;
        it.outName = mixName(it.name);
        return sleep(0).then(function () {
          return toPng(out.data, out.width, out.height).then(function (b) { it.blob = b; });
        });
      });
    });
  }

  function mixFile(it, pw) {
    return it.file.arrayBuffer().then(function (ab) {
      return imageSize(it.file).then(function (d) {
        return sleep(0).then(function () {
          var out = Codec.encode2(new Uint8Array(ab), pw, { name: it.name, w: d ? d.w : 0, h: d ? d.h : 0 });
          it.outName = mixName(it.name);
          return sleep(0).then(function () {
            return toPng(out.data, out.width, out.height).then(function (b) {
              it.blob = b;
              it.msg = '混淆图 ' + out.width + 'x' + out.height + ' · ' + human(b.size) + '（原文件 ' + human(it.size) + '）';
            });
          });
        });
      });
    });
  }

  function unmix(it, pw) {
    return readImage(it.file, false).then(function (src) {
      return sleep(0).then(function () {
        var out = Codec.autoDecode(src.data, src.width, src.height, pw);
        var kept = null;
        if (out.kind === 'file') {
          kept = safeName(out.name);
          it.blob = new Blob([out.bytes], { type: 'application/octet-stream' });
          it.outName = kept || unmixName(it.name);
          it.msg = '还原原文件 · ' + human(it.blob.size);
        } else {
          it.outName = unmixName(it.name);
          it.msg = src.width + 'x' + src.height + ' -> ' + out.width + 'x' + out.height;
        }
        return sleep(0).then(function () {
          if (out.kind === 'file') return;
          return toPng(out.data, out.width, out.height).then(function (b) { it.blob = b; });
        });
      });
    });
  }

  function workOne(it, pw, flatten, alg) {
    if (mode !== 'mix') return unmix(it, pw);
    if (alg === 1) return mixPixels(it, pw, flatten);
    return mixFile(it, pw);
  }

  async function run() {
    if (running) { stopFlag = true; return; }
    var todo = items.filter(function (it) { return it.status !== 'done'; });
    if (!todo.length) return;
    running = true; stopFlag = false; updateBtns(); setStat();
    var pw = els.pw.value, flatten = els.flat.checked, alg = (els.alg.value === '1' ? 1 : 2), ok = 0, bad = 0;
    for (var i = 0; i < todo.length; i++) {
      if (stopFlag) break;
      var it = todo[i];
      it.status = 'work'; updateRow(it); setStat();
      await sleep(0);
      try {
        await workOne(it, pw, flatten, alg);
        it.status = 'done'; ok++;
      } catch (e) {
        it.status = 'fail'; bad++;
        it.msg = (e && e.message) ? e.message : String(e);
      }
      updateRow(it); setStat();
      await sleep(0);
    }
    running = false; updateBtns();
    setStat('本批完成：成功 ' + ok + ' 张' + (bad ? '，失败 ' + bad + ' 张' : '') + (stopFlag ? '（已手动停止）' : ''));
  }

  function buildZip() {
    var files = [], total = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.status === 'done' && it.blob) { files.push({ name: it.outName, blob: it.blob }); total += it.blob.size; }
    }
    if (!files.length) return;
    if (total > 900 * 1024 * 1024) { alert('待打包的数据太大（' + human(total) + '），请单张下载，避免浏览器内存不足。'); return; }
    setStat('正在打包 ' + files.length + ' 个文件…');
    var self = this;
    setTimeout(function () {
      Promise.all(files.map(function (f) {
        return f.blob.arrayBuffer().then(function (ab) { return { name: f.name, data: new Uint8Array(ab) }; });
      })).then(function (arr) {
        var names = ZipWriter.zipNames(arr.map(function (a) { return a.name; }));
        for (var k = 0; k < arr.length; k++) arr[k].name = names[k];
        var blob = ZipWriter.build(arr);
        var base = (mode === 'mix' ? '已混淆' : '已还原');
        save(blob, base + '_' + arr.length + '张_' + stamp() + '.zip');
        setStat('已打包 ' + arr.length + ' 张（' + human(blob.size) + '）');
      }).catch(function (e) {
        setStat('打包失败：' + (e && e.message ? e.message : e));
      });
    }, 30);
  }

  function entriesFromDataTransfer(dt) {
    var out = [], itemsList = dt.items;
    if (!itemsList || !itemsList.length) return null;
    var entries = [];
    for (var i = 0; i < itemsList.length; i++) {
      var it = itemsList[i];
      if (it.kind !== 'file') continue;
      var e = it.webkitGetAsEntry ? it.webkitGetAsEntry() : null;
      if (e) entries.push(e);
    }
    return entries.length ? entries : null;
  }
  function readEntries(reader) {
    return new Promise(function (res, rej) {
      var all = [];
      (function step() {
        reader.readEntries(function (batch) {
          if (!batch.length) return res(all);
          for (var i = 0; i < batch.length; i++) all.push(batch[i]);
          step();
        }, rej);
      })();
    });
  }
  function walkEntry(entry, acc) {
    return new Promise(function (res) {
      if (!entry) return res(acc);
      if (entry.isFile) {
        entry.file(function (f) { acc.push(f); res(acc); }, function () { res(acc); });
      } else if (entry.isDirectory) {
        readEntries(entry.createReader())
          .then(function (kids) {
            var chain = Promise.resolve(acc);
            kids.forEach(function (k) { chain = chain.then(function (a) { return walkEntry(k, a); }); });
            return chain;
          })
          .then(function (a) { res(a); })
          .catch(function () { res(acc); });
      } else { res(acc); }
    });
  }

  function bind() {
    els.tabMix = $('tabMix'); els.tabUn = $('tabUn');
    els.pw = $('pw'); els.eye = $('eye'); els.pwhint = $('pwhint');
    els.drop = $('drop'); els.file = $('file'); els.dir = $('dir');
    els.flat = $('flat'); els.keepw = $('keepw');
    els.savedir = $('savedir');
    if (els.savedir && !fsaOk()) {
      els.savedir.disabled = true; els.savedir.checked = false;
      if (els.savedir.parentNode) els.savedir.parentNode.style.opacity = '.45';
    }
    els.alg = $('alg'); els.alghint = $('alghint'); els.algcard = $('algcard');
    els.list = $('list'); els.prog = $('prog'); els.stat = $('stat');
    els.start = $('start'); els.zipbtn = $('zipbtn'); els.clear = $('clear');
    els.dlsel = $('dlsel'); els.delsel = $('delsel'); els.pickall = $('pickall');
    els.selinfo = $('selinfo'); els.selline = $('selline');
    els.subdrop = $('subdrop'); els.zipin = $('zipin');
    if (els.zipin) {
      els.zipin.onchange = function () { addFiles(els.zipin.files); els.zipin.value = ''; };
    }

    function algHint() {
      var pix = els.alg.value === '1';
      if (mode !== 'mix') {
        els.alghint.textContent = '还原时会自动识别算法，这里不用选。';
      } else {
        els.alghint.textContent = '标准 · 原文件封装：还原得到原文件本身（逐字节一致），体积约为原文件的 1.2 倍，混淆图尺寸比原图小。\n彻底 · 全图打散：把原图像素整体打散重排，还原得到图片，混淆图与原图等尺寸，体积会膨胀到原图的数倍（最高约 25 倍）。';
      }
      var useFlat = (mode === 'mix') && pix;
      els.flat.disabled = !useFlat;
      els.flat.parentNode.style.opacity = useFlat ? '1' : '.45';
      els.keepw.parentNode.style.opacity = mode === 'mix' ? '1' : '.45';
    }
    els.alg.onchange = algHint;

    function setMode(m) {
      mode = m;
      els.tabMix.className = m === 'mix' ? 'on' : '';
      els.tabUn.className = m === 'un' ? 'on' : '';
      els.start.className = 'btn primary';
      els.alg.disabled = m !== 'mix';
      algHint();
      for (var i = 0; i < items.length; i++) { var it = items[i]; it.status = 'wait'; it.blob = null; it.msg = human(it.size); }
      renderList(); setStat();
    }
    els.tabMix.onclick = function () { setMode('mix'); };
    els.tabUn.onclick = function () { setMode('un'); };

    function pwHint() {
      els.pwhint.textContent = els.pw.value
        ? '密码不保存在任何地方，忘记就还原不了；混淆和还原必须用同一个密码。'
        : '当前为「默认密钥」：任何人有本工具都能还原，只适合防随手翻看。';
    }
    els.pw.oninput = pwHint; pwHint();
    els.eye.onclick = function () {
      var show = els.pw.type === "password";
      els.pw.type = show ? "text" : "password";
      els.eye.textContent = show ? "隐藏" : "显示";
      els.pw.focus();
    };

    els.drop.onclick = function () { els.file.click(); };
    els.file.onchange = function () { addFiles(els.file.files); els.file.value = ''; };
    var canDir = 'webkitdirectory' in document.createElement('input');
    els.subdrop.innerHTML = '或把图片 / 文件夹 / ZIP 拖到这里' +
      (canDir ? ' · <u>选文件夹</u>' : '') + ' · <u>选 ZIP</u>';
    var us = els.subdrop.querySelectorAll('u'), uk = 0;
    if (canDir) {
      us[uk].onclick = function (ev) { ev.stopPropagation(); els.dir.click(); };
      uk++;
      els.dir.onchange = function () { addFiles(els.dir.files); els.dir.value = ''; };
    }
    us[uk].onclick = function (ev) { ev.stopPropagation(); els.zipin.click(); };

    document.addEventListener("dragover", function (e) { e.preventDefault(); els.drop.classList.add("over"); });
    document.addEventListener("dragleave", function (e) { if (!e.relatedTarget) els.drop.classList.remove("over"); });
    document.addEventListener("drop", function (e) {
      e.preventDefault();
      els.drop.classList.remove("over");
      var dt = e.dataTransfer;
      if (!dt) return;
      var ents = null;
      try { ents = entriesFromDataTransfer(dt); } catch (x) { ents = null; }
      var needWalk = false;
      if (ents) {
        for (var k = 0; k < ents.length; k++) { if (ents[k] && ents[k].isDirectory) needWalk = true; }
      }
      if (!needWalk && dt.files && dt.files.length) { addFiles(dt.files); return; }
      if (!ents) return;
      setStat("正在读取文件夹…");
      var acc = [];
      var chain = Promise.resolve(acc);
      ents.forEach(function (en) { chain = chain.then(function (x) { return walkEntry(en, x); }); });
      chain.then(function (x) { if (!addFiles(x)) setStat("拖入的内容里没有可用的图片"); })
           .catch(function (err) { setStat("读取失败：" + (err && err.message ? err.message : err)); });
    });

    document.addEventListener('paste', function (e) {
      var dt = e.clipboardData; if (!dt || !dt.files || !dt.files.length) return;
      addFiles(dt.files);
    });

    els.start.onclick = function () {
      if (running) { stopFlag = true; setStat('正在停止…'); return; }
      if (!items.length) { els.file.click(); return; }
      run();
    };
    els.zipbtn.onclick = function () { ensureDir(); buildZip(); };
    els.dlsel.onclick = function () { dlSelected(); };
    els.delsel.onclick = function () { delSelected(); };
    els.pickall.onchange = function () {
      var on = els.pickall.checked;
      for (var i = 0; i < items.length; i++) { items[i].pick = on; if (items[i]._pick) items[i]._pick.checked = on; }
      updateBtns();
    };
    els.clear.onclick = function () {
      items = []; els.list.innerHTML = ''; els.prog.style.width = '0'; setStat();
    };

    algHint();

  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

})();
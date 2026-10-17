(async function () {
  var R = [], bad = 0;
  function chk(name, ok, note) {
    R.push((ok ? 'PASS  ' : 'FAIL  ') + name + (note !== undefined && note !== '' ? '  -> ' + note : ''));
    if (!ok) bad++;
  }
  function q(s) { return document.querySelector(s); }
  function qa(s) { return document.querySelectorAll(s); }
  window.__dn = window.__dn || 0;
  if (!window.__dnPatched) {
    window.__dnPatched = true;
    var _oc = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { window.__dn++; return _oc.apply(this, arguments); };
  }
  function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }
  function statText() { return (document.getElementById('stat').textContent || '').trim(); }
  function waitStat(prefix, ms) {
    var t0 = Date.now();
    return new Promise(function (res) {
      (function loop() {
        if (statText().indexOf(prefix) === 0 || Date.now() - t0 > (ms || 25000)) return res(statText());
        setTimeout(loop, 80);
      })();
    });
  }
  function blobToImage(blob) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(blob), im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); res(im); };
      im.onerror = function () { rej(new Error('图片解码失败')); };
      im.src = u;
    });
  }
  function pixelsOf(im) {
    var cv = document.createElement('canvas');
    cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    var g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    return g.getImageData(0, 0, cv.width, cv.height);
  }
  function feed(file) {
    var dt = new DataTransfer();
    dt.items.add(file);
    var inp = document.getElementById('file');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function drop(file) {
    var dt = new DataTransfer();
    dt.items.add(file);
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }

  try {
    chk('页面标题', document.title === '图片混淆器', document.title);
    chk('标准模式', document.compatMode === 'CSS1Compat', document.compatMode);
    chk('字符集', document.characterSet === 'UTF-8', document.characterSet);
    var g3 = [typeof Codec, typeof HashCore, typeof ZipWriter].join(',');
    chk('全局对象齐备', g3 === 'object,object,object', g3);
    chk('无内部测试钩子', typeof window.IMX === 'undefined', String(typeof window.IMX));
    chk('脚本数 6', qa('script').length === 6, String(qa('script').length));
    chk('无预览浮层残留', document.getElementById('pv').className === '' && !document.getElementById('pvimg').getAttribute('src'), document.getElementById('pv').className);
    chk('无外链资源', qa('script[src],link[href],img[src],iframe[src]').length === 0, String(qa('script[src],link[href],img[src],iframe[src]').length));
    chk('无说明板块', qa('details').length === 0 && document.documentElement.outerHTML.indexOf('使用说明') < 0, String(qa('details').length));
    var html = document.documentElement.outerHTML;
    chk('无 HTML 注释', html.indexOf('<!--') < 0, '');
    chk('无遗留代号', html.indexOf('CWO') < 0 && html.indexOf('selftest') < 0 && html.indexOf('data-src') < 0 && html.indexOf('SelfTest') < 0, '');
    chk('无 emoji', !/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u.test(html), '');
    chk('无 js 注释残留', !/\/\*(?!")/.test(html) && !/\n\s*\/\//.test(html), '');
    var algSel = q('#alg');
    chk('有算法选择器', !!algSel && algSel.tagName === 'SELECT' && algSel.options.length === 2, algSel ? algSel.options.length + ' 个选项' : '无元素');
    chk('默认选中标准算法', algSel.value === '2' && algSel.options[0].textContent.indexOf('标准') === 0, algSel.value + ' | ' + (algSel.options[0] ? algSel.options[0].textContent : ''));
    var optTxt = algSel.options[0].textContent + ' / ' + algSel.options[1].textContent;
    chk('两个算法选项都有说明文字', algSel.options[0].textContent.length > 8 && algSel.options[1].textContent.length > 8, optTxt);
    chk('算法说明文字非空', (document.getElementById('alghint') || { textContent: '' }).textContent.length > 4, (document.getElementById('alghint') || { textContent: '' }).textContent);
    var roundBad = 0, allEl = document.querySelectorAll('*');
    for (var rei = 0; rei < allEl.length; rei++) { var rr = getComputedStyle(allEl[rei]).borderRadius || ''; if (/[1-9]/.test(rr)) roundBad++; }
    chk('全部直角矩形', roundBad === 0, roundBad + ' 个元素仍有圆角');


    document.getElementById('tabUn').click(); await tick(30);
    chk('切到还原', document.getElementById('tabUn').className === 'on' && document.getElementById('start').textContent === '开始还原', document.getElementById('start').textContent);
    document.getElementById('tabMix').click(); await tick(30);
    chk('切回混淆', document.getElementById('tabMix').className === 'on' && document.getElementById('start').textContent === '开始混淆', document.getElementById('start').textContent);

    var pw = document.getElementById('pw');
    var h0 = document.getElementById('pwhint').textContent;
    pw.value = 'abc'; pw.dispatchEvent(new Event('input', { bubbles: true })); await tick(20);
    var h1 = document.getElementById('pwhint').textContent;
    document.getElementById('eye').click(); await tick(20);
    var t1 = pw.type, b1 = document.getElementById('eye').textContent;
    document.getElementById('eye').click(); await tick(20);
    chk('密码提示会变', h0 !== h1 && h1.length > 0, h0.slice(0, 12) + ' | ' + h1.slice(0, 12));
    chk('显示/隐藏切换', t1 === 'text' && pw.type === 'password' && b1 === '隐藏' && document.getElementById('eye').textContent === '显示', t1 + '/' + pw.type + '/' + b1);
    pw.value = ''; pw.dispatchEvent(new Event('input', { bubbles: true })); await tick(20);

    var W = 53, H = 31;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d', { willReadFrequently: true });
    var im0 = g.createImageData(W, H);
    var s = 20240517;
    for (var i = 0; i < im0.data.length; i += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      im0.data[i] = (s >> 16) & 255;
      im0.data[i + 1] = (s >> 8) & 255;
      im0.data[i + 2] = s & 255;
      im0.data[i + 3] = 255;
    }
    g.putImageData(im0, 0, 0);
    var orig = g.getImageData(0, 0, W, H).data;
    var blob0 = await new Promise(function (r) { cv.toBlob(r, 'image/png'); });
    var file0 = new File([blob0], '测试照片.png', { type: 'image/png' });
    chk('测试图就绪', file0.size > 0, file0.size + ' 字节');

    drop(file0);
    await tick(400);
    chk('拖放能加入列表', qa('#list li.row').length === 1, statText());
    chk('拖放后状态栏', statText().indexOf('共 1 张') === 0, statText());
    chk('拖放后文件名', q('#list li.row .nm').textContent === '测试照片.png', q('#list li.row .nm').textContent);

    document.getElementById('clear').click(); await tick(60);
    chk('清空按钮', qa('#list li.row').length === 0 && statText() === '还没有选择图片', statText());

    feed(file0);
    await tick(400);
    chk('选择文件能加入列表', qa('#list li.row').length === 1, statText());
    var algSel2 = document.getElementById('alg');
    algSel2.value = '1'; algSel2.dispatchEvent(new Event('change', { bubbles: true })); await tick(30);
    chk('可切到彻底算法', algSel2.value === '1', algSel2.value);
    chk('彻底模式下填白选项可用', document.getElementById('flat').disabled === false, String(document.getElementById('flat').disabled));
    chk('有保存到文件夹选项', !!document.getElementById('savedir'), '');
    var sdBox = document.getElementById('savedir');
    chk('保存到文件夹选项跟随浏览器能力', sdBox.disabled === (typeof window.showDirectoryPicker !== 'function'), 'disabled=' + sdBox.disabled + ' api=' + (typeof window.showDirectoryPicker));

    document.getElementById('start').click();
    var s1 = await waitStat('本批完成', 30000);
    chk('混淆批量完成', s1.indexOf('成功 1 张') >= 0, s1);
    var row1 = qa('#list li.row')[0];
    chk('行状态完成', row1.querySelector('.chip').textContent === '完成', row1.querySelector('.chip').textContent);
    var link1 = row1.querySelector('a.dl');
    chk('混淆后文件名', link1.getAttribute('download') === '测试照片.mix.png', link1.getAttribute('download'));
    var mixBlob = await (await fetch(link1.getAttribute('href'))).blob();
    var mixIm = await blobToImage(mixBlob);
    var mixPx = pixelsOf(mixIm);
    var dw = Math.ceil(16 / H);
    chk('混淆图尺寸', mixPx.width === W + dw && mixPx.height === H, mixPx.width + 'x' + mixPx.height + ' 期望 ' + (W + dw) + 'x' + H);
    var diff = 0, alphaAll = true;
    for (var k = 0; k < orig.length; k += 4) {
      if (mixPx.data[k] !== orig[k] || mixPx.data[k + 1] !== orig[k + 1] || mixPx.data[k + 2] !== orig[k + 2]) diff++;
    }
    for (var a = 3; a < mixPx.data.length; a += 4) if (mixPx.data[a] !== 255) { alphaAll = false; break; }
    chk('混淆图全不透明', alphaAll, '');
    chk('混淆强度', diff / (W * H) > 0.95, (100 * diff / (W * H)).toFixed(1) + '% 像素变化');

    var file1 = new File([mixBlob], '测试照片.mix.png', { type: 'image/png' });
    chk('跑完后按钮恢复可用', !document.getElementById('clear').disabled && !document.getElementById('zipbtn').disabled, 'clear.disabled=' + document.getElementById('clear').disabled + ' zip.disabled=' + document.getElementById('zipbtn').disabled);
    document.getElementById('clear').click();
    await tick(60);
    chk('混淆后清空', qa('#list li.row').length === 0 && statText() === '还没有选择图片', qa('#list li.row').length + ' | ' + statText());
    document.getElementById('tabUn').click(); await tick(60);
    feed(file1);
    await tick(400);
    chk('还原入列行数', qa('#list li.row').length === 1, qa('#list li.row').length + ' | ' + statText());
    document.getElementById('start').click();
    var s2 = await waitStat('本批完成', 30000);
    chk('还原批量完成', s2.indexOf('成功 1 张') >= 0, s2);
    var link2 = qa('#list li.row')[0].querySelector('a.dl');
    chk('还原后文件名', link2.getAttribute('download') === '测试照片.png', link2.getAttribute('download'));
    var unBlob = await (await fetch(link2.getAttribute('href'))).blob();
    var unPx = pixelsOf(await blobToImage(unBlob));
    chk('还原后尺寸', unPx.width === W && unPx.height === H, unPx.width + 'x' + unPx.height);
    var d2 = 0;
    for (var j = 0; j < orig.length; j++) if (unPx.data[j] !== orig[j]) d2++;
    chk('还原逐字节一致', d2 === 0, '差异字节 ' + d2);
    document.getElementById('clear').click(); await tick(60);
    var W2 = 600, H2 = 400;
    var cv2 = document.createElement('canvas'); cv2.width = W2; cv2.height = H2;
    var g2 = cv2.getContext('2d', { willReadFrequently: true });
    var grd = g2.createLinearGradient(0, 0, W2, H2);
    grd.addColorStop(0, '#204060'); grd.addColorStop(0.5, '#e0c080'); grd.addColorStop(1, '#102030');
    g2.fillStyle = grd; g2.fillRect(0, 0, W2, H2);
    var blob2 = await new Promise(function (r) { cv2.toBlob(r, 'image/png'); });
    var file2 = new File([blob2], '风景照.png', { type: 'image/png' });

    document.getElementById('tabMix').click(); await tick(60);
    algSel2.value = '2'; algSel2.dispatchEvent(new Event('change', { bubbles: true })); await tick(30);
    chk('切回标准算法', algSel2.value === '2', algSel2.value);
    chk('标准模式下填白选项禁用', document.getElementById('flat').disabled === true, String(document.getElementById('flat').disabled));

    feed(file2);
    await tick(400);
    document.getElementById('start').click();
    var s5 = await waitStat('本批完成', 30000);
    chk('标准算法混淆完成', s5.indexOf('成功 1 张') >= 0, s5);
    var link5 = qa('#list li.row')[0].querySelector('a.dl');
    chk('标准混淆图文件名', link5.getAttribute('download') === '风景照.mix.png', link5.getAttribute('download'));
    var stdBlob = await (await fetch(link5.getAttribute('href'))).blob();
    var stdIm = await blobToImage(stdBlob);
    var stdPx = pixelsOf(stdIm);
    var stdAlpha = true;
    for (var sa = 3; sa < stdPx.data.length; sa += 4) if (stdPx.data[sa] !== 255) { stdAlpha = false; break; }
    chk('标准混淆图全不透明', stdAlpha, '');
    var pvBtn = qa('#list li.row')[0].querySelector('button.pv');
    chk('每行都有预览按钮', !!pvBtn && pvBtn.textContent === '预览', pvBtn ? pvBtn.textContent : '无');
    chk('完成后预览可用', pvBtn.disabled === false, String(pvBtn.disabled));
    pvBtn.click(); await tick(400);
    var pvBox = document.getElementById('pv'), pvImg = document.getElementById('pvimg');
    chk('预览浮层打开', pvBox.className.indexOf('on') >= 0, pvBox.className);
    chk('预览图已加载', pvImg.naturalWidth > 0 && pvImg.naturalHeight > 0, pvImg.naturalWidth + 'x' + pvImg.naturalHeight);
    chk('预览尺寸等于混淆图', pvImg.naturalWidth === stdPx.width && pvImg.naturalHeight === stdPx.height, pvImg.naturalWidth + 'x' + pvImg.naturalHeight + ' vs ' + stdPx.width + 'x' + stdPx.height);
    chk('预览标题是结果文件名', (document.getElementById('pvname').textContent || '').indexOf('风景照.mix.png') >= 0, document.getElementById('pvname').textContent);
    document.getElementById('pvclose').click(); await tick(250);
    chk('预览浮层可关闭', pvBox.className.indexOf('on') < 0 && !pvImg.getAttribute('src'), pvBox.className + '/' + String(pvImg.getAttribute('src')));
    var need5 = Math.ceil((Codec.HDR2 + 300 + file2.size) / 3);
    chk('标准混淆图按载荷开画布',
      stdPx.width * stdPx.height >= need5 && stdPx.width * stdPx.height <= need5 * 1.6 + 8192,
      stdPx.width + 'x' + stdPx.height + ' 需 ' + need5 + ' 像素');
    chk('标准混淆图体积接近原文件', stdBlob.size < file2.size * 1.5 + 40000, '原文件 ' + file2.size + 'B -> 混淆 ' + stdBlob.size + 'B');

    document.getElementById('clear').click(); await tick(60);
    algSel2.value = '1'; algSel2.dispatchEvent(new Event('change', { bubbles: true })); await tick(30);
    feed(file2);
    await tick(400);
    document.getElementById('start').click();
    var s6 = await waitStat('本批完成', 30000);
    chk('彻底算法混淆完成', s6.indexOf('成功 1 张') >= 0, s6);
    var pixBlob = await (await fetch(qa('#list li.row')[0].querySelector('a.dl').getAttribute('href'))).blob();
    chk('标准算法体积远小于彻底算法（同图）', stdBlob.size * 5 < pixBlob.size * 3,
      '标准 ' + stdBlob.size + 'B vs 彻底 ' + pixBlob.size + 'B（' + (100 * stdBlob.size / pixBlob.size).toFixed(1) + '%）');

    document.getElementById('clear').click(); await tick(60);
    algSel2.value = '2'; algSel2.dispatchEvent(new Event('change', { bubbles: true })); await tick(30);
    document.getElementById('tabUn').click(); await tick(60);
    chk('还原模式下算法选择禁用', algSel2.disabled === true, String(algSel2.disabled));
    var stdFile = new File([stdBlob], '风景照.mix.png', { type: 'image/png' });
    feed(stdFile);
    await tick(400);
    document.getElementById('start').click();
    var s7 = await waitStat('本批完成', 30000);
    chk('标准算法还原完成', s7.indexOf('成功 1 张') >= 0, s7);
    var link7 = qa('#list li.row')[0].querySelector('a.dl');
    chk('标准算法还原出原文件名', link7.getAttribute('download') === '风景照.png', link7.getAttribute('download'));
    var backBuf = new Uint8Array(await (await fetch(link7.getAttribute('href'))).blob().then(function (b) { return b.arrayBuffer(); }));
    var srcBuf = new Uint8Array(await file2.arrayBuffer());
    var same = backBuf.length === srcBuf.length;
    if (same) for (var bi = 0; bi < srcBuf.length; bi++) if (backBuf[bi] !== srcBuf[bi]) { same = false; break; }
    chk('标准算法还原出原文件（逐字节）', same, '原文件 ' + srcBuf.length + 'B -> 还原 ' + backBuf.length + 'B');


    document.getElementById('clear').click(); await tick(60);
    pw.value = '错的密码'; pw.dispatchEvent(new Event('input', { bubbles: true }));
    feed(file1);
    await tick(400);
    document.getElementById('start').click();
    var s3 = await waitStat('本批完成', 30000);
    chk('错误密码被拒', s3.indexOf('失败 1 张') >= 0, s3);
    chk('失败行状态', qa('#list li.row')[0].querySelector('.chip').textContent === '失败', qa('#list li.row')[0].querySelector('.chip').textContent);
    document.getElementById('clear').click(); await tick(60);
    document.getElementById('tabMix').click(); await tick(60);
    pw.value = ''; pw.dispatchEvent(new Event('input', { bubbles: true }));
    feed(file1); feed(file1);
    await tick(500);
    var rowsB = qa('#list li.row').length;
    var dels = qa('#list li.row button.del');
    chk('每行都有删除按钮', rowsB === 2 && dels.length === 2 && dels[0].textContent === '删除', 'rows=' + rowsB + ' del=' + dels.length);
    dels[0].click();
    await tick(80);
    chk('删除单张生效', qa('#list li.row').length === 1 && statText().indexOf('共 1 张') === 0, qa('#list li.row').length + ' | ' + statText());
    qa('#list li.row')[0].querySelector('button.del').click();
    await tick(80);
    chk('删空后状态', qa('#list li.row').length === 0 && statText() === '还没有选择图片', qa('#list li.row').length + ' | ' + statText());
    feed(file1);
    await tick(400);
    var delNow = qa('#list li.row')[0].querySelector('button.del');
    var pvNow = qa('#list li.row')[0].querySelector('button.pv');
    document.getElementById('start').click();
    chk('处理中禁止删除', delNow.disabled === true, 'disabled=' + delNow.disabled);
    chk('处理中禁止预览', pvNow.disabled === true, 'disabled=' + pvNow.disabled);
    var s4 = await waitStat('本批完成', 30000);
    chk('跑完后删除按钮恢复', delNow.disabled === false, 'disabled=' + delNow.disabled);
    chk('跑完后预览按钮恢复', pvNow.disabled === false, 'disabled=' + pvNow.disabled);
    chk('删除测试后混淆仍成功', s4.indexOf('成功 1 张') >= 0, s4);
    document.getElementById('clear').click(); await tick(60);
    feed(file1); feed(file1); feed(file1);
    await tick(500);
    document.getElementById('start').click();
    var s8 = await waitStat('本批完成', 30000);
    chk('勾选测试：三张混淆完成', s8.indexOf('成功 3 张') >= 0, s8);
    var pickBoxes = qa('#list li.row input.pick');
    chk('每行都有勾选框', pickBoxes.length === 3 && pickBoxes[0].type === 'checkbox', String(pickBoxes.length));
    chk('新加入的默认勾选', pickBoxes[0].checked && pickBoxes[1].checked && pickBoxes[2].checked, '');
    var allBox2 = document.getElementById('pickall');
    chk('有全选勾选框', !!allBox2 && allBox2.checked === true, '');
    var btnDl = document.getElementById('dlsel'), btnDel2 = document.getElementById('delsel');
    chk('有一键下载与一键删除按钮', !!btnDl && !!btnDel2 && btnDl.textContent === '一键下载' && btnDel2.textContent === '一键删除',
      (btnDl ? btnDl.textContent : '-') + ' / ' + (btnDel2 ? btnDel2.textContent : '-'));
    chk('已勾选数量提示', (document.getElementById('selinfo').textContent || '').indexOf('3 / 3') >= 0, document.getElementById('selinfo').textContent);
    allBox2.checked = false; allBox2.dispatchEvent(new Event('change', { bubbles: true })); await tick(80);
    chk('取消全选后一行都没勾', qa('#list li.row input.pick:checked').length === 0, String(qa('#list li.row input.pick:checked').length));
    chk('没勾选时两个按钮禁用', btnDl.disabled === true && btnDel2.disabled === true, btnDl.disabled + '/' + btnDel2.disabled);
    pickBoxes[0].click(); pickBoxes[1].click(); await tick(120);
    chk('勾选两张后按钮可用', btnDl.disabled === false && btnDel2.disabled === false, btnDl.disabled + '/' + btnDel2.disabled);
    chk('勾选两张的提示', (document.getElementById('selinfo').textContent || '').indexOf('2 / 3') >= 0, document.getElementById('selinfo').textContent);
    var sd2 = document.getElementById('savedir'); if (sd2 && !sd2.disabled) sd2.checked = false;
    var dnBefore = window.__dn;
    btnDl.click(); await tick(700);
    chk('一键下载只下载勾选的两张', window.__dn - dnBefore === 2, '下载 ' + (window.__dn - dnBefore) + ' 次');
    btnDel2.click(); await tick(250);
    chk('一键删除只删勾选的两张', qa('#list li.row').length === 1, '剩 ' + qa('#list li.row').length);
    chk('一键删除后状态更新', statText().indexOf('共 1 张') === 0, statText());
    document.getElementById('clear').click(); await tick(60);
    document.getElementById('clear').click(); await tick(60);

    function pngBytes(w, h, color) {
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var g = cv.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h);
      return new Promise(function (r) {
        cv.toBlob(function (b) { b.arrayBuffer().then(function (ab) { r(new Uint8Array(ab)); }); }, 'image/png');
      });
    }
    function zipOneDeflated(name, raw, comp) {
      var nm = HashCore.utf8(name), crc = ZipWriter.crc32(raw);
      var lh = new Uint8Array(30 + nm.length + comp.length), dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x800, true);
      dv.setUint16(8, 8, true); dv.setUint32(14, crc, true); dv.setUint32(18, comp.length, true);
      dv.setUint32(22, raw.length, true); dv.setUint16(26, nm.length, true);
      lh.set(nm, 30); lh.set(comp, 30 + nm.length);
      var cd = new Uint8Array(46 + nm.length), d2 = new DataView(cd.buffer);
      d2.setUint32(0, 0x02014b50, true); d2.setUint16(4, 20, true); d2.setUint16(6, 20, true);
      d2.setUint16(8, 0x800, true); d2.setUint16(10, 8, true);
      d2.setUint32(16, crc, true); d2.setUint32(20, comp.length, true); d2.setUint32(24, raw.length, true);
      d2.setUint16(28, nm.length, true);
      cd.set(nm, 46);
      var eo = new Uint8Array(22), d3 = new DataView(eo.buffer);
      d3.setUint32(0, 0x06054b50, true); d3.setUint16(8, 1, true); d3.setUint16(10, 1, true);
      d3.setUint32(12, cd.length, true); d3.setUint32(16, lh.length, true);
      var all = new Uint8Array(lh.length + cd.length + 22);
      all.set(lh, 0); all.set(cd, lh.length); all.set(eo, lh.length + cd.length);
      return all;
    }
    async function waitRows(n, ms) {
      var t0 = Date.now();
      while (qa('#list li.row').length < n && Date.now() - t0 < (ms || 9000)) await tick(100);
      return qa('#list li.row').length;
    }

    chk('拖动区提示提到 ZIP', (document.getElementById('subdrop').textContent || '').indexOf('ZIP') >= 0, document.getElementById('subdrop').textContent);
    var zA = await pngBytes(24, 16, '#38a'), zB = await pngBytes(18, 12, '#a83');
    var zBlob = ZipWriter.build([{ name: '照片一.png', data: zA }, { name: '子目录/照片二.png', data: zB }]);
    drop(new File([zBlob], '打包好了.zip', { type: 'application/zip' }));
    var zN = await waitRows(2);
    chk('拖入 ZIP 自动取出里面的图片', zN === 2, '取出 ' + zN + ' 张');
    var nmAll = qa('#list li.row .nm');
    chk('ZIP 里的文件名保留', nmAll.length === 2 && nmAll[0].textContent === '照片一.png' && nmAll[1].textContent === '照片二.png',
      (nmAll[0] ? nmAll[0].textContent : '-') + ' / ' + (nmAll[1] ? nmAll[1].textContent : '-'));
    chk('取图有状态提示', statText().indexOf('取出 2 张图片') >= 0, statText());

    if (typeof CompressionStream !== 'undefined') {
      var zC = await pngBytes(20, 14, '#3a7');
      var st0 = new Blob([zC]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      var comp = new Uint8Array(await new Response(st0).arrayBuffer());
      var dzip = zipOneDeflated('压缩过的.png', zC, comp);
      document.getElementById('clear').click(); await tick(80);
      var zin = document.getElementById('zipin');
      var dt2 = new DataTransfer();
      dt2.items.add(new File([dzip], '手机压缩.zip', { type: 'application/zip' }));
      zin.files = dt2.files;
      zin.dispatchEvent(new Event('change', { bubbles: true }));
      var zN2 = await waitRows(1);
      chk('deflate 压缩的 ZIP 也能解', zN2 === 1, '取出 ' + zN2 + ' 张');
      var nd = q('#list li.row .nm');
      chk('deflate ZIP 文件名正确', (nd ? nd.textContent : '') === '压缩过的.png', nd ? nd.textContent : '-');
    }
    document.getElementById('clear').click(); await tick(60);
  } catch (e) {
    chk('脚本异常', false, (e && e.message) || String(e));
  }
  return JSON.stringify({ bad: bad, total: R.length, lines: R });
})()
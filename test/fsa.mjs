import path from "node:path";
const FILE = process.argv[2], PORT = process.argv[3] || "9336";
const BASE = "http://127.0.0.1:" + PORT;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const u = "file:///" + path.resolve(FILE).replace(/\\/g, "/");
const t = await (await fetch(BASE + "/json/new?" + encodeURIComponent(u), { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws 打不开")); });
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (m, p) => { const i = ++id; return new Promise(r => { pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); }); };
await send("Runtime.enable", {});
await sleep(1500);

const expr = `(async function () {
  var R = [], bad = 0;
  function chk(n, ok, note) { R.push((ok ? 'PASS  ' : 'FAIL  ') + n + (note ? '  -> ' + note : '')); if (!ok) bad++; }
  function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }
  function q(s) { return document.querySelector(s); }
  function qa(s) { return document.querySelectorAll(s); }
  function drop(f) { var dt = new DataTransfer(); dt.items.add(f); document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }
  function statText() { return (document.getElementById('stat').textContent || '').trim(); }
  function waitStat(p, ms) { var t0 = Date.now(); return new Promise(function (res) { (function loop() { if (statText().indexOf(p) === 0 || Date.now() - t0 > (ms || 30000)) return res(statText()); setTimeout(loop, 80); })(); }); }

  window.__w = 0; window.__fail = false; window.__dn = 0;
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { window.__dn++; return origClick.apply(this, arguments); };
  window.showDirectoryPicker = function () {
    return Promise.resolve({
      getFileHandle: function (name) {
        if (window.__fail) return Promise.reject(new Error('no'));
        return Promise.resolve({
          createWritable: function () {
            return Promise.resolve({ write: function () { window.__w++; return Promise.resolve(); }, close: function () { return Promise.resolve(); } });
          }
        });
      }
    });
  };
  chk('注入的目录选择器可用', window.isSecureContext === true && typeof window.showDirectoryPicker === 'function', '');

  var W = 40, H = 24;
  var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  var g = cv.getContext('2d', { willReadFrequently: true });
  var d = g.createImageData(W, H);
  for (var i = 0; i < d.data.length; i++) d.data[i] = (i * 37) & 255;
  g.putImageData(d, 0, 0);
  var blob0 = await new Promise(function (r) { cv.toBlob(r, 'image/png'); });
  var file0 = new File([blob0], '通道测试.png', { type: 'image/png' });
  drop(file0); await tick(400);
  document.getElementById('start').click();
  var s1 = await waitStat('本批完成', 30000);
  chk('混淆完成', s1.indexOf('成功 1 张') >= 0, s1);
  var link = qa('#list li.row')[0].querySelector('a.dl');
  chk('行内有下载链接', !!link && !!link.getAttribute('download'), link ? link.getAttribute('download') : '无');

  var sd = document.getElementById('savedir');
  sd.checked = true;
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await tick(600);
  chk('保存到文件夹：只写目标位置', window.__w === 1, '写入 ' + window.__w + ' 次');
  chk('保存到文件夹：浏览器不再下载', window.__dn === 0, '浏览器下载 ' + window.__dn + ' 次');
  chk('保存到文件夹：状态栏提示', statText().indexOf('已保存到文件夹') === 0, statText());

  sd.checked = false;
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await tick(600);
  chk('不保存到文件夹：走浏览器下载一次', window.__dn === 1, '浏览器下载 ' + window.__dn + ' 次');
  chk('不保存到文件夹：不写目标位置', window.__w === 1, '写入 ' + window.__w + ' 次');

  sd.checked = true; window.__fail = true;
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await tick(600);
  chk('写入失败时退回浏览器下载', window.__dn === 2 && window.__w === 1, '下载 ' + window.__dn + ' / 写入 ' + window.__w);
  window.__fail = false;
  return JSON.stringify({ bad: bad, total: R.length, lines: R });
})()`;
const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, timeout: 180000 });
if (r.result && r.result.exceptionDetails) { console.log("异常: " + JSON.stringify(r.result.exceptionDetails).slice(0, 500)); process.exit(2); }
const out = JSON.parse(r.result.result.value);
for (const l of out.lines) console.log(l);
console.log(`==== 保存通道测试 ${out.total - out.bad}/${out.total} 通过 ====`);
ws.close();
process.exit(out.bad ? 1 : 0);
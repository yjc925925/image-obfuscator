import path from "node:path";
const PORT = process.argv[2] || "9337";
const BASE = "http://127.0.0.1:" + PORT;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const t = await (await fetch(BASE + "/json/new?" + encodeURIComponent("https://yjc925925.github.io/img-mixer/"), { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws")); });
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (m, p) => { const i = ++id; return new Promise(r => { pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); }); };
await send("Runtime.enable", {});
await sleep(4000);
const expr = `(async function () {
  var R = [], bad = 0;
  function chk(n, ok, note) { R.push((ok ? 'PASS  ' : 'FAIL  ') + n + (note ? '  -> ' + note : '')); if (!ok) bad++; }
  chk('线上页面可打开', document.readyState === 'complete', document.readyState);
  chk('标题', document.title === '图片混淆器', document.title);
  chk('脚本数 5', document.querySelectorAll('script').length === 5, String(document.querySelectorAll('script').length));
  chk('核心对象就位', typeof Codec === 'object' && typeof HashCore === 'object' && typeof ZipWriter === 'object', typeof Codec + '/' + typeof HashCore + '/' + typeof ZipWriter);
  chk('算法选择器', document.getElementById('alg') && document.getElementById('alg').value === '2', '');
  var W = 30, H = 20;
  var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  var g = cv.getContext('2d', { willReadFrequently: true }); var d = g.createImageData(W, H);
  for (var i = 0; i < d.data.length; i++) d.data[i] = (i * 91) & 255;
  g.putImageData(d, 0, 0);
  var blob = await new Promise(function (r) { cv.toBlob(r, 'image/png'); });
  var bytes = new Uint8Array(await blob.arrayBuffer());
  var e = Codec.encode2(bytes, 'pw123456', { name: '在线测试.png', w: W, h: H });
  var dec = Codec.autoDecode(new Uint8ClampedArray(e.data), e.width, e.height, 'pw123456');
  var same = dec.kind === 'file' && dec.bytes.length === bytes.length;
  if (same) for (var k = 0; k < bytes.length; k++) if (dec.bytes[k] !== bytes[k]) { same = false; break; }
  chk('线上混淆/还原往返逐字节一致', same, e.width + 'x' + e.height + ' / ' + bytes.length + 'B -> ' + (dec.bytes ? dec.bytes.length : 0) + 'B');
  var wrongMsg = '';
  try { Codec.autoDecode(new Uint8ClampedArray(e.data), e.width, e.height, 'bad'); } catch (err) { wrongMsg = String(err && err.message || err); }
  chk('线上错误密码被拒', wrongMsg.indexOf('密码') >= 0, wrongMsg.slice(0, 40));
  return JSON.stringify({ bad: bad, total: R.length, lines: R });
})()`;
const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, timeout: 120000 });
if (r.result && r.result.exceptionDetails) { console.log("异常: " + JSON.stringify(r.result.exceptionDetails).slice(0, 400)); process.exit(2); }
const out = JSON.parse(r.result.result.value);
for (const l of out.lines) console.log(l);
console.log(`==== 线上成品验证 ${out.total - out.bad}/${out.total} 通过 ====`);
ws.close();
process.exit(out.bad ? 1 : 0);
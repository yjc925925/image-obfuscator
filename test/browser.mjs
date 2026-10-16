import fs from "node:fs";
import path from "node:path";

const FILE = process.argv[2];
const PORT = process.argv[3] || "9336";
const BASE = "http://127.0.0.1:" + PORT;
const url = "file:///" + path.resolve(FILE).replace(/\\/g, "/");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { await (await fetch(BASE + "/json/version")).json(); }
catch (e) { console.error("连不上 CDP " + BASE + ": " + e.message); process.exit(3); }

const t = await (await fetch(BASE + "/json/new?" + encodeURIComponent(url), { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws 打不开")); });
let seq = 0; const pend = new Map(); const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  else if (m.method === "Runtime.exceptionThrown") errs.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
};
const send = (method, params) => { const i = ++seq; return new Promise((res, rej) => { pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); }); };
await send("Runtime.enable");
await sleep(1000);

const src = fs.readFileSync(path.join(path.dirname(path.resolve(FILE)), "..", "src", "selftest.js"), "utf8");
const expr = "new Promise(function(res){try{\n" + src + "\nSelfTest.run().then(function(r){res(JSON.stringify(r));},function(e){res('ERR '+e);});}catch(e){res('ERR '+e);}})";
const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true, timeout: 120000 });
let list = [];
try { list = JSON.parse(r.result.value); } catch (e) { list = []; }
if (!Array.isArray(list)) { console.log("自检未能执行: " + r.result.value); process.exit(1); }

let pass = 0, fail = 0;
list.forEach((x) => { if (x.ok) pass++; else fail++; console.log((x.ok ? "PASS  " : "FAIL  ") + x.name + (x.info ? "  -> " + String(x.info).slice(0, 130) : "")); });
if (errs.length) console.log("页面异常:\n  " + errs.slice(0, 8).join("\n  "));
console.log("==== 浏览器端自检 " + pass + "/" + list.length + " 通过 ====");
await fetch(BASE + "/json/close/" + t.id).catch(() => {});
try { ws.close(); } catch (e) {}
process.exit(fail === 0 ? 0 : 1);
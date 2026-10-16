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

const src = fs.readFileSync(path.join(path.dirname(path.resolve(FILE)), "..", "test", "e2e.js"), "utf8");
const r = await send("Runtime.evaluate", { expression: src, returnByValue: true, awaitPromise: true, timeout: 90000 });
let rep = { bad: -1, total: 0, lines: [] };
if (r.exceptionDetails) rep.lines = ["FX 页面异常: " + (((r.exceptionDetails.exception || {}).description) || r.exceptionDetails.text)];
else { try { rep = JSON.parse(r.result.value); } catch (e) { rep.lines = ["解析失败: " + r.result.value]; } }

console.log("URL: " + url);
rep.lines.forEach((l) => console.log(l));
if (errs.length) console.log("页面异常:\n  " + errs.slice(0, 8).join("\n  "));
console.log("==== " + (rep.total - rep.bad) + "/" + rep.total + " 通过 ====");
await fetch(BASE + "/json/close/" + t.id).catch(() => {});
try { ws.close(); } catch (e) {}
process.exit(rep.bad === 0 ? 0 : 1);
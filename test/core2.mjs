import fs from "node:fs";

const rd = (p) => fs.readFileSync(p, "utf8");
const boot = new Function(
  rd("src/crypto.js") + "\n" + rd("src/codec.js") + "\n" + rd("src/codec2.js") +
  "\nreturn { H: HashCore, C: Codec };"
);
const { H, C } = boot();

let total = 0, bad = 0;
function ok(cond, name, extra) {
  total++;
  if (!cond) { bad++; console.log("  失败: " + name + (extra ? " | " + extra : "")); }
}
function rnd(n, seed) {
  const b = new Uint8Array(n);
  let x = seed | 0;
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; b[i] = x >> 7 & 255; }
  return b;
}
function eq(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function threw(fn) { try { fn(); return null; } catch (e) { return e.message || String(e); } }

const PAY = [1, 17, 1000, 100000, 400000];
const DIM = [[12, 8], [1920, 1080], [400, 3000], [1, 1]];

for (const n of PAY) {
  const pay = rnd(n, n + 7);
  pay[0] = 0xff; pay[n - 1] = 0x01;
  for (const [ow, oh] of DIM) {
    const name = "测试照片 " + n + ".jpeg";
    const enc = C.encode2(pay, "pw-中文-pass", { name, w: ow, h: oh });
    const t = "载荷 " + n + "B 原图 " + ow + "x" + oh;
    ok(enc.width > 0 && enc.height > 0, t + " 尺寸有效");
    const need = Math.ceil((C.HDR2 + Buffer.byteLength(name, "utf8") + n) / 3);
    ok(enc.width * enc.height >= need, t + " 容量足够", enc.width + "x" + enc.height + " < " + need);
    ok(enc.width * enc.height <= need * 1.25 + 400, t + " 画布不浪费", enc.width * enc.height + " vs " + need);
    if (enc.width >= 16 && enc.height >= 16 && ow > 2 && oh > 2) {
      const r1 = enc.width / enc.height, r2 = ow / oh;
      ok(Math.abs(r1 - r2) / r2 < 0.25, t + " 保持宽高比", r1.toFixed(2) + " vs " + r2.toFixed(2));
    }
    let alphaOk = true;
    for (let p = 3; p < enc.data.length; p += 4) if (enc.data[p] !== 255) { alphaOk = false; break; }
    ok(alphaOk, t + " 全不透明");

    const cp = new Uint8ClampedArray(enc.data);
    const out = C.autoDecode(cp, enc.width, enc.height, "pw-中文-pass");
    ok(out.kind === "file", t + " 识别为文件包");
    ok(eq(out.bytes, pay), t + " 字节完全一致");
    ok(out.name === name, t + " 文件名还原", out.name);
    ok(out.origW === ow && out.origH === oh, t + " 记录原尺寸");
  }
}

const enc = C.encode2(rnd(5000, 3), "abc", { name: "a.png", w: 200, h: 150 });
const noPw = threw(() => C.autoDecode(new Uint8ClampedArray(enc.data), enc.width, enc.height, "abd"));
ok(noPw && noPw.indexOf("密码") >= 0, "错误密码被拒", noPw);
const empty = C.encode2(rnd(5000, 4), "", { name: "a.png", w: 200, h: 150 });
const e1 = C.autoDecode(new Uint8ClampedArray(empty.data), empty.width, empty.height, "");
ok(e1.kind === "file" && e1.bytes.length === 5000, "空密码可用");
const e2threw = threw(() => C.autoDecode(new Uint8ClampedArray(empty.data), empty.width, empty.height, "x"));
ok(e2threw && e2threw.indexOf("密码") >= 0, "空密码包用密码打不开");

const bad2 = new Uint8ClampedArray(enc.data);
bad2[(100 << 2)] = bad2[(100 << 2)] ^ 0x5a;
const t1 = threw(() => C.autoDecode(bad2, enc.width, enc.height, "abc"));
ok(t1 && t1.indexOf("损坏") >= 0, "载荷被改一个像素即被检出", t1);

const junk = new Uint8ClampedArray(60 * 60 * 4);
for (let i = 0; i < junk.length; i++) junk[i] = (i * 37) & 255;
const t2 = threw(() => C.autoDecode(junk, 60, 60, "abc"));
ok(t2 && t2.indexOf("不是本工具") >= 0, "随机图被拒", t2);

const v1 = C.encode(new Uint8ClampedArray(40 * 30 * 4), 40, 30, "k1");
const v1bad = threw(() => C.autoDecode(new Uint8ClampedArray(v1.data), v1.width, v1.height, "k2"));
ok(v1bad && v1bad.indexOf("密码") >= 0, "v1 新图错误密码提示", v1bad);
const v1ok = C.autoDecode(new Uint8ClampedArray(v1.data), v1.width, v1.height, "k1");
ok(v1ok.kind === "pixels" && v1ok.width === 40 && v1ok.height === 30, "v1 图仍可还原(像素模式)");

const noName = C.encode2(rnd(300, 9), "p", { w: 0, h: 0 });
const nn = C.autoDecode(new Uint8ClampedArray(noName.data), noName.width, noName.height, "p");
ok(nn.kind === "file" && nn.name === "" && eq(nn.bytes, (() => { const q = rnd(300, 9); return q; })()), "无原尺寸也能用");

const longName = "很长的名字".repeat(30) + ".png";
const ln = C.encode2(rnd(100, 5), "p", { name: longName, w: 100, h: 100 });
const lnOut = C.autoDecode(new Uint8ClampedArray(ln.data), ln.width, ln.height, "p");
ok(lnOut.name.length > 0 && lnOut.name.length <= 100, "超长文件名被安全截断", String(lnOut.name.length));

const t0 = Date.now();
C.encode2(rnd(4000000, 11), "pw", { name: "big.jpg", w: 4000, h: 3000 });
const dt = Date.now() - t0;
ok(dt < 4000, "4MB 载荷编码耗时 " + dt + "ms");

console.log("v2 断言：" + (total - bad) + "/" + total + " 通过");
process.exit(bad ? 1 : 0);
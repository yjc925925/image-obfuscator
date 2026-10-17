import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(here, '..', 'src', 'unzip.js'), 'utf8');
const Unzip = new Function(code + '\nreturn Unzip;')();

function buildZip(entries) {
  const parts = [], cds = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const raw = Buffer.from(e.data || Buffer.alloc(0));
    const deflated = e.method === 8 ? zlib.deflateRawSync(raw) : raw;
    const comp = e.method === 8 ? deflated : raw;
    const crc = e.method === 8 ? zlib.crc32(raw) : (e.crc === undefined ? 0 : e.crc);
    const flags = 0x800 | (e.encrypted ? 1 : 0);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(e.method, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, name, comp);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(flags, 8); cd.writeUInt16LE(e.method, 10); cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(name.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36); cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(off, 42);
    cds.push(Buffer.concat([cd, name]));
    off += 30 + name.length + comp.length;
  }
  const cdBuf = Buffer.concat(cds);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(off, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, cdBuf, eocd]);
}

function asFile(bytes, name, type) {
  const u8 = new Uint8Array(bytes);
  return { name, type: type || '', size: u8.length, arrayBuffer: async () => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.length) };
}

let pass = 0, fail = 0;
function ok(cond, name, note) {
  if (cond) { pass++; console.log('PASS  ' + name + (note ? '  -> ' + note : '')); }
  else { fail++; console.log('FAIL  ' + name + (note ? '  -> ' + note : '')); }
}
async function boom(fn, name, expect) {
  try { await fn(); ok(false, name, '没有抛出'); }
  catch (e) { const m = (e && e.message) || String(e); ok(m.indexOf(expect) >= 0, name, m); }
}

const pngA = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('aaaaaaaaaaaa')]);
const big = Buffer.alloc(100000);
for (let i = 0; i < big.length; i++) big[i] = (i * 37 + 11) & 255;

ok(Unzip.isZip({ name: 'x.zip', type: '' }) === true, '按扩展名识别 ZIP');
ok(Unzip.isZip({ name: 'x.bin', type: 'application/zip' }) === true, '按 MIME 识别 ZIP');
ok(Unzip.isZip({ name: 'x.png', type: 'image/png' }) === false, '普通图片不当 ZIP');

const zip1 = buildZip([
  { name: '照片一.png', method: 0, data: pngA },
  { name: '子目录/照片二.png', method: 8, data: big },
  { name: '说明.txt', method: 0, data: Buffer.from('hello') },
  { name: '空了/', method: 0, data: Buffer.alloc(0) },
]);
const out1 = await Unzip.read(asFile(zip1, '打包.zip', 'application/zip'));
ok(out1.length === 2, '只取图片、跳过目录与非图片', '取出 ' + out1.length + ' 项');
ok(out1[0].name === '照片一.png', 'stored 条目名字正确', out1[0].name);
ok(Buffer.compare(Buffer.from(out1[0].bytes), pngA) === 0, 'stored 条目字节一致');
ok(out1[1].name === '照片二.png', '去掉子目录、只留文件名', out1[1].name);
ok(Buffer.compare(Buffer.from(out1[1].bytes), big) === 0, 'deflate 条目解压字节一致', out1[1].bytes.length + ' 字节');

const zipUns = buildZip([{ name: '第三张.jpg', method: 12, data: Buffer.from('xxxx') }]);
const out2 = await Unzip.read(asFile(zipUns, '怪.zip', ''));
ok(out2.length === 0, '不支持的压缩方式跳过而不是崩掉', '取出 ' + out2.length + ' 项');

const zipEnc = buildZip([{ name: '锁住的.png', method: 0, data: pngA, encrypted: true }]);
await boom(() => Unzip.read(asFile(zipEnc, '有密码.zip', '')), '带密码的 ZIP 给出可读提示', '密码');
await boom(() => Unzip.read(asFile(Buffer.from('not a zip file at all, definitely not'), 'a.zip', '')), '非 ZIP 文件被拒', '不是有效的 ZIP');
await boom(() => Unzip.read(asFile(zip1.subarray(0, 40), '被截断.zip', '')), '截断的 ZIP 被拒', 'ZIP');
await boom(() => Unzip.read(asFile(buildZip([]), '空.zip', '')), '空 ZIP 被拒', '空');
await boom(() => Unzip.read(asFile(Buffer.alloc(8), '短.zip', '')), '过短文件被拒', 'ZIP');

console.log('\n==== 解压断言 ' + pass + '/' + (pass + fail) + ' 通过 ====');
process.exit(fail ? 1 : 0);
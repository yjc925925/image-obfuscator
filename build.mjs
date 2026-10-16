import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strip, stripEmoji, tight } from "./tools/clean.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const S = (f) => path.join(here, "src", f);
const out = [];

let html = fs.readFileSync(S("index.html"), "utf8");
html = html.replace(/<!--[\s\S]*?-->/g, "");
html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/gi, (m, f) => {
  const code = fs.readFileSync(S(f), "utf8");
  if (/<\/script/i.test(code)) throw new Error(f + " 含 </script");
  out.push(f + " " + code.length + "B");
  return "<script>\n" + tight(stripEmoji(strip(code))) + "\n</script>";
});
if (out.length !== 5) throw new Error("内联脚本数 " + out.length + "，应为 5");
if (/<script[^>]*\ssrc=/i.test(html)) throw new Error("还有外链脚本");
if (/<link[^>]*\shref=/i.test(html)) throw new Error("还有外链样式");
if (/<!--/.test(html)) throw new Error("还有 HTML 注释");

// Two names for the same bytes at the repo root: index.html is what GitHub Pages
// serves and what a download lands as; the Chinese name is what a Chinese-speaking
// user actually looks for in their downloads folder.
const bytes = Buffer.byteLength(html, "utf8");
for (const name of ["index.html", "图片混淆器.html"]) {
  fs.writeFileSync(path.join(here, name), html, "utf8");
  console.log(name + "  " + bytes + " 字节");
}
console.log("内联 " + out.join(" / "));
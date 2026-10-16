import fs from "node:fs";

const ID = /[A-Za-z0-9_$]/;
const KW = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "case", "do", "else", "yield", "await"]);

export function strip(src) {
  let out = "", i = 0, prev = "", word = "";
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") out += "\n"; i++; }
      i += 2; continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; out += c; i++;
      while (i < n) {
        if (src[i] === "\\") { out += src[i] + (src[i + 1] || ""); i += 2; continue; }
        if (src[i] === q) { out += q; i++; break; }
        out += src[i]; i++;
      }
      prev = q; word = ""; continue;
    }
    if (c === "/" && (KW.has(word) || (!ID.test(prev) && prev !== ")" && prev !== "]" && prev !== "}"))) {
      let j = i + 1, cls = false, ok = false;
      while (j < n) {
        const ch = src[j];
        if (ch === "\\") { j += 2; continue; }
        if (ch === "\n") break;
        if (ch === "[") cls = true;
        else if (ch === "]") cls = false;
        else if (ch === "/" && !cls) { ok = true; break; }
        j++;
      }
      if (ok) {
        j++;
        while (j < n && /[a-z]/i.test(src[j])) j++;
        out += src.slice(i, j); i = j; prev = ")"; word = ""; continue;
      }
    }
    out += c;
    if (ID.test(c)) word += c; else word = "";
    if (!/[ \t\r\n]/.test(c)) prev = c;
    i++;
  }
  return out;
}

export function stripEmoji(s) {
  return s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}\u{2190}-\u{21AF}]/gu, "");
}

export function tight(s) {
  return s.split("\n").map((l) => l.replace(/[ \t]+$/, "")).filter((l) => l.trim() !== "").join("\n") + "\n";
}

export function tidy(s) {
  return s.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
}

if (process.argv[1] && process.argv[1].endsWith("clean.mjs")) {
  const list = process.argv.slice(2);
  for (const f of list) {
    const a = fs.readFileSync(f, "utf8");
    const b = tidy(stripEmoji(strip(a)));
    fs.writeFileSync(f, b, "utf8");
    console.log(f + "  " + a.length + " -> " + b.length);
  }
}
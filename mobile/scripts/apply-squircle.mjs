/**
 * 批量将 borderRadius 升级为超椭圆半径，并追加 borderCurve: 'continuous'
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../src");

const MAP = {
  1: 10,
  2: 12,
  3: 14,
  4: 14,
  5: 16,
  6: 16,
  8: 18,
  10: 20,
  11: 20,
  12: 22,
  14: 24,
  16: 26,
  17: 26,
  18: 28,
  20: 30,
  21: 30,
  22: 32,
  24: 34,
  28: 36,
  32: 40,
  44: 48,
  52: 56,
};

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

function mapRadius(num) {
  if (num >= 999) return num;
  return MAP[num] ?? Math.max(num + 8, 16);
}

function transform(content) {
  let next = content;

  // 已有 borderCurve 的跳过
  next = next.replace(
    /borderRadius:\s*(\d+)(?![^,\n]*borderCurve)/g,
    (match, n, offset, whole) => {
      const num = Number(n);
      if (num >= 999) return match;
      // 向后看同一对象是否已有 borderCurve
      const tail = whole.slice(offset, offset + 120);
      if (/borderCurve/.test(tail.split("\n").slice(0, 3).join("\n"))) {
        return match;
      }
      const mapped = mapRadius(num);
      return `borderRadius: ${mapped}, borderCurve: "continuous"`;
    },
  );

  // 其他 *Radius 属性（TopLeft 等）
  next = next.replace(
    /(border(?:Top|Bottom)?(?:Left|Right)?Radius):\s*(\d+)(?![^,\n]*borderCurve)/g,
    (match, prop, n, offset, whole) => {
      const num = Number(n);
      if (num >= 999 || num === 0) return match;
      const tail = whole.slice(offset, offset + 120);
      if (/borderCurve/.test(tail.split("\n").slice(0, 3).join("\n"))) {
        return match;
      }
      const mapped = mapRadius(num);
      return `${prop}: ${mapped}, borderCurve: "continuous"`;
    },
  );

  // 清理重复 borderCurve
  next = next.replace(
    /borderCurve:\s*"continuous",\s*borderCurve:\s*"continuous"/g,
    'borderCurve: "continuous"',
  );

  return next;
}

let changed = 0;
for (const file of walk(ROOT)) {
  const raw = fs.readFileSync(file, "utf8");
  const out = transform(raw);
  if (out !== raw) {
    fs.writeFileSync(file, out);
    changed++;
    console.log("updated:", path.relative(ROOT, file));
  }
}
console.log(`Done. ${changed} files updated.`);

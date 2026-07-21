import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const tmpRoot = process.env.TEMP || process.env.TMPDIR || "/tmp";
const { pinyin } = require(path.join(tmpRoot, "package", "dist", "index.js"));

function shortName(name) {
  return name
    .replace(/特别行政区$/, "")
    .replace(/土家族苗族自治州$/, "")
    .replace(/布依族苗族自治州$/, "")
    .replace(/苗族侗族自治州$/, "")
    .replace(/藏族羌族自治州$/, "")
    .replace(/哈尼族彝族自治州$/, "")
    .replace(/壮族苗族自治州$/, "")
    .replace(/傣族景颇族自治州$/, "")
    .replace(/朝鲜族自治州$/, "")
    .replace(/藏族自治州$/, "")
    .replace(/彝族自治州$/, "")
    .replace(/白族自治州$/, "")
    .replace(/傣族自治州$/, "")
    .replace(/傈僳族自治州$/, "")
    .replace(/回族自治州$/, "")
    .replace(/蒙古族藏族自治州$/, "")
    .replace(/蒙古自治州$/, "")
    .replace(/柯尔克孜自治州$/, "")
    .replace(/哈萨克自治州$/, "")
    .replace(/自治州$/, "")
    .replace(/地区$/, "")
    .replace(/盟$/, "")
    .replace(/市$/, "");
}

function letterOf(name) {
  const overrides = {
    重庆: "C",
    长春: "C",
    长沙: "C",
    长治: "C",
    厦门: "X",
    香港: "X",
    澳门: "A",
  };
  if (overrides[name]) return overrides[name];
  const py = pinyin(name, { toneType: "none", type: "array" });
  const first = (py[0] || "z")[0].toUpperCase();
  return /[A-Z]/.test(first) ? first : "Z";
}

const city = await (
  await fetch("https://unpkg.com/province-city-china@8.5.8/dist/city.json")
).json();

const names = new Set();
const entries = [];
const add = (raw) => {
  const name = shortName(raw);
  if (!name || names.has(name)) return;
  names.add(name);
  entries.push({ name, letter: letterOf(name) });
};

["北京", "天津", "上海", "重庆", "香港", "澳门", "台湾"].forEach(add);
for (const c of city) add(c.name);
// 常见旅游目的地（非地级市名或简称）
["黄山", "张家界", "九寨沟", "香格里拉", "敦煌", "吐鲁番", "丽江"].forEach(add);

entries.sort((a, b) =>
  a.letter === b.letter
    ? a.name.localeCompare(b.name, "zh-CN")
    : a.letter.localeCompare(b.letter),
);

const outPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "cities.ts",
);

const body = `/** 全国地级行政区 + 港澳台（按拼音首字母） */

export type CityEntry = { name: string; letter: string };

export const CITIES: CityEntry[] = [
${entries.map((e) => `  { name: "${e.name}", letter: "${e.letter}" },`).join("\n")}
];

/** 按首字母分组；可按名称 / 字母过滤 */
export function citiesGrouped(filter = ""): Array<[string, string[]]> {
  const f = filter.trim().toLowerCase();
  const list = !f
    ? CITIES
    : CITIES.filter(
        (c) =>
          c.name.includes(filter.trim()) ||
          c.letter.toLowerCase() === f ||
          c.name.toLowerCase().startsWith(f),
      );
  const map = new Map<string, string[]>();
  for (const c of list) {
    const arr = map.get(c.letter) || [];
    arr.push(c.name);
    map.set(c.letter, arr);
  }
  return [...map.entries()];
}
`;

fs.writeFileSync(outPath, body, "utf8");
console.log("wrote", entries.length, "cities to", outPath);
for (const n of [
  "北京",
  "大理",
  "西双版纳",
  "黔东南",
  "重庆",
  "厦门",
  "长春",
  "黄山",
  "香港",
  "喀什",
]) {
  console.log(n, entries.find((x) => x.name === n));
}

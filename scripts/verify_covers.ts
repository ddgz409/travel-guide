/**
 * 封面跨城错配回归校验（无需 vitest）。
 * 运行: cd frontend && npx --yes tsx ../scripts/verify_covers.ts
 */
import {
  COVER_CITY_OWNERSHIP,
  coverForCity,
  coverForItem,
  coverForRoute,
  resolveCityKey,
} from "../frontend/lib/cover";
import { existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "frontend", "public");
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK:", msg);
  }
}

// 文件存在
for (const [path, city] of Object.entries(COVER_CITY_OWNERSHIP)) {
  assert(existsSync(join(ROOT, path.replace(/^\//, ""))), `${path} exists (${city})`);
}

assert(resolveCityKey("杭州市") === "杭州", "resolve 杭州市");
assert(coverForCity("杭州") === "/covers/westlake.jpg", "杭州城市封面=西湖");
assert(coverForCity("上海") === "/covers/shanghai_bund.jpg", "上海城市封面=外滩");

// 三条杭州路线不得出现上海/北京图
const hzRoutes = [
  coverForRoute("杭州", "经典必去", ["杭州西湖风景名胜区", "断桥残雪"]),
  coverForRoute("杭州", "人文慢游", ["胡雪岩旧居", "清河坊步行街"]),
  coverForRoute("杭州", "美食轻松", ["必滕·猪排专门店", "华家池"]),
];
for (const url of hzRoutes) {
  assert(!url.includes("shanghai") && !url.includes("yuyuan") && !url.includes("gugong") && !url.includes("greatwall") && !url.includes("generic_city") && !url.includes("generic_garden"), `杭州路线封面同城: ${url}`);
  const owner = COVER_CITY_OWNERSHIP[url];
  assert(!owner || owner === "杭州", `杭州路线归属杭州: ${url} -> ${owner}`);
}

assert(coverForRoute("杭州", "经典必去", ["西湖"]) === "/covers/westlake.jpg", "西湖亮点");
assert(coverForRoute("杭州", "人文慢游", ["胡雪岩旧居"]).includes("hangzhou"), "胡雪岩→杭州图");
assert(coverForRoute("杭州", "美食轻松", ["随便一家店"]).includes("hangzhou"), "美食无亮点→杭州主题图");

// 条目带 city 时不串城
assert(
  !coverForItem("随便景点", "attraction", "杭州").includes("shanghai"),
  "杭州未知景点不串上海",
);
assert(coverForItem("外滩", "attraction", "上海").includes("shanghai"), "上海外滩");
assert(coverForItem("外滩", "attraction", "杭州") !== "/covers/shanghai_bund.jpg", "杭州上下文不匹配外滩关键词…");
// 外滩 keyword only in 上海 list — with city=杭州, landmarkCoverFor only searches 杭州 keys, so 外滩 won't match; falls back to hangzhou pool
assert(
  coverForItem("外滩观光", "attraction", "杭州").startsWith("/covers/") &&
    !coverForItem("外滩观光", "attraction", "杭州").includes("shanghai"),
  "杭州行程中名称含外滩也不用上海封面",
);

if (failed) {
  console.error(`\n${failed} checks failed`);
  process.exit(1);
}
console.log("\nAll cover checks passed");

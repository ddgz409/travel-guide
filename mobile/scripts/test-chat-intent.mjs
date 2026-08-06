import {
  buildExpandedQuery,
  parseSmartPlanKeywords,
  searchPlanSuggestions,
} from "../src/utils/chatIntent.ts";

function assert(label, cond) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`ok: ${label}`);
}

const hzTomorrow = parseSmartPlanKeywords("杭州明天");
assert("杭州明天 parsed", !!hzTomorrow);
assert("杭州明天 1天", hzTomorrow.days === 1);
assert("杭州明天 dest", hzTomorrow.destination === "杭州");

const bj3 = parseSmartPlanKeywords("北京3天");
assert("北京3天 days", bj3.days === 3);
assert("北京3天 expanded", buildExpandedQuery(bj3).includes("北京"));

const hzOnly = searchPlanSuggestions("杭州");
assert("杭州 incomplete", !!hzOnly.incompletePlan);
assert("杭州 not complete", !hzOnly.smartPlan);

const hz3 = searchPlanSuggestions("杭州3天");
assert("杭州3天 complete", !!hz3.smartPlan);

const huai = searchPlanSuggestions("淮");
assert("淮 prefix cities", huai.cities.some((c) => c.includes("淮安")));
assert("淮 not complete", !huai.smartPlan);

const mars = searchPlanSuggestions("火星市");
assert("火星 unknown", mars.unknownInput);

console.log("all chatIntent tests passed");

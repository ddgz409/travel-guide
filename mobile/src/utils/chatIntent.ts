/** 客户端行程规划意图识别（与后端 chat_intent 对齐，不依赖服务端部署） */

import { CITIES } from "../data/cities";

export type PlanNavigateAction = {
  action: "navigate_generate";
  destination: string;
  start_date: string;
  end_date: string;
  interests: string[];
  mode: "custom";
  auto_submit: boolean;
  chat_hint: string;
};

/** 智能规划：短关键词 → 完整规划草稿 */
export type SmartPlanDraft = {
  keywords: string;
  destination: string;
  days: number;
  start_date: string;
  end_date: string;
  expandedQuery: string;
  action: PlanNavigateAction;
};

export type SmartPlanSuggestion = {
  smartPlan: SmartPlanDraft | null;
  cities: string[];
};

const MAJOR_CITIES = [
  "呼和浩特", "乌鲁木齐", "哈尔滨", "石家庄", "连云港", "张家界",
  "香格里拉", "九寨沟", "香港", "澳门", "台北",
  "北京", "上海", "广州", "深圳", "杭州", "成都", "西安", "南京", "苏州",
  "重庆", "武汉", "长沙", "厦门", "青岛", "大连", "三亚", "丽江", "拉萨",
  "昆明", "贵阳", "南宁", "海口", "福州", "济南", "郑州", "合肥", "南昌",
  "太原", "沈阳", "长春", "宁波", "无锡", "常州", "温州", "珠海", "桂林",
  "敦煌", "洛阳", "开封", "扬州", "威海", "烟台", "秦皇岛", "北戴河",
] as const;

const PLAN_RE =
  /(?:规划|安排|制定|设计|生成).*(?:行程|攻略|旅行计划|旅游计划)|(?:行程|攻略|旅行计划|旅游计划)|(?:一|两|三|四|五|六|七|八|九|\d+)\s*日游/i;

const INTEREST_MAP: [string, string][] = [
  ["美食", "美食"],
  ["吃货", "美食"],
  ["穿衣", "购物"],
  ["搭配", "购物"],
  ["亲子", "亲子"],
  ["拍照", "摄影"],
  ["摄影", "摄影"],
  ["博物馆", "历史"],
  ["历史", "历史"],
  ["自然", "自然"],
  ["户外", "自然"],
  ["购物", "购物"],
  ["艺术", "艺术"],
  ["文化", "文化"],
  ["人文", "文化"],
];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDates(text: string): { start: string; end: string } {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  let start = new Date(today);
  if (text.includes("大后天")) start.setDate(start.getDate() + 3);
  else if (text.includes("后天")) start.setDate(start.getDate() + 2);
  else if (text.includes("明天")) start.setDate(start.getDate() + 1);
  else if (text.includes("今天")) {
    /* today */
  } else start.setDate(start.getDate() + 1);

  const dm = text.match(/(\d+)\s*天/);
  const days = dm ? Math.max(1, Math.min(parseInt(dm[1], 10), 14)) : 1;
  const end = new Date(start);
  end.setDate(end.getDate() + days - 1);
  return { start: iso(start), end: iso(end) };
}

function extractCity(text: string): string | null {
  for (const city of [...MAJOR_CITIES].sort((a, b) => b.length - a.length)) {
    if (text.includes(city)) return city;
  }
  const m1 = text.match(/去([\u4e00-\u9fff]{2,8}?)(?:的|玩|旅游|行)/);
  if (m1?.[1] && m1[1].length >= 2) return m1[1];
  const m2 = text.match(/([\u4e00-\u9fff]{2,4})(?:市|城)?(?:的)?(?:行程|攻略|旅游)/);
  if (m2?.[1]) return m2[1];
  return null;
}

function extractInterests(text: string): string[] {
  const found: string[] = [];
  for (const [kw, tag] of INTEREST_MAP) {
    if (text.includes(kw) && !found.includes(tag)) found.push(tag);
  }
  return found.length ? found : ["文化", "美食"];
}

const CN_DAY_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function parseDayCount(text: string): number | null {
  const m = text.match(/(\d+)\s*天/);
  if (m) return Math.max(1, Math.min(parseInt(m[1], 10), 14));
  const m2 = text.match(/([一二两三四五六七八九])\s*日游/);
  if (m2?.[1]) return CN_DAY_MAP[m2[1]] ?? null;
  return null;
}

function defaultDays(text: string): number {
  const explicit = parseDayCount(text);
  if (explicit) return explicit;
  if (text.includes("周末") || text.includes("小长假")) return 2;
  if (
    text.includes("明天") ||
    text.includes("后天") ||
    text.includes("今天") ||
    text.includes("大后天")
  ) {
    return 1;
  }
  return 2;
}

function extractCityFromKeywords(text: string): string | null {
  const raw = text.trim();
  for (const city of [...MAJOR_CITIES].sort((a, b) => b.length - a.length)) {
    if (raw.includes(city)) return city;
  }
  for (const { name } of CITIES) {
    const short = name.replace(/市$/, "");
    if (raw.includes(short) || short.startsWith(raw) || raw.startsWith(short)) {
      return short;
    }
  }
  const m = raw.match(/^([\u4e00-\u9fff]{2,4})/);
  if (m?.[1] && m[1].length >= 2) return m[1];
  return null;
}

function parseDatesWithDays(text: string, days: number): { start: string; end: string } {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  let start = new Date(today);
  if (text.includes("大后天")) start.setDate(start.getDate() + 3);
  else if (text.includes("后天")) start.setDate(start.getDate() + 2);
  else if (text.includes("明天")) start.setDate(start.getDate() + 1);
  else if (text.includes("今天")) {
    /* today */
  } else start.setDate(start.getDate() + 1);

  const end = new Date(start);
  end.setDate(end.getDate() + days - 1);
  return { start: iso(start), end: iso(end) };
}

export function parseSmartPlanKeywords(keywords: string): SmartPlanDraft | null {
  const raw = (keywords || "").trim();
  if (raw.length < 2) return null;
  const destination = extractCityFromKeywords(raw);
  if (!destination) return null;

  const days = defaultDays(raw);
  const { start, end } = parseDatesWithDays(raw, days);

  const action: PlanNavigateAction = {
    action: "navigate_generate",
    destination,
    start_date: start,
    end_date: end,
    interests: extractInterests(raw),
    mode: "custom",
    auto_submit: true,
    chat_hint: raw,
  };

  return {
    keywords: raw,
    destination,
    days,
    start_date: start,
    end_date: end,
    expandedQuery: "",
    action,
  };
}

export function searchPlanSuggestions(query: string): SmartPlanSuggestion {
  const q = query.trim();
  if (!q) return { smartPlan: null, cities: [] };

  const smartPlan = parseSmartPlanKeywords(q);
  const cities = CITIES.filter(
    (c) => c.name.includes(q) || q.includes(c.name.replace(/市$/, "")),
  )
    .slice(0, 6)
    .map((c) => c.name.replace(/市$/, ""));

  const deduped = [...new Set(cities)].filter(
    (name) => name !== smartPlan?.destination,
  );

  return { smartPlan, cities: deduped };
}

export function detectPlanIntent(text: string): PlanNavigateAction | null {
  const raw = (text || "").trim();
  if (raw.length < 4 || !PLAN_RE.test(raw)) return null;
  const destination = extractCity(raw);
  if (!destination) return null;
  const { start, end } = parseDates(raw);
  return {
    action: "navigate_generate",
    destination,
    start_date: start,
    end_date: end,
    interests: extractInterests(raw),
    mode: "custom",
    auto_submit: true,
    chat_hint: raw,
  };
}

export function planActionToGenerateParams(action: PlanNavigateAction) {
  return {
    mode: action.mode,
    destination: action.destination,
    interests: action.interests,
    startDate: action.start_date,
    endDate: action.end_date,
    autoSubmit: action.auto_submit,
    chatHint: action.chat_hint,
  };
}

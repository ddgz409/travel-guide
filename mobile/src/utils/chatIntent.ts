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
  travelers?: number;
  transport?: string;
  route?: string[];
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
  /** 地名 + 时长都齐全，可直接确认规划 */
  smartPlan: SmartPlanDraft | null;
  /** 仅有合理地名，缺时长等信息，需 AI 补全 */
  incompletePlan: SmartPlanDraft | null;
  cities: string[];
  /** 输入不像已知城市且暂无匹配建议 */
  unknownInput: boolean;
};

const MAJOR_CITIES = [
  "呼和浩特", "乌鲁木齐", "哈尔滨", "石家庄", "连云港", "张家界",
  "香格里拉", "九寨沟", "香港", "澳门", "台北",
  "北京", "上海", "广州", "深圳", "杭州", "成都", "西安", "南京", "苏州",
  "重庆", "武汉", "长沙", "厦门", "青岛", "大连", "三亚", "丽江", "拉萨",
  "昆明", "贵阳", "南宁", "海口", "福州", "济南", "郑州", "合肥", "南昌",
  "太原", "沈阳", "长春", "宁波", "无锡", "常州", "温州", "珠海", "桂林",
  "敦煌", "洛阳", "开封", "扬州", "威海", "烟台", "秦皇岛", "北戴河",
  "淮安", "徐州", "盐城", "泰州", "镇江", "宿迁", "顺德", "佛山", "东莞",
] as const;

/** 省份名（与后端 destination_validator.PROVINCE_CITIES 对齐）：
 *  输入省份名即可整省规划，系统会展开成省内热门城市路线。 */
const PROVINCES = [
  "山东", "云南", "四川", "湖南", "福建", "江西", "安徽", "贵州", "广西",
  "河南", "湖北", "陕西", "山西", "河北", "辽宁", "吉林", "黑龙江",
  "江苏", "浙江", "广东", "甘肃", "新疆", "西藏", "内蒙古", "宁夏", "青海",
  "海南", "台湾",
] as const;

const KNOWN_CITY_SET = new Set<string>(
  [
    ...MAJOR_CITIES,
    ...PROVINCES,
    ...CITIES.map((c) => c.name.replace(/市$/, "")),
  ].map((n) => n.replace(/市$/, "")),
);

const PLAN_RE =
  /(?:规划|安排|制定|设计|生成).*(?:行程|攻略|旅行计划|旅游计划|路线|环线|环岛)|(?:帮我|请).*(?:规划|安排|制定|设计|生成).*(?:行程|攻略|旅行|旅游)?|(?:一|两|三|四|五|六|七|八|九|\d+)\s*日游/i;

const TRIP_MGMT_RE =
  /删除|删掉|删了|移除|清除|去掉|取消|不要了|查看|看看|列表|有哪些|我的行程|行程列表|攻略列表|打开|分享|\/share\/|修改|编辑|更新|帖子|收藏夹|发布|发帖|做成清单|转成清单|改成清单|编辑成清单/i;

const NEW_PLAN_RE = /(?:规划|安排|制定|设计|生成)(?:一个|一份|新的)?(?:行程|攻略)/;

export function isTripManagementIntent(text: string): boolean {
  const raw = (text || "").trim();
  if (!raw || !TRIP_MGMT_RE.test(raw)) return false;
  if (NEW_PLAN_RE.test(raw)) return false;
  return true;
}

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

function normalizeCity(name: string): string {
  return name
    .replace(/市$/, "")
    .replace(/维吾尔自治区$/, "")
    .replace(/壮族自治区$/, "")
    .replace(/回族自治区$/, "")
    .replace(/自治区$/, "")
    .replace(/省$/, "")
    .trim();
}

export function isKnownCityName(name: string): boolean {
  const n = normalizeCity(name);
  return n.length >= 2 && KNOWN_CITY_SET.has(n);
}

export function hasPlanDuration(text: string): boolean {
  return (
    parseDayCount(text) !== null ||
    /明天|后天|大后天|今天|周末|小长假|规划|行程|攻略|日游/.test(text)
  );
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
  for (const { name } of CITIES) {
    const short = normalizeCity(name);
    if (text.includes(short)) return short;
  }
  const m1 = text.match(/去([\u4e00-\u9fff]{2,8}?)(?:的|玩|旅游|行)/);
  if (m1?.[1] && isKnownCityName(m1[1])) return normalizeCity(m1[1]);
  const m2 = text.match(/([\u4e00-\u9fff]{2,6})(?:市|城)?(?:的)?(?:行程|攻略|旅游)/);
  if (m2?.[1] && isKnownCityName(m2[1])) return normalizeCity(m2[1]);
  // 环线名（如「青甘环线」「海南环岛」「西北大环线」）
  const m3 = text.match(/([\u4e00-\u9fff]{2,10}?)(环线|环岛|大环线)/);
  if (m3?.[1]) return `${m3[1]}${m3[2]}`;
  // 省份名兜底（如「帮我规划山东」）：放在城市之后，具体城市优先
  for (const p of PROVINCES) {
    if (text.includes(p)) return p;
  }
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

export function parseDayCount(text: string): number | null {
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
  if (!raw) return null;

  for (const city of [...MAJOR_CITIES].sort((a, b) => b.length - a.length)) {
    if (raw.includes(city)) return city;
  }
  for (const { name } of CITIES) {
    const short = normalizeCity(name);
    if (raw.includes(short)) return short;
  }

  const exact = normalizeCity(raw);
  if (isKnownCityName(exact)) return exact;

  const m = raw.match(/^([\u4e00-\u9fff]{2,6})/);
  if (m?.[1] && isKnownCityName(m[1])) return normalizeCity(m[1]);

  return null;
}

export function matchCityCandidates(query: string, limit = 6): string[] {
  const q = query.trim();
  if (!q) return [];

  const scored: { name: string; score: number }[] = [];
  for (const { name } of CITIES) {
    const short = normalizeCity(name);
    if (short === q) {
      scored.push({ name: short, score: 0 });
      continue;
    }
    if (short.startsWith(q)) {
      scored.push({ name: short, score: 1 + (short.length - q.length) * 0.01 });
      continue;
    }
    if (q.length >= 2 && short.includes(q)) {
      scored.push({ name: short, score: 10 + short.length });
    }
  }
  for (const city of MAJOR_CITIES) {
    if (city.startsWith(q)) {
      scored.push({ name: city, score: 1 });
    } else if (q.length >= 2 && city.includes(q)) {
      scored.push({ name: city, score: 10 });
    }
  }

  scored.sort((a, b) => a.score - b.score || a.name.length - b.name.length);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { name } of scored) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
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

export function buildExpandedQuery(draft: SmartPlanDraft): string {
  const dest = draft.destination;
  const days = draft.days;
  const raw = draft.keywords;
  if (/规划|行程|攻略/.test(raw) && raw.length > 8) {
    return raw.startsWith("帮我") ? raw : `帮我${raw}`;
  }
  const timeHint = raw.match(/明天|后天|大后天|今天|周末/)?.[0];
  if (timeHint) {
    return `帮我规划${timeHint}去${dest}的${days}日行程，体验当地文化与美食`;
  }
  return `帮我规划${draft.start_date}起${dest}${days}日游，体验当地文化与美食`;
}

export function parseSmartPlanKeywords(keywords: string): SmartPlanDraft | null {
  const raw = (keywords || "").trim();
  if (raw.length < 2) return null;
  const destination = extractCityFromKeywords(raw);
  if (!destination || !isKnownCityName(destination)) return null;

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

function isCompleteSmartPlanQuery(q: string, draft: SmartPlanDraft): boolean {
  if (!isKnownCityName(draft.destination)) return false;
  if (!hasPlanDuration(q)) return false;
  const dest = draft.destination;
  if (dest.startsWith(q.trim()) && q.trim().length < dest.length) return false;
  return true;
}

export function searchPlanSuggestions(query: string): SmartPlanSuggestion {
  const q = query.trim();
  if (!q) {
    return { smartPlan: null, incompletePlan: null, cities: [], unknownInput: false };
  }

  const parsed = parseSmartPlanKeywords(q);
  const cities = matchCityCandidates(q).filter(
    (name) => name !== parsed?.destination,
  );

  if (parsed && isCompleteSmartPlanQuery(q, parsed)) {
    return {
      smartPlan: parsed,
      incompletePlan: null,
      cities,
      unknownInput: false,
    };
  }

  if (parsed && isKnownCityName(parsed.destination)) {
    return {
      smartPlan: null,
      incompletePlan: parsed,
      cities,
      unknownInput: false,
    };
  }

  const unknownInput =
    q.length >= 2 && cities.length === 0 && !/^\d+$/.test(q);

  return {
    smartPlan: null,
    incompletePlan: null,
    cities,
    unknownInput,
  };
}

export function detectPlanIntent(text: string): PlanNavigateAction | null {
  const raw = (text || "").trim();
  if (raw.length < 4) return null;
  if (isTripManagementIntent(raw)) return null;
  if (!PLAN_RE.test(raw)) return null;
  const destination = extractCity(raw);
  if (!destination) return null;
  // 目的地必须是已知城市 / 省份 / 环线名，否则不跳转
  const isKnown = isKnownCityName(destination) || PROVINCES.includes(destination as any) || /环线|环岛|大环线/.test(destination);
  if (!isKnown) return null;
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

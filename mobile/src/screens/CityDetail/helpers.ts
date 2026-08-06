import { DESTINATIONS } from "../Explore/content";
import { landmarksFor } from "../../data/landmarks";
import type { CityInfo } from "@travel-guide/shared";

export type ExploreCategory = "spots" | "foods";

export const CATEGORIES: Array<{
  key: ExploreCategory;
  label: string;
  icon: string;
  color: string;
}> = [
  { key: "spots", label: "景点", icon: "🌳", color: "#4CAF50" },
  { key: "foods", label: "美食", icon: "🍴", color: "#FFC107" },
];

export function cityCoord(city: string): { lng: number; lat: number } {
  const d = DESTINATIONS.find(
    (x) => city.includes(x.name) || x.name.includes(city),
  );
  return d ? { lng: d.lng, lat: d.lat } : { lng: 116.407, lat: 39.904 };
}

const LOCAL_FOODS: Record<string, string[]> = {
  北京: ["北京烤鸭", "炸酱面", "涮羊肉"],
  上海: ["小笼包", "生煎", "本帮菜"],
  成都: ["火锅", "龙抄手", "担担面"],
  杭州: ["西湖醋鱼", "东坡肉", "片儿川"],
  西安: ["肉夹馍", "羊肉泡馍", "凉皮"],
  厦门: ["沙茶面", "土笋冻", "海蛎煎"],
  三亚: ["海鲜", "清补凉", "椰子鸡"],
  大理: ["乳扇", "饵丝", "酸辣鱼"],
};

/** 本地精选：热门城市秒开预览，不等待网络 */
export function buildLocalCityPreview(city: string): CityInfo | null {
  const c = (city || "").trim();
  if (!c) return null;

  const spotNames = landmarksFor(c).slice(0, 4);
  if (!spotNames.length) return null;

  let foodNames: string[] = [];
  for (const [key, names] of Object.entries(LOCAL_FOODS)) {
    if (c.includes(key) || key.includes(c)) {
      foodNames = names;
      break;
    }
  }
  if (!foodNames.length) {
    foodNames = ["当地特色菜", "网红小吃", "老字号"];
  }

  return {
    city: c,
    spots: spotNames.map((name) => ({ name, desc: `${c}热门必去` })),
    foods: foodNames.slice(0, 3).map((name) => ({
      name,
      desc: "本地特色美食",
    })),
  };
}

export function itemCoord(
  base: { lng: number; lat: number },
  name: string,
  index: number,
): { lng: number; lat: number } {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const angle = ((hash + index * 37) % 360) * (Math.PI / 180);
  const dist = 0.015 + (hash % 8) * 0.004;
  return {
    lng: base.lng + Math.cos(angle) * dist,
    lat: base.lat + Math.sin(angle) * dist * 0.75,
  };
}

/** 根据名称生成稳定的「万人规划」数字 */
export function fakePopularity(name: string): string {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const n = ((hash % 890) + 110) / 100;
  return `${n.toFixed(2)}万人规划`;
}

export function cityIntro(city: string, spotDescs: string[]): string {
  const hint =
    spotDescs.length > 0
      ? spotDescs[0].slice(0, 60)
      : "这里有独特的风土人情等待探索";
  return `${city}，${hint}。根据用户真实出行数据，为你精选以下热门目的地。`;
}

export type ReviewPoint = { label: string; text: string };

const POSITIVE_LABELS = ["体验不错", "值得打卡", "口碑很好", "推荐前往"];
const NEUTRAL_LABELS = ["温馨提示", "注意事项", "小幅不足", "可以更好"];

/** 将描述拆成带标题的评价要点，用于真实评价卡片 */
export function splitReviewPoints(
  desc: string,
  category: ExploreCategory,
): { positive: ReviewPoint[]; neutral: ReviewPoint[] } {
  const parts = desc
    .split(/[，。；、]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  const toPoint = (text: string, labels: string[], i: number): ReviewPoint => {
    const short = text.length > 8 ? `${text.slice(0, 6)}…` : text;
    const label = category === "foods" ? `${short}：` : `${labels[i % labels.length]}：`;
    return { label, text };
  };

  if (parts.length >= 2) {
    const mid = Math.ceil(parts.length / 2);
    return {
      positive: parts.slice(0, mid).map((t, i) => toPoint(t, POSITIVE_LABELS, i)),
      neutral: parts.slice(mid).map((t, i) => toPoint(t, NEUTRAL_LABELS, i)),
    };
  }

  const fallback = parts[0] || (category === "foods" ? "本地特色鲜明" : "值得一游");
  return {
    positive: [{ label: "亮点：", text: fallback }],
    neutral: [{ label: "提示：", text: "建议错峰前往，体验更佳" }],
  };
}

export function splitHighlights(desc: string): { positive: string[]; neutral: string[] } {
  const { positive, neutral } = splitReviewPoints(desc, "spots");
  return {
    positive: positive.map((p) => p.text),
    neutral: neutral.map((p) => p.text),
  };
}

/** 拼接展示地址（优先 API 返回的真实地址） */
export function formatPoiAddress(
  city: string,
  name: string,
  address?: string,
): string {
  const addr = (address || "").trim();
  if (addr) return addr;
  return `${city} · ${name}`;
}

/** 分类级小红书搜索词（与后端 xiaohongshu_client 对齐） */
export function xhsCategoryKeyword(city: string, category: ExploreCategory): string {
  const dest = city.trim() || "旅游";
  return category === "foods" ? `${dest} 美食推荐` : `${dest} 必去景点`;
}

/** 单个 POI 的小红书搜索词 */
export function xhsItemKeyword(
  city: string,
  name: string,
  category: ExploreCategory,
): string {
  const dest = city.trim() || "旅游";
  const poi = name.trim();
  return category === "foods" ? `${dest} ${poi}` : `${dest} ${poi} 攻略`;
}

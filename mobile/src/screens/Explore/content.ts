import type { ImageSourcePropType } from "react-native";
import { accentPastels, pastels } from "../../theme";

const SLIDES: Array<{
  title: string;
  sub: string;
  dest: string;
}> = [
  {
    title: "长城秋色，城阙连云",
    sub: "登高望远，把京华秋意装进视野",
    dest: "北京",
  },
  {
    title: "外滩灯火，浦江夜色",
    sub: "摩天轮下看魔都心跳",
    dest: "上海",
  },
  {
    title: "西湖烟雨，茶香入梦",
    sub: "环湖慢行，把雷峰夕照留给傍晚",
    dest: "杭州",
  },
  {
    title: "椰风浪暖，天涯海角",
    sub: "把冬天留给阳光与沙滩",
    dest: "三亚",
  },
  {
    title: "苍山洱海，风花雪月",
    sub: "骑行海东，在古城巷口遇见慢时光",
    dest: "大理",
  },
];

const DESTINATIONS: Array<{
  name: string;
  desc: string;
  /** 用于拉取高德封面图的代表景点 */
  landmark: string;
  lng: number;
  lat: number;
}> = [
  {
    name: "北京",
    desc: "故宫长城 · 皇城根下",
    landmark: "故宫博物院",
    lng: 116.407,
    lat: 39.904,
  },
  {
    name: "成都",
    desc: "熊猫火锅 · 慢生活",
    landmark: "大熊猫繁育研究基地",
    lng: 104.066,
    lat: 30.572,
  },
  {
    name: "杭州",
    desc: "西湖龙井 · 江南烟雨",
    landmark: "西湖",
    lng: 120.155,
    lat: 30.274,
  },
  {
    name: "大理",
    desc: "风花雪月 · 苍山洱海",
    landmark: "洱海",
    lng: 100.226,
    lat: 25.605,
  },
  {
    name: "西安",
    desc: "兵马俑 · 古城墙",
    landmark: "秦始皇兵马俑博物馆",
    lng: 108.94,
    lat: 34.341,
  },
  {
    name: "厦门",
    desc: "鼓浪屿 · 海边慢行",
    landmark: "鼓浪屿",
    lng: 118.089,
    lat: 24.479,
  },
  {
    name: "上海",
    desc: "外滩夜景 · 魔都节奏",
    landmark: "外滩",
    lng: 121.473,
    lat: 31.23,
  },
  {
    name: "三亚",
    desc: "热带海岛 · 阳光沙滩",
    landmark: "亚龙湾",
    lng: 109.508,
    lat: 18.247,
  },
];

const INTERESTS = [
  { label: "美食", tag: "美食" },
  { label: "人文", tag: "人文历史" },
  { label: "自然", tag: "自然风光" },
  { label: "亲子", tag: "亲子" },
  { label: "摄影", tag: "摄影" },
  { label: "购物", tag: "购物" },
];

const CARD_COLORS = pastels;
const SHORTCUT_COLORS = accentPastels;

export { SLIDES, DESTINATIONS, INTERESTS, CARD_COLORS, SHORTCUT_COLORS };

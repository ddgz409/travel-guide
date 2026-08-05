import type { ImageSourcePropType } from "react-native";
import { accentPastels, pastels } from "../../theme";

const SLIDES: Array<{
  title: string;
  sub: string;
  dest: string;
  img: ImageSourcePropType;
}> = [
  {
    title: "长城秋色，城阙连云",
    sub: "登高望远，把京华秋意装进视野",
    dest: "北京",
    img: require("../../../assets/covers/beijing_anime.png"),
  },
  {
    title: "外滩灯火，浦江夜色",
    sub: "摩天轮下看魔都心跳",
    dest: "上海",
    img: require("../../../assets/covers/shanghai_anime.png"),
  },
  {
    title: "西湖烟雨，茶香入梦",
    sub: "环湖慢行，把雷峰夕照留给傍晚",
    dest: "杭州",
    img: require("../../../assets/covers/hangzhou_anime.png"),
  },
  {
    title: "椰风浪暖，天涯海角",
    sub: "把冬天留给阳光与沙滩",
    dest: "三亚",
    img: require("../../../assets/covers/sanya_anime.png"),
  },
  {
    title: "苍山洱海，风花雪月",
    sub: "骑行海东，在古城巷口遇见慢时光",
    dest: "大理",
    img: require("../../../assets/covers/dali_anime.png"),
  },
];

const DESTINATIONS: Array<{
  name: string;
  desc: string;
  img: ImageSourcePropType;
}> = [
  {
    name: "北京",
    desc: "故宫长城 · 皇城根下",
    img: require("../../../assets/covers/beijing_anime.png"),
  },
  {
    name: "成都",
    desc: "熊猫火锅 · 慢生活",
    img: require("../../../assets/covers/chengdu.jpg"),
  },
  {
    name: "杭州",
    desc: "西湖龙井 · 江南烟雨",
    img: require("../../../assets/covers/hangzhou_anime.png"),
  },
  {
    name: "大理",
    desc: "风花雪月 · 苍山洱海",
    img: require("../../../assets/covers/dali_anime.png"),
  },
  {
    name: "西安",
    desc: "兵马俑 · 古城墙",
    img: require("../../../assets/covers/xian.jpg"),
  },
  {
    name: "厦门",
    desc: "鼓浪屿 · 海边慢行",
    img: require("../../../assets/covers/xiamen.jpg"),
  },
  {
    name: "上海",
    desc: "外滩夜景 · 魔都节奏",
    img: require("../../../assets/covers/shanghai_anime.png"),
  },
  {
    name: "三亚",
    desc: "热带海岛 · 阳光沙滩",
    img: require("../../../assets/covers/sanya_anime.png"),
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

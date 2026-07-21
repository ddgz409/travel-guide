/** 行程/首页封面：本地 /covers（高德国内图床）。按城市隔离，禁止跨城错配。 */

export const CITY_COVERS: Record<string, string> = {
  北京: "/covers/beijing_hero.jpg",
  上海: "/covers/shanghai_bund.jpg",
  杭州: "/covers/westlake.jpg",
  成都: "/covers/chengdu.jpg",
  西安: "/covers/xian.jpg",
  大理: "/covers/dali.jpg",
  厦门: "/covers/xiamen.jpg",
  三亚: "/covers/sanya.jpg",
  洛阳: "/covers/luoyang.jpg",
  泉州: "/covers/quanzhou.jpg",
  苏州: "/covers/suzhou.jpg",
  南京: "/covers/nanjing.jpg",
  重庆: "/covers/chongqing.jpg",
  广州: "/covers/guangzhou.jpg",
  黄山: "/covers/nature.jpg",
  腾冲: "/covers/onsen.jpg",
  晋中: "/covers/note_jinzhong.jpg",
  平遥: "/covers/note_jinzhong.jpg",
};

/** 三条路线卡片：同城不同主题，绝不串到别的城市 */
const CITY_ROUTE_COVERS: Record<
  string,
  { classic: string; culture: string; food: string }
> = {
  北京: {
    classic: "/covers/gugong.jpg",
    culture: "/covers/hutong.jpg",
    food: "/covers/meal1.jpg",
  },
  上海: {
    classic: "/covers/shanghai_bund.jpg",
    culture: "/covers/yuyuan.jpg",
    food: "/covers/meal3.jpg",
  },
  杭州: {
    classic: "/covers/westlake.jpg",
    culture: "/covers/hangzhou_hefang.jpg",
    food: "/covers/hangzhou_food.jpg",
  },
  成都: {
    classic: "/covers/chengdu.jpg",
    culture: "/covers/kuanzhai.jpg",
    food: "/covers/meal2.jpg",
  },
  西安: {
    classic: "/covers/xian.jpg",
    culture: "/covers/xian_wall.jpg",
    food: "/covers/meal1.jpg",
  },
  大理: {
    classic: "/covers/dali.jpg",
    culture: "/covers/generic_lake.jpg",
    food: "/covers/meal2.jpg",
  },
  厦门: {
    classic: "/covers/xiamen.jpg",
    culture: "/covers/xiamen.jpg",
    food: "/covers/meal3.jpg",
  },
  三亚: {
    classic: "/covers/sanya.jpg",
    culture: "/covers/sanya.jpg",
    food: "/covers/meal2.jpg",
  },
  洛阳: {
    classic: "/covers/luoyang.jpg",
    culture: "/covers/luoyang.jpg",
    food: "/covers/meal1.jpg",
  },
  泉州: {
    classic: "/covers/quanzhou.jpg",
    culture: "/covers/quanzhou.jpg",
    food: "/covers/meal3.jpg",
  },
};

/**
 * 地标关键词 → 封面。每条绑定所属城市；匹配时必须与当前目的地同城，
 * 避免「杭州亮点」因哈希落到上海/北京图。
 */
const CITY_LANDMARK_COVERS: Record<string, [string, string][]> = {
  北京: [
    ["故宫博物院", "/covers/gugong.jpg"],
    ["故宫", "/covers/gugong.jpg"],
    ["天安门", "/covers/tiananmen.jpg"],
    ["八达岭", "/covers/greatwall.jpg"],
    ["慕田峪", "/covers/greatwall.jpg"],
    ["长城", "/covers/greatwall.jpg"],
    ["颐和园", "/covers/summerpalace.jpg"],
    ["天坛", "/covers/tiantan.jpg"],
    ["北海公园", "/covers/beihai.jpg"],
    ["景山", "/covers/jingshan.jpg"],
    ["南锣鼓巷", "/covers/hutong.jpg"],
    ["什刹海", "/covers/hutong.jpg"],
    ["胡同", "/covers/hutong.jpg"],
    ["雍和宫", "/covers/gugong.jpg"],
  ],
  上海: [
    ["外滩", "/covers/shanghai_bund.jpg"],
    ["东方明珠", "/covers/shanghai_bund.jpg"],
    ["陆家嘴", "/covers/shanghai_bund.jpg"],
    ["豫园", "/covers/yuyuan.jpg"],
    ["南京路", "/covers/shanghai_bund.jpg"],
    ["田子坊", "/covers/yuyuan.jpg"],
    ["迪士尼", "/covers/shanghai_bund.jpg"],
  ],
  杭州: [
    ["西湖", "/covers/westlake.jpg"],
    ["断桥", "/covers/westlake.jpg"],
    ["雷峰塔", "/covers/westlake.jpg"],
    ["柳浪闻莺", "/covers/westlake.jpg"],
    ["三潭", "/covers/westlake.jpg"],
    ["灵隐", "/covers/hangzhou_lingyin.jpg"],
    ["西溪", "/covers/westlake.jpg"],
    ["河坊", "/covers/hangzhou_hefang.jpg"],
    ["清河坊", "/covers/hangzhou_hefang.jpg"],
    ["胡雪岩", "/covers/hangzhou_hefang.jpg"],
    ["吴山", "/covers/hangzhou_hefang.jpg"],
    ["城隍阁", "/covers/hangzhou_hefang.jpg"],
    ["龙井", "/covers/westlake.jpg"],
    ["钱塘", "/covers/hangzhou_hero.jpg"],
    ["钱江", "/covers/hangzhou_hero.jpg"],
    ["华家池", "/covers/westlake.jpg"],
  ],
  成都: [
    ["宽窄巷子", "/covers/kuanzhai.jpg"],
    ["宽窄", "/covers/kuanzhai.jpg"],
    ["熊猫", "/covers/chengdu.jpg"],
    ["大熊猫", "/covers/chengdu.jpg"],
    ["锦里", "/covers/kuanzhai.jpg"],
    ["武侯祠", "/covers/chengdu.jpg"],
    ["杜甫草堂", "/covers/chengdu.jpg"],
    ["春熙路", "/covers/kuanzhai.jpg"],
    ["都江堰", "/covers/chengdu.jpg"],
  ],
  西安: [
    ["兵马俑", "/covers/xian.jpg"],
    ["大雁塔", "/covers/xian.jpg"],
    ["城墙", "/covers/xian_wall.jpg"],
    ["钟楼", "/covers/xian_wall.jpg"],
    ["回民街", "/covers/xian_wall.jpg"],
    ["大唐不夜城", "/covers/xian.jpg"],
    ["华清", "/covers/xian.jpg"],
  ],
  大理: [
    ["洱海", "/covers/generic_lake.jpg"],
    ["苍山", "/covers/dali.jpg"],
    ["大理古城", "/covers/dali.jpg"],
    ["双廊", "/covers/generic_lake.jpg"],
    ["喜洲", "/covers/dali.jpg"],
    ["三塔", "/covers/dali.jpg"],
  ],
  厦门: [
    ["鼓浪屿", "/covers/xiamen.jpg"],
    ["曾厝垵", "/covers/xiamen.jpg"],
    ["南普陀", "/covers/xiamen.jpg"],
    ["环岛路", "/covers/xiamen.jpg"],
  ],
  三亚: [
    ["亚龙湾", "/covers/sanya.jpg"],
    ["天涯海角", "/covers/sanya.jpg"],
    ["蜈支洲", "/covers/sanya.jpg"],
    ["大东海", "/covers/sanya.jpg"],
  ],
  洛阳: [
    ["龙门", "/covers/luoyang.jpg"],
    ["白马寺", "/covers/luoyang.jpg"],
    ["牡丹", "/covers/luoyang.jpg"],
  ],
  泉州: [
    ["开元寺", "/covers/quanzhou.jpg"],
    ["清源山", "/covers/quanzhou.jpg"],
    ["洛阳桥", "/covers/quanzhou.jpg"],
  ],
};

const MEAL_COVERS = [
  "/covers/meal1.jpg",
  "/covers/meal2.jpg",
  "/covers/meal3.jpg",
];

const HOTEL_COVERS = ["/covers/hotel1.jpg", "/covers/hotel2.jpg"];

/** 无目的地时的中性图（非可识别跨城地标） */
const NEUTRAL_FALLBACK = "/covers/nature.jpg";

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** 从「杭州市」「杭州三日游」等字符串解析城市键 */
export function resolveCityKey(dest: string): string | null {
  const d = (dest || "").trim();
  if (!d) return null;
  // 长名优先，避免短词误伤
  const keys = Object.keys(CITY_COVERS).sort((a, b) => b.length - a.length);
  for (const city of keys) {
    if (d.includes(city)) return city;
  }
  return null;
}

function landmarkCoverFor(name: string, city: string | null): string | null {
  if (!name) return null;
  if (city && CITY_LANDMARK_COVERS[city]) {
    for (const [key, url] of CITY_LANDMARK_COVERS[city]) {
      if (name.includes(key)) return url;
    }
    return null;
  }
  // 无城市时：仅当关键词在全局唯一城市出现才用，避免串城
  const hits: string[] = [];
  for (const [c, pairs] of Object.entries(CITY_LANDMARK_COVERS)) {
    for (const [key, url] of pairs) {
      if (name.includes(key)) hits.push(url);
    }
  }
  const unique = [...new Set(hits)];
  return unique.length === 1 ? unique[0] : null;
}

export function heroForDestination(dest: string): string {
  const city = resolveCityKey(dest);
  if (city) return CITY_COVERS[city];
  return NEUTRAL_FALLBACK;
}

export function coverForCity(dest: string): string {
  return heroForDestination(dest);
}

/**
 * 景点/餐饮/酒店条目封面。
 * @param city 行程目的地（强烈建议传入，避免跨城错图）
 */
export function coverForItem(name: string, type: string, city?: string): string {
  const cityKey = resolveCityKey(city || "") || resolveCityKey(name);

  if (type === "meal") {
    return MEAL_COVERS[hash(name || "meal") % MEAL_COVERS.length];
  }
  if (type === "hotel") {
    return HOTEL_COVERS[hash(name || "hotel") % HOTEL_COVERS.length];
  }

  const hit = landmarkCoverFor(name, cityKey);
  if (hit) return hit;

  if (cityKey && CITY_COVERS[cityKey]) {
    // 同城变体：用路线主题图池，避免落到上海/北京通用错图
    const route = CITY_ROUTE_COVERS[cityKey];
    if (route) {
      const pool = [CITY_COVERS[cityKey], route.classic, route.culture];
      return pool[hash(name || cityKey) % pool.length];
    }
    return CITY_COVERS[cityKey];
  }

  return NEUTRAL_FALLBACK;
}

/**
 * 三条「当地玩法」路线卡片封面：严格绑定目的地 + 主题。
 */
export function coverForRoute(
  destination: string,
  theme?: string | null,
  highlights?: string[] | null,
): string {
  const city = resolveCityKey(destination);
  const themeKey = normalizeTheme(theme);

  // 美食线固定用同城美食图，避免亮点里的湖景把三张卡片都变成西湖
  if (themeKey !== "food" && highlights?.length) {
    for (const h of highlights) {
      const hit = landmarkCoverFor(h, city);
      if (hit) return hit;
    }
  }

  if (city && CITY_ROUTE_COVERS[city]) {
    return CITY_ROUTE_COVERS[city][themeKey];
  }
  if (city && CITY_COVERS[city]) return CITY_COVERS[city];
  return NEUTRAL_FALLBACK;
}

function normalizeTheme(theme?: string | null): "classic" | "culture" | "food" {
  const t = theme || "";
  if (/美食|吃|food/i.test(t)) return "food";
  if (/人文|文化|慢游|culture/i.test(t)) return "culture";
  return "classic";
}

/** 校验用：每张业务封面应归属的城市（错配审计） */
export const COVER_CITY_OWNERSHIP: Record<string, string> = {
  "/covers/beijing_hero.jpg": "北京",
  "/covers/gugong.jpg": "北京",
  "/covers/greatwall.jpg": "北京",
  "/covers/tiananmen.jpg": "北京",
  "/covers/summerpalace.jpg": "北京",
  "/covers/tiantan.jpg": "北京",
  "/covers/beihai.jpg": "北京",
  "/covers/jingshan.jpg": "北京",
  "/covers/hutong.jpg": "北京",
  "/covers/shanghai_bund.jpg": "上海",
  "/covers/yuyuan.jpg": "上海",
  "/covers/westlake.jpg": "杭州",
  "/covers/hangzhou_hero.jpg": "杭州",
  "/covers/hangzhou_hefang.jpg": "杭州",
  "/covers/hangzhou_lingyin.jpg": "杭州",
  "/covers/hangzhou_food.jpg": "杭州",
  "/covers/chengdu.jpg": "成都",
  "/covers/kuanzhai.jpg": "成都",
  "/covers/xian.jpg": "西安",
  "/covers/xian_wall.jpg": "西安",
  "/covers/dali.jpg": "大理",
  "/covers/generic_lake.jpg": "大理",
  "/covers/xiamen.jpg": "厦门",
  "/covers/sanya.jpg": "三亚",
  "/covers/luoyang.jpg": "洛阳",
  "/covers/quanzhou.jpg": "泉州",
  "/covers/nature.jpg": "黄山",
  "/covers/onsen.jpg": "腾冲",
  "/covers/note_jinzhong.jpg": "晋中",
  "/covers/cta_travel.jpg": "黄山",
};

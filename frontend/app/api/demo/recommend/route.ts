import { NextRequest, NextResponse } from "next/server";

/** 免费、免 Key 的推荐数据源（demo 用）；外网失败时本地兜底，保证页面可用 */
type DemoRecommend = {
  city: string;
  summary: string;
  wikiUrl: string | null;
  thumbnail: string | null;
  weather: {
    tempC: string;
    desc: string;
    humidity: string;
  } | null;
  tips: string[];
  source: string[];
};

const LOCAL: Record<
  string,
  { summary: string; tips: string[]; thumb: string }
> = {
  北京: {
    summary:
      "北京是中国的首都，拥有故宫、长城、颐和园等世界级文化遗产。城市节奏快，适合按片区规划（故宫–景山、什刹海、798、颐和园），并预留地铁换乘时间。",
    tips: [
      "故宫建议提前预约，上午入场更轻松",
      "长城可按体力选八达岭或慕田峪",
      "老城与新城分开安排，减少跨城奔波",
    ],
    thumb: "/covers/beijing_hero.jpg",
  },
  成都: {
    summary:
      "成都以慢生活与美食闻名，大熊猫基地、宽窄巷子、锦里与周边青城山/都江堰是经典组合。行程宜松弛，把火锅、串串与茶馆穿插在景点之间。",
    tips: [
      "熊猫基地建议早去，动物更活跃",
      "市区与近郊（都江堰）可分两天",
      "夜宵与火锅可单独留出一晚",
    ],
    thumb: "/covers/chengdu.jpg",
  },
  杭州: {
    summary:
      "杭州以西湖为核心，雷峰塔、苏堤、灵隐与河坊街构成经典一日至三日游。适合步行与骑行环湖，傍晚可看雷峰夕照或夜游西湖。",
    tips: [
      "环湖景点可步行串联，少坐车",
      "灵隐寺周末人多，尽量错峰",
      "预留半天去茶园或宋城视兴趣而定",
    ],
    thumb: "/covers/westlake.jpg",
  },
  大理: {
    summary:
      "大理古城、洱海与苍山是核心体验。适合慢节奏：骑行海东、双廊看景、古城逛逛。行程不必排太满，留白看云与日落。",
    tips: [
      "洱海骑行选一段即可，不必环湖硬骑",
      "古城夜晚更有氛围",
      "苍山索道视天气与体力决定",
    ],
    thumb: "/covers/dali.jpg",
  },
  厦门: {
    summary:
      "厦门以鼓浪屿、中山路、环岛路和沙坡尾为代表。海岛气质明显，适合半天海岛 + 半天市区的搭配，注意轮渡与步行节奏。",
    tips: [
      "鼓浪屿建议留足步行时间",
      "环岛路傍晚骑行或观光车更舒服",
      "海鲜排挡可集中安排一餐",
    ],
    thumb: "/covers/xiamen.jpg",
  },
  西安: {
    summary:
      "西安是十三朝古都，兵马俑、古城墙、大雁塔与回民街构成经典路线。历史密度高，建议按「城内一天 + 兵马俑一天」拆分。",
    tips: [
      "兵马俑建议单独一天往返",
      "城墙骑行选清晨或黄昏",
      "回民街可作晚餐动线，别全天泡着",
    ],
    thumb: "/covers/xian.jpg",
  },
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function wikiSummary(city: string) {
  try {
    const url = `https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city)}`;
    const res = await withTimeout(
      fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "TravelGuideDemo/1.0 (demo; contact: local)",
        },
        cache: "no-store",
      }),
      6000,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      summary: (data.extract as string) || "",
      wikiUrl: (data.content_urls?.desktop?.page as string) || null,
      thumbnail:
        (data.thumbnail?.source as string) ||
        (data.originalimage?.source as string) ||
        null,
      live: true as const,
    };
  } catch {
    return null;
  }
}

async function wttrWeather(city: string) {
  try {
    const res = await withTimeout(
      fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`, {
        headers: { "User-Agent": "TravelGuideDemo/1.0" },
        cache: "no-store",
      }),
      6000,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const cur = data?.current_condition?.[0];
    if (!cur) return null;
    const desc =
      cur.lang_zh?.[0]?.value || cur.weatherDesc?.[0]?.value || "—";
    return {
      tempC: String(cur.temp_C ?? "—"),
      desc: String(desc),
      humidity: String(cur.humidity ?? "—"),
      live: true as const,
    };
  } catch {
    return null;
  }
}

function localTips(city: string, weatherDesc: string | null): string[] {
  const base =
    LOCAL[city]?.tips ||
    [
      `${city}建议优先安排核心景点，避免跨城奔波`,
      "午后预留机动时间，方便临时加店或休息",
      "热门景点尽量早上入场，避开人流高峰",
    ];
  const tips = [...base];
  if (weatherDesc?.includes("雨")) {
    tips.unshift("近期有雨：备伞，多安排室内馆藏或咖啡馆");
  } else if (weatherDesc?.includes("晴")) {
    tips.unshift("天气晴好：适合户外与观景摄影");
  }
  return tips.slice(0, 4);
}

export async function GET(req: NextRequest) {
  const city = (req.nextUrl.searchParams.get("city") || "北京").trim();
  if (!city || city.length > 32) {
    return NextResponse.json({ error: "invalid city" }, { status: 400 });
  }

  const [wiki, weather] = await Promise.all([
    wikiSummary(city),
    wttrWeather(city),
  ]);

  const local = LOCAL[city];
  const source: string[] = [];
  if (wiki?.live) source.push("Wikipedia REST（免 Key）");
  else source.push("本地知识库兜底");
  if (weather?.live) source.push("wttr.in 天气（免 Key）");
  else source.push("天气暂不可用（网络受限时自动降级）");

  const payload: DemoRecommend = {
    city,
    summary:
      wiki?.summary ||
      local?.summary ||
      `${city}是热门旅行目的地，可结合兴趣定制行程。`,
    wikiUrl: wiki?.wikiUrl || null,
    thumbnail: wiki?.thumbnail || local?.thumb || null,
    weather: weather
      ? {
          tempC: weather.tempC,
          desc: weather.desc,
          humidity: weather.humidity,
        }
      : null,
    tips: localTips(city, weather?.desc || null),
    source,
  };

  return NextResponse.json(payload);
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  type FormEvent,
  type KeyboardEvent,
  Suspense,
} from "react";

import { tripsApi } from "@/lib/api";
import type { PoiSearchResult, QuickRecommendCard } from "@/lib/types";
import { coverForCity } from "@/lib/cover";
import { LANDMARKS, landmarksFor, searchHintExamples } from "@/lib/landmarks";
import { useAuthStore } from "@/stores/auth";

type GenMode = "quick" | "custom";

/** 从搜索结果中选出与芯片名称真正匹配的 POI，绝不回退到无关热门第一项。 */
function pickBestLandmarkMatch(
  results: PoiSearchResult[],
  name: string,
): PoiSearchResult | null {
  if (!results.length) return null;
  const kw = name.trim();
  const core = kw
    .replace(/博物院|博物馆|风景名胜区|风景区|公园|广场|古镇|古城/g, "")
    .trim();

  const scored = results.map((p) => {
    const n = p.name || "";
    let score = 0;
    if (n === kw) score = 1000;
    else if (n.startsWith(kw) || kw.startsWith(n)) score = 900;
    else if (n.includes(kw)) score = 800;
    else if (kw.includes(n) && n.length >= 2) score = 700;
    else if (core.length >= 2 && n.includes(core)) score = 650;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0].p : null;
}

const INTEREST_OPTIONS = [
  { id: "文化", icon: "🏛" },
  { id: "美食", icon: "🍜" },
  { id: "购物", icon: "🛍" },
  { id: "自然", icon: "🏞" },
  { id: "历史", icon: "📜" },
  { id: "夜生活", icon: "🌙" },
  { id: "亲子", icon: "👨‍👩‍👧" },
  { id: "艺术", icon: "🎨" },
  { id: "运动", icon: "🏃" },
];

const BUDGET_LEVELS = [
  { id: "经济", desc: "性价比优先" },
  { id: "中等", desc: "舒适平衡" },
  { id: "豪华", desc: "体验优先" },
];

const TRANSPORTS = [
  { id: "公共交通", icon: "🚇" },
  { id: "自驾", icon: "🚗" },
  { id: "步行", icon: "🚶" },
  { id: "混合", icon: "🔀" },
];

const QUICK_CITIES = ["北京", "成都", "杭州", "大理", "西安", "厦门", "上海", "三亚"];

function coverFor(dest: string) {
  return coverForCity(dest);
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function plusDaysISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

export default function GeneratePage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-[var(--muted)]">
          加载中…
        </div>
      }
    >
      <GenerateContent />
    </Suspense>
  );
}

function GenerateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const [genMode, setGenMode] = useState<GenMode>("quick");
  const [destination, setDestination] = useState(searchParams.get("dest") || "");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(plusDaysISO(2));
  const [travelers, setTravelers] = useState(2);
  const [interests, setInterests] = useState<string[]>(["文化", "美食"]);
  const [budgetLevel, setBudgetLevel] = useState("中等");
  const [transport, setTransport] = useState("公共交通");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quickCards, setQuickCards] = useState<QuickRecommendCard[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PoiSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [mustInclude, setMustInclude] = useState<PoiSearchResult[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);

  const daysCount = useMemo(() => {
    if (!startDate || !endDate || endDate < startDate) return 0;
    const a = new Date(startDate).getTime();
    const b = new Date(endDate).getTime();
    return Math.floor((b - a) / 86400000) + 1;
  }, [startDate, endDate]);

  const localLandmarks = useMemo(
    () => landmarksFor(destination).slice(0, 8),
    [destination],
  );
  const hintExamples = useMemo(
    () => searchHintExamples(destination),
    [destination],
  );
  const landmarkCityKey = useMemo(() => {
    const dest = destination.trim();
    if (!dest) return "";
    for (const city of Object.keys(LANDMARKS)) {
      if (dest.includes(city) || city.includes(dest)) return city;
    }
    return dest;
  }, [destination]);

  useEffect(() => {
    setMustInclude([]);
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
  }, [landmarkCityKey]);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setSearchResults([]);
        setShowResults(false);
        return;
      }
      if (!destination.trim()) {
        setError("请先选择或填写目的地，再搜索当地景点");
        setSearchResults([]);
        setShowResults(false);
        return;
      }
      setSearching(true);
      setError(null);
      try {
        const results = await tripsApi.searchPois(q.trim(), destination.trim(), 8);
        setSearchResults(results);
        setShowResults(true);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [destination],
  );

  const handleSearchInput = (val: string) => {
    setSearchQuery(val);
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => doSearch(val), 400);
  };

  const handleSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (_debounceTimer) clearTimeout(_debounceTimer);
      doSearch(searchQuery);
    }
  };

  const addMustInclude = (poi: PoiSearchResult) => {
    if (!mustInclude.find((m) => m.poi_id === poi.poi_id)) {
      setMustInclude((prev) => [...prev, poi]);
    }
    setShowResults(false);
    setSearchQuery("");
  };

  const pickSuggestedLandmark = async (name: string) => {
    if (!destination.trim()) {
      setError("请先选择目的地");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      // 多取结果并严格按名称匹配：高德常把天坛等热门公园排在「故宫」前面
      const results = await tripsApi.searchPois(name, destination.trim(), 10);
      const hit = pickBestLandmarkMatch(results, name);
      if (hit) addMustInclude(hit);
      else setError(`未在${destination}找到「${name}」，请换个关键词试试`);
    } catch {
      setError("搜索失败，请稍后重试");
    } finally {
      setSearching(false);
    }
  };

  const removeMustInclude = (poiId: string) => {
    setMustInclude((prev) => prev.filter((m) => m.poi_id !== poiId));
  };

  const toggleInterest = (v: string) => {
    setInterests((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  };

  const handleQuickRecommend = async () => {
    setError(null);
    if (!destination.trim()) return setError("请输入目的地");
    setSubmitting(true);
    setQuickCards([]);
    try {
      const res = await tripsApi.quickRecommend(destination.trim());
      setQuickCards(res.cards || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取推荐失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!destination.trim()) return setError("请输入目的地");
    if (!startDate || !endDate) return setError("请选择日期");
    if (endDate < startDate) return setError("结束日期不能早于开始日期");

    setSubmitting(true);
    try {
      const payload = {
        destination: destination.trim(),
        start_date: startDate,
        end_date: endDate,
        travelers,
        preferences: { interests, budget_level: budgetLevel, transport },
        must_include: mustInclude.length > 0 ? mustInclude : undefined,
      };
      const { user: u } = useAuthStore.getState();
      const trip = u
        ? await tripsApi.generate(payload)
        : await tripsApi.guestGenerate(payload);
      router.push(`/trips/${trip.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const cover = coverFor(destination || "北京");

  return (
    <div className="flex-1 pb-28 lg:pb-10">
      {/* 目的地头图 */}
      <section className="relative h-[220px] sm:h-[260px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--ink)]/80 via-[var(--ink)]/40 to-[var(--ink)]/20" />
        <div className="relative site-container h-full flex flex-col justify-end pb-7 text-white">
          <div className="text-[12px] text-white/70 mb-2">
            <Link href="/" className="hover:text-white">
              首页
            </Link>
            <span className="mx-1.5">/</span>
            <span>行程入口</span>
          </div>
          <h1 className="font-display text-[30px] sm:text-[36px] font-semibold leading-none">
            {destination.trim() || "去哪儿玩？"}
          </h1>
          <p className="text-white/80 text-[14px] mt-2">
            {genMode === "quick"
              ? "快速模式：秒出小红书与携程参考链接"
              : "专属定制：填好信息，AI 生成可落地的每日行程"}
          </p>
        </div>
      </section>

      <div className="site-container -mt-6 relative z-10">
        <div className="grid grid-cols-2 gap-3 mb-5">
          <button
            type="button"
            onClick={() => {
              setGenMode("quick");
              setError(null);
            }}
            className={`rounded-2xl border p-4 text-left transition-colors ${
              genMode === "quick"
                ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                : "border-[var(--line)] bg-white"
            }`}
          >
            <div className="font-semibold text-[16px] text-[var(--ink)]">快速模式</div>
            <p className="text-[12px] text-[var(--muted)] mt-1 leading-relaxed">
              不调用模型，立刻给出两套参考入口
            </p>
          </button>
          <button
            type="button"
            onClick={() => {
              setGenMode("custom");
              setError(null);
            }}
            className={`rounded-2xl border p-4 text-left transition-colors ${
              genMode === "custom"
                ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                : "border-[var(--line)] bg-white"
            }`}
          >
            <div className="font-semibold text-[16px] text-[var(--ink)]">专属定制</div>
            <p className="text-[12px] text-[var(--muted)] mt-1 leading-relaxed">
              AI 生成每日行程、酒店与路线
            </p>
          </button>
        </div>

        {/* 目的地 +（专属定制时）日期人数 */}
        <div className="bg-white rounded-2xl border border-[var(--line)] shadow-[var(--shadow)] p-4 sm:p-5 mb-5">
          <div
            className={`grid grid-cols-1 gap-3 sm:gap-4 items-end ${
              genMode === "custom"
                ? "sm:grid-cols-[1.2fr_1fr_1fr_auto]"
                : ""
            }`}
          >
            <div>
              <label className="block text-[12px] text-[var(--muted)] mb-1.5">
                目的地
              </label>
              <input
                type="text"
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  setQuickCards([]);
                }}
                placeholder="城市 / 地区"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-3.5 py-3 text-[16px] font-semibold text-[var(--ink)] outline-none focus:border-[var(--brand)] focus:bg-white"
              />
            </div>
            {genMode === "custom" ? (
              <>
                <div>
                  <label className="block text-[12px] text-[var(--muted)] mb-1.5">
                    出发
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-3.5 py-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--brand)] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[12px] text-[var(--muted)] mb-1.5">
                    返程
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-3.5 py-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--brand)] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[12px] text-[var(--muted)] mb-1.5">
                    人数
                  </label>
                  <div className="flex items-center rounded-xl border border-[var(--line)] bg-[var(--background)] h-[50px] px-2">
                    <button
                      type="button"
                      onClick={() => setTravelers((n) => Math.max(1, n - 1))}
                      className="w-9 h-9 rounded-lg hover:bg-white text-lg font-bold text-[var(--ink)]"
                    >
                      −
                    </button>
                    <span className="flex-1 text-center font-bold text-[var(--ink)]">
                      {travelers}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTravelers((n) => Math.min(20, n + 1))}
                      className="w-9 h-9 rounded-lg hover:bg-white text-lg font-bold text-[var(--ink)]"
                    >
                      +
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_CITIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setDestination(c);
                  setQuickCards([]);
                }}
                className={`px-3 py-1 rounded-full text-[12px] border transition-colors ${
                  destination === c
                    ? "bg-[var(--brand)] text-white border-[var(--brand)]"
                    : "bg-white text-[var(--ink)] border-[var(--line)] hover:border-[var(--brand)]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {genMode === "quick" ? (
          <div className="space-y-4">
            {error ? (
              <p className="text-[14px] text-red-600 bg-red-50 rounded-xl px-4 py-3">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleQuickRecommend()}
              className="w-full sm:w-auto min-w-[180px] rounded-xl bg-[var(--brand)] text-white font-semibold px-6 py-3.5 disabled:opacity-60"
            >
              {submitting ? "加载中…" : "查看参考"}
            </button>
            <div className="grid md:grid-cols-2 gap-4">
              {quickCards.map((card) => (
                <article
                  key={card.id}
                  className="bg-white rounded-2xl border border-[var(--line)] p-5"
                >
                  <h2 className="font-semibold text-[18px] text-[var(--ink)]">
                    {card.title}
                  </h2>
                  {card.tagline ? (
                    <p className="text-[13px] text-[var(--muted)] mt-1">
                      {card.tagline}
                    </p>
                  ) : null}
                  {(
                    [
                      ["小红书", card.external_refs?.xiaohongshu || []],
                      ["携程", card.external_refs?.ctrip || []],
                    ] as const
                  ).map(([label, tips]) =>
                    tips.length ? (
                      <div key={label} className="mt-4">
                        <div className="text-[12px] font-semibold text-[var(--muted)] mb-2">
                          {label}
                        </div>
                        <ul className="space-y-2">
                          {tips.map((t) => (
                            <li key={t.url}>
                              <a
                                href={t.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => {
                                  if (label !== "小红书") return;
                                  const app = t.meta?.app_url;
                                  if (!app) return;
                                  e.preventDefault();
                                  window.location.href = app;
                                  window.setTimeout(() => {
                                    if (document.visibilityState === "visible") {
                                      window.open(t.url, "_blank", "noopener,noreferrer");
                                    }
                                  }, 1200);
                                }}
                                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5 hover:border-[var(--brand)] hover:bg-[var(--brand-soft)]"
                              >
                                <span className="text-[14px] font-medium text-[var(--ink)] truncate">
                                  {t.title}
                                </span>
                                <span className="shrink-0 text-[12px] font-semibold text-[var(--brand)]">
                                  {label === "小红书" ? "App / 网页 →" : "打开 →"}
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null,
                  )}
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {genMode === "custom" ? (
        <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 必去景点 */}
            <section className="bg-white rounded-2xl border border-[var(--line)] p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)] text-[12px] font-bold">
                  1
                </span>
                <h2 className="font-semibold text-[16px] text-[var(--ink)]">
                  必去景点
                </h2>
                <span className="text-[12px] text-[var(--muted)]">可选</span>
              </div>
              <p className="text-[13px] text-[var(--muted)] mb-4 ml-8">
                {destination
                  ? `以下是${destination}当地热门景点，点选或自行搜索`
                  : "先选目的地，再搜该城市当地景点"}
              </p>

              {localLandmarks.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2 ml-0 sm:ml-8">
                  {localLandmarks.map((name) => {
                    const added = mustInclude.some(
                      (m) => m.name.includes(name) || name.includes(m.name),
                    );
                    return (
                      <button
                        key={name}
                        type="button"
                        disabled={added || searching}
                        onClick={() => pickSuggestedLandmark(name)}
                        className={`rounded-full px-3 py-1.5 text-[12px] font-medium border transition-colors ${
                          added
                            ? "bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand)] opacity-70"
                            : "bg-white border-[var(--line)] text-[var(--ink)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
                        }`}
                      >
                        {added ? `✓ ${name}` : `+ ${name}`}
                      </button>
                    );
                  })}
                </div>
              )}

              <div ref={searchRef} className="relative">
                <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 focus-within:border-[var(--brand)] focus-within:bg-white">
                  <span className="text-[var(--muted)] text-[14px]">🔍</span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchInput(e.target.value)}
                    onKeyDown={handleSearchKey}
                    onFocus={() => searchResults.length > 0 && setShowResults(true)}
                    onBlur={() => setTimeout(() => setShowResults(false), 200)}
                    placeholder={
                      destination
                        ? `在${destination}搜景点，如：${hintExamples}`
                        : "先填目的地，再搜当地景点"
                    }
                    className="flex-1 bg-transparent py-3 text-[15px] text-[var(--ink)] outline-none"
                  />
                </div>

                {searching && (
                  <div className="absolute z-30 mt-1 w-full bg-white rounded-xl border border-[var(--line)] shadow-lg p-3 text-sm text-[var(--muted)]">
                    搜索中…
                  </div>
                )}
                {showResults && searchResults.length > 0 && (
                  <div className="absolute z-30 mt-1 w-full bg-white rounded-xl border border-[var(--line)] shadow-lg overflow-hidden max-h-72 overflow-y-auto">
                    {searchResults.map((poi) => {
                      const added = mustInclude.some(
                        (m) => m.poi_id === poi.poi_id,
                      );
                      return (
                        <button
                          key={poi.poi_id}
                          type="button"
                          onClick={() => !added && addMustInclude(poi)}
                          disabled={added}
                          className="w-full text-left px-4 py-3 hover:bg-[var(--brand-soft)] flex items-center justify-between disabled:opacity-40 border-b border-[var(--line)] last:border-0"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-[14px] text-[var(--ink)] truncate">
                              {poi.name}
                            </div>
                            <div className="text-[12px] text-[var(--muted)] truncate">
                              {poi.address}
                            </div>
                          </div>
                          <span className="text-[12px] font-bold text-[var(--brand)] shrink-0 ml-3">
                            {poi.rating
                              ? `★ ${poi.rating}`
                              : added
                                ? "已加"
                                : "+ 添加"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {mustInclude.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {mustInclude.map((poi) => (
                    <span
                      key={poi.poi_id}
                      className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-[var(--brand-soft)] text-[var(--brand-hot)] text-[13px] font-semibold"
                    >
                      {poi.name}
                      <button
                        type="button"
                        onClick={() => removeMustInclude(poi.poi_id)}
                        className="w-5 h-5 rounded-full hover:bg-white/70 text-[12px]"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* 兴趣 */}
            <section className="bg-white rounded-2xl border border-[var(--line)] p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)] text-[12px] font-bold">
                  2
                </span>
                <h2 className="font-semibold text-[16px] text-[var(--ink)]">
                  旅行偏好
                </h2>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {INTEREST_OPTIONS.map((it) => {
                  const on = interests.includes(it.id);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => toggleInterest(it.id)}
                      className={`rounded-xl border px-2 py-3 text-center transition-all ${
                        on
                          ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-hot)]"
                          : "border-[var(--line)] bg-[var(--background)] text-[var(--ink)] hover:border-[var(--brand)]/50"
                      }`}
                    >
                      <div className="text-[18px] mb-1">{it.icon}</div>
                      <div className="text-[12px] font-semibold">{it.id}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 预算 + 交通 */}
            <section className="bg-white rounded-2xl border border-[var(--line)] p-5 sm:p-6 space-y-5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)] text-[12px] font-bold">
                  3
                </span>
                <h2 className="font-semibold text-[16px] text-[var(--ink)]">
                  预算与交通
                </h2>
              </div>

              <div>
                <div className="text-[13px] text-[var(--muted)] mb-2">预算等级</div>
                <div className="grid grid-cols-3 gap-2">
                  {BUDGET_LEVELS.map((b) => {
                    const on = budgetLevel === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setBudgetLevel(b.id)}
                        className={`rounded-xl border px-3 py-3 text-left transition-all ${
                          on
                            ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                            : "border-[var(--line)] bg-[var(--background)] hover:border-[var(--brand)]/50"
                        }`}
                      >
                        <div className="text-[14px] font-bold">{b.id}</div>
                        <div
                          className={`text-[11px] mt-0.5 ${on ? "text-white/80" : "text-[var(--muted)]"}`}
                        >
                          {b.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[13px] text-[var(--muted)] mb-2">交通方式</div>
                <div className="grid grid-cols-4 gap-2">
                  {TRANSPORTS.map((t) => {
                    const on = transport === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTransport(t.id)}
                        className={`rounded-xl border px-2 py-3 text-center transition-all ${
                          on
                            ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                            : "border-[var(--line)] bg-[var(--background)] hover:border-[var(--brand)]/50"
                        }`}
                      >
                        <div className="text-[18px] mb-1">{t.icon}</div>
                        <div className="text-[11px] font-semibold text-[var(--ink)]">
                          {t.id}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
                {error}
              </div>
            )}

            {/* 桌面提交 */}
            <button
              type="submit"
              disabled={submitting}
              className="hidden lg:flex w-full btn-brand rounded-2xl py-4 text-[16px] items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting
                ? "正在生成…"
                : `一键生成${daysCount > 0 ? ` ${daysCount} 日` : ""}攻略`}
            </button>

            <p className="hidden lg:block text-[12px] text-[var(--muted)] text-center">
              默认智谱 glm-4
              {user ? (
                <>
                  ，可在{" "}
                  <Link href="/settings" className="text-[var(--brand)]">
                    设置
                  </Link>{" "}
                  换模型
                </>
              ) : (
                <>
                  ，
                  <Link href="/login" className="text-[var(--brand)]">
                    登录
                  </Link>
                  后可用自己的 API Key
                </>
              )}
            </p>
          </form>

          {/* 右侧行程摘要 — 主流订票站风格 */}
          <aside className="hidden lg:block sticky top-20">
            <div className="bg-white rounded-2xl border border-[var(--line)] shadow-[var(--shadow)] overflow-hidden">
              <div className="relative h-28">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cover}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-[var(--ink)]/45" />
                <div className="absolute bottom-3 left-4 right-4 text-white">
                  <div className="text-[12px] text-white/75">即将生成</div>
                  <div className="font-display text-[22px] font-semibold truncate">
                    {destination.trim() || "未选目的地"}
                  </div>
                </div>
              </div>
              <div className="p-5 space-y-3 text-[13px]">
                <Row
                  label="行程"
                  value={
                    daysCount > 0
                      ? `${daysCount} 天 · ${startDate.slice(5)} 至 ${endDate.slice(5)}`
                      : "请选择日期"
                  }
                />
                <Row label="人数" value={`${travelers} 人`} />
                <Row label="预算" value={budgetLevel} />
                <Row label="交通" value={transport} />
                <Row
                  label="兴趣"
                  value={interests.length ? interests.join("、") : "未选"}
                />
                <Row
                  label="必去"
                  value={
                    mustInclude.length
                      ? mustInclude.map((p) => p.name).join("、")
                      : "无"
                  }
                />
              </div>
              <div className="px-5 pb-5">
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={submitting}
                  className="w-full btn-brand rounded-xl py-3.5 text-[15px] disabled:opacity-50"
                >
                  {submitting ? "生成中…" : "确认生成"}
                </button>
              </div>
            </div>
          </aside>
        </div>
        ) : null}
      </div>

      {/* 移动端吸底 CTA（仅专属定制） */}
      {genMode === "custom" ? (
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[var(--line)] bg-white/95 backdrop-blur px-4 py-3 safe-pb">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-[var(--muted)] truncate">
              {destination || "目的地"} · {daysCount > 0 ? `${daysCount}天` : "日期"} ·{" "}
              {travelers}人
            </div>
            <div className="text-[14px] font-semibold text-[var(--ink)] truncate">
              {mustInclude.length
                ? `含 ${mustInclude.length} 个必去景点`
                : "AI 智能规划行程"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={submitting}
            className="btn-brand shrink-0 rounded-full px-6 py-3 text-[14px] disabled:opacity-50"
          >
            {submitting ? "生成中" : "生成攻略"}
          </button>
        </div>
      </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-10 shrink-0 text-[var(--muted)]">{label}</span>
      <span className="text-[var(--ink)] font-medium leading-snug break-all">
        {value}
      </span>
    </div>
  );
}

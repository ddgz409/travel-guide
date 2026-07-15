"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useCallback, type FormEvent, type KeyboardEvent, Suspense } from "react";

import { tripsApi } from "@/lib/api";
import type { PoiSearchResult } from "@/lib/types";
import { useAuthStore } from "@/stores/auth";

const INTEREST_OPTIONS = [
  "文化", "美食", "购物", "自然", "历史", "夜生活", "亲子", "艺术", "运动",
];
const BUDGET_LEVELS = ["经济", "中等", "豪华"];
const TRANSPORTS = ["公共交通", "自驾", "步行", "混合"];

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

export default function GeneratePage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-[#999]">加载中...</div>}>
      <GenerateContent />
    </Suspense>
  );
}

function GenerateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [destination, setDestination] = useState(searchParams.get("dest") || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travelers, setTravelers] = useState(1);
  const [interests, setInterests] = useState<string[]>(["文化", "美食"]);
  const [budgetLevel, setBudgetLevel] = useState("中等");
  const [transport, setTransport] = useState("公共交通");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ---- 搜索景点 ----
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PoiSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [mustInclude, setMustInclude] = useState<PoiSearchResult[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    try {
      const results = await tripsApi.searchPois(q.trim(), destination.trim(), 8);
      setSearchResults(results);
      setShowResults(true);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [destination]);

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

  const removeMustInclude = (poiId: string) => {
    setMustInclude((prev) => prev.filter((m) => m.poi_id !== poiId));
  };

  // ---- 提交 ----
  const toggleInterest = (v: string) => {
    setInterests((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
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
      // 登录用户走正常接口，游客走 guest-generate
      const { user } = useAuthStore.getState();
      const trip = user
        ? await tripsApi.generate(payload)
        : await tripsApi.guestGenerate(payload);
      router.push(`/trips/${trip.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full px-5 py-10">
      <h1 className="text-2xl font-extrabold mb-1">生成旅行攻略</h1>
      <p className="text-gray-600 text-sm mb-8">
        填写需求，搜索你想去的景点加入必去清单，AI 为你定制行程
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg border border-gray-200/80 p-7 shadow-sm space-y-6"
      >
        {/* 目的地 */}
        <div>
          <label className="block text-sm font-bold mb-2">目的地</label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="如：北京、成都、东京"
            className="w-full rounded border-[1.5px] border-gray-200 px-4 py-3 text-[15px] font-medium focus:outline-none focus:border-orange-400 transition-colors"
          />
        </div>

        {/* 搜索景点 */}
        <div ref={searchRef} className="relative">
          <label className="block text-sm font-bold mb-2">搜索你想去的景点（可选）</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              onKeyDown={handleSearchKey}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
              placeholder="输入景点名搜索，如：故宫、长城..."
              className="flex-1 rounded border-[1.5px] border-gray-200 px-4 py-3 text-[15px] font-medium focus:outline-none focus:border-orange-400 transition-colors"
            />
          </div>
          {searching && (
            <div className="absolute z-20 mt-1 w-full bg-white rounded border border-gray-200 shadow-lg p-3 text-sm text-gray-400">
              搜索中...
            </div>
          )}
          {showResults && searchResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white rounded border border-gray-200 shadow-lg overflow-hidden">
              {searchResults.map((poi) => {
                const added = mustInclude.some((m) => m.poi_id === poi.poi_id);
                return (
                  <button
                    key={poi.poi_id}
                    type="button"
                    onClick={() => !added && addMustInclude(poi)}
                    disabled={added}
                    className="w-full text-left px-4 py-3 hover:bg-#fffaf0 transition-colors flex items-center justify-between disabled:opacity-40 border-b border-gray-100 last:border-0"
                  >
                    <div>
                      <span className="font-semibold text-[15px]">{poi.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{poi.address}</span>
                    </div>
                    <span className="text-xs font-bold text-amber-500">
                      {poi.rating ? `★ ${poi.rating}` : added ? "已添加" : "+ 添加"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 已选必去景点 */}
        {mustInclude.length > 0 && (
          <div>
            <label className="block text-sm font-bold mb-2">
              🎯 必去景点（{mustInclude.length} 个，AI 将优先安排）
            </label>
            <div className="flex flex-wrap gap-2">
              {mustInclude.map((poi) => (
                <span
                  key={poi.poi_id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 text-orange-700 text-sm font-semibold border border-orange-200"
                >
                  {poi.name}
                  {poi.rating && (
                    <span className="text-xs text-amber-500">★{poi.rating}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeMustInclude(poi.poi_id)}
                    className="ml-0.5 w-4 h-4 rounded-full bg-#ffe8b3 hover:bg-red-200 text-#ff8a00 hover:text-red-600 text-xs flex items-center justify-center transition-colors"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="h-px bg-gray-100" />

        {/* 日期 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold mb-2">出发日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded border-[1.5px] border-gray-200 px-4 py-3 text-[15px] font-medium focus:outline-none focus:border-orange-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-2">返程日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded border-[1.5px] border-gray-200 px-4 py-3 text-[15px] font-medium focus:outline-none focus:border-orange-400 transition-colors"
            />
          </div>
        </div>

        {/* 人数 */}
        <div>
          <label className="block text-sm font-bold mb-2">出行人数</label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setTravelers((n) => Math.max(1, n - 1))}
              className="w-10 h-10 rounded border-[1.5px] border-gray-200 hover:border-orange-400 hover:bg-#fffaf0 text-lg font-bold transition-colors"
            >
              −
            </button>
            <span className="w-12 text-center text-lg font-extrabold">{travelers}</span>
            <button
              type="button"
              onClick={() => setTravelers((n) => Math.min(20, n + 1))}
              className="w-10 h-10 rounded border-[1.5px] border-gray-200 hover:border-orange-400 hover:bg-#fffaf0 text-lg font-bold transition-colors"
            >
              +
            </button>
            <span className="text-gray-500 text-sm">人</span>
          </div>
        </div>

        <div className="h-px bg-gray-100" />

        {/* 兴趣偏好 */}
        <div>
          <label className="block text-sm font-bold mb-3">兴趣偏好（可多选）</label>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => toggleInterest(v)}
                className={`px-4 py-2 rounded-full text-sm font-semibold border-[1.5px] transition-all ${
                  interests.includes(v)
                    ? "bg-orange-400 text-white border-orange-400"
                    : "bg-white text-gray-700 border-gray-200 hover:border-#ffaa33 hover:text-#ff8a00"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* 预算等级 & 交通 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold mb-3">预算等级</label>
            <div className="flex gap-2">
              {BUDGET_LEVELS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setBudgetLevel(v)}
                  className={`flex-1 py-2.5 rounded text-sm font-semibold border-[1.5px] transition-all ${
                    budgetLevel === v
                      ? "bg-orange-400 text-white border-orange-400"
                      : "bg-white text-gray-700 border-gray-200 hover:border-#ffaa33"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold mb-3">交通方式</label>
            <select
              value={transport}
              onChange={(e) => setTransport(e.target.value)}
              className="w-full rounded border-[1.5px] border-gray-200 px-4 py-2.5 text-sm font-semibold focus:outline-none focus:border-orange-400 transition-colors"
            >
              {TRANSPORTS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-gradient-to-r from-orange-400 to-orange-500 text-white rounded py-3.5 font-bold text-base hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {submitting ? "提交中..." : mustInclude.length > 0 ? `✨ 生成攻略（含 ${mustInclude.length} 个必去景点）` : "✨ 生成攻略"}
        </button>
      </form>
    </div>
  );
}

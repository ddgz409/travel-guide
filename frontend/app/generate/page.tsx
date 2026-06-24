"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { tripsApi } from "@/lib/api";

const INTEREST_OPTIONS = [
  "文化", "美食", "购物", "自然", "历史", "夜生活", "亲子", "艺术", "运动",
];
const BUDGET_LEVELS = ["经济", "中等", "豪华"];
const TRANSPORTS = ["公共交通", "自驾", "步行", "混合"];

export default function GeneratePage() {
  const router = useRouter();
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travelers, setTravelers] = useState(1);
  const [interests, setInterests] = useState<string[]>(["文化", "美食"]);
  const [budgetLevel, setBudgetLevel] = useState("中等");
  const [transport, setTransport] = useState("公共交通");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      const trip = await tripsApi.generate({
        destination: destination.trim(),
        start_date: startDate,
        end_date: endDate,
        travelers,
        preferences: { interests, budget_level: budgetLevel, transport },
      });
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
        填写你的旅行需求，AI 将为你定制专属行程
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-gray-200/80 p-7 shadow-sm space-y-6"
      >
        {/* 目的地 */}
        <div>
          <label className="block text-sm font-bold mb-2">目的地</label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="如：东京、成都、大理"
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 text-[15px] font-medium focus:outline-none focus:border-sky-500 transition-colors"
          />
        </div>

        {/* 日期 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold mb-2">出发日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 text-[15px] font-medium focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-2">返程日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 text-[15px] font-medium focus:outline-none focus:border-sky-500 transition-colors"
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
              className="w-10 h-10 rounded-xl border-[1.5px] border-gray-200 hover:border-sky-500 hover:bg-sky-50 text-lg font-bold transition-colors"
            >
              −
            </button>
            <span className="w-12 text-center text-lg font-extrabold">{travelers}</span>
            <button
              type="button"
              onClick={() => setTravelers((n) => Math.min(20, n + 1))}
              className="w-10 h-10 rounded-xl border-[1.5px] border-gray-200 hover:border-sky-500 hover:bg-sky-50 text-lg font-bold transition-colors"
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
                    ? "bg-sky-500 text-white border-sky-500"
                    : "bg-white text-gray-700 border-gray-200 hover:border-sky-400 hover:text-sky-600"
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
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-[1.5px] transition-all ${
                    budgetLevel === v
                      ? "bg-sky-500 text-white border-sky-500"
                      : "bg-white text-gray-700 border-gray-200 hover:border-sky-400"
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
              className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-2.5 text-sm font-semibold focus:outline-none focus:border-sky-500 transition-colors"
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
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-gradient-to-r from-sky-500 to-indigo-500 text-white rounded-xl py-3.5 font-bold text-base hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {submitting ? "提交中..." : "✨ 生成攻略"}
        </button>
      </form>
    </div>
  );
}

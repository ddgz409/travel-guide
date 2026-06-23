"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuthStore } from "@/stores/auth";

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuthStore();

  return (
    <div className="flex-1">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-500 via-indigo-500 to-purple-600 opacity-10" />
        <div className="relative max-w-6xl mx-auto px-4 py-20 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
            让 AI 为你
            <span className="bg-gradient-to-r from-sky-600 to-indigo-600 bg-clip-text text-transparent">
              {" "}量身定制{" "}
            </span>
            旅行攻略
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
            输入目的地和偏好，自动生成按天行程、地图路线与预算估算。
            基于真实景点数据，告别千篇一律的模板。
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => router.push(user ? "/generate" : "/register")}
              className="bg-sky-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-sky-700 shadow-lg shadow-sky-200"
            >
              {user ? "开始生成攻略 →" : "免费开始使用 →"}
            </button>
            <Link
              href="/trips"
              className="px-6 py-3 rounded-xl font-medium border border-gray-300 hover:bg-gray-50"
            >
              查看我的攻略
            </Link>
          </div>
        </div>
      </section>

      {/* 功能特性 */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: "🗓️",
              title: "按天行程生成",
              desc: "AI 根据你的日期与偏好，自动规划每天上午/下午/晚上的安排，路线合理不绕路。",
            },
            {
              icon: "🗺️",
              title: "地图路线展示",
              desc: "景点位置在地图上一目了然，标注每日路线与交通方式，出行更从容。",
            },
            {
              icon: "💰",
              title: "预算估算",
              desc: "自动估算交通、住宿、门票、餐饮费用，按天与分类汇总，花费心中有数。",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 工作流程 */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-center mb-10">三步生成你的攻略</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {[
            { step: "1", title: "填写需求", desc: "目的地、日期、人数、偏好" },
            { step: "2", title: "AI 生成", desc: "聚合真实数据智能规划" },
            { step: "3", title: "查看 & 编辑", desc: "地图、预算、随时调整" },
          ].map((s) => (
            <div key={s.step} className="text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-sky-100 text-sky-600 font-bold text-xl flex items-center justify-center mb-3">
                {s.step}
              </div>
              <h3 className="font-semibold mb-1">{s.title}</h3>
              <p className="text-gray-500 text-sm">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

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
        <div className="absolute inset-0 bg-gradient-to-br from-sky-100 via-indigo-50 to-purple-50 opacity-60" />
        <div className="relative max-w-4xl mx-auto px-5 py-20 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-5 leading-tight">
            让 AI 为你
            <span className="bg-gradient-to-r from-sky-500 to-indigo-500 bg-clip-text text-transparent">
              {" "}量身定制{" "}
            </span>
            旅行攻略
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8 leading-relaxed">
            输入目的地和偏好，自动生成按天行程、地图路线与预算估算。
            聚合真实景点评分数据，支持自选编辑，告别千篇一律的模板。
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => router.push(user ? "/generate" : "/register")}
              className="bg-gradient-to-r from-sky-500 to-indigo-500 text-white px-7 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-sky-200"
            >
              {user ? "开始生成攻略 →" : "免费开始使用 →"}
            </button>
            <Link
              href="/trips"
              className="px-7 py-3 rounded-xl font-semibold border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
            >
              查看我的攻略
            </Link>
          </div>
        </div>
      </section>

      {/* 功能特性 */}
      <section className="max-w-5xl mx-auto px-5 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              icon: "🗓️",
              title: "按天行程生成",
              desc: "AI 根据日期与偏好，规划每天上午/下午/晚上的安排，路线合理不绕路。",
            },
            {
              icon: "🗺️",
              title: "地图路线展示",
              desc: "景点位置在地图上一目了然，标注每日路线与交通方式，出行更从容。",
            },
            {
              icon: "✋",
              title: "自选编辑",
              desc: "生成后可勾选/取消景点、拖拽排序、换备选，打造属于你的专属行程。",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 工作流程 */}
      <section className="max-w-4xl mx-auto px-5 py-12">
        <h2 className="text-2xl font-extrabold text-center mb-10">三步生成你的攻略</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {[
            { step: "1", title: "填写需求", desc: "目的地、日期、人数、偏好" },
            { step: "2", title: "AI 生成", desc: "聚合真实数据智能规划" },
            { step: "3", title: "自选 & 编辑", desc: "勾选景点、地图、预算" },
          ].map((s) => (
            <div key={s.step} className="text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-sky-100 text-sky-600 font-bold text-xl flex items-center justify-center mb-3">
                {s.step}
              </div>
              <h3 className="font-bold mb-1">{s.title}</h3>
              <p className="text-gray-600 text-sm">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

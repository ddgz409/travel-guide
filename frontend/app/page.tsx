"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useAuthStore } from "@/stores/auth";

const DESTINATIONS = [
  { name: "北京", emoji: "🏯", desc: "故宫长城·皇城根下", color: "from-amber-200 to-yellow-100" },
  { name: "成都", emoji: "🐼", desc: "美食天堂·慢生活", color: "from-green-200 to-emerald-100" },
  { name: "东京", emoji: "🗼", desc: "潮流文化·美食", color: "from-pink-200 to-rose-100" },
  { name: "大理", emoji: "🌊", desc: "风花雪月·苍山洱海", color: "from-blue-200 to-cyan-100" },
  { name: "西安", emoji: "⛰️", desc: "千年古都·兵马俑", color: "from-orange-200 to-amber-100" },
  { name: "厦门", emoji: "🏝️", desc: "鼓浪屿·海鲜", color: "from-cyan-200 to-teal-100" },
  { name: "上海", emoji: "🏙️", desc: "魔都·外滩夜景", color: "from-violet-200 to-purple-100" },
  { name: "三亚", emoji: "🌴", desc: "热带海岛·潜水", color: "from-teal-200 to-cyan-100" },
];

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [searchDest, setSearchDest] = useState("");

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (!searchDest.trim()) return;
    router.push(user ? `/generate?dest=${encodeURIComponent(searchDest.trim())}` : "/register");
  };

  return (
    <div className="flex-1">
      {/* Hero 大图 + 搜索框 */}
      <section className="relative" style={{ height: 360 }}>
        <div className="absolute inset-0 bg-gradient-to-br from-orange-400 via-orange-500 to-amber-500" />
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative max-w-[1200px] mx-auto h-full px-5 flex flex-col items-center justify-center">
          <h1 className="text-white text-[32px] font-bold text-center mb-2" style={{ textShadow: "0 2px 8px rgba(0,0,0,.5)" }}>
            AI 为你定制专属旅行攻略
          </h1>
          <p className="text-white/90 text-[15px] mb-8" style={{ textShadow: "0 1px 4px rgba(0,0,0,.4)" }}>
            输入目的地，一键生成按天行程·地图路线·预算估算
          </p>
          {/* 搜索框 */}
          <form onSubmit={handleSearch} className="flex w-full max-w-[560px] bg-white/95 rounded overflow-hidden" style={{ boxShadow: "0 4px 20px rgba(0,0,0,.15)" }}>
            <input
              type="text"
              value={searchDest}
              onChange={(e) => setSearchDest(e.target.value)}
              placeholder="想去哪里？输入目的地，如：北京、东京、大理"
              className="flex-1 px-5 py-3 text-[15px] text-[#333] outline-none"
            />
            <button
              type="submit"
              className="bg-[#ff9d00] hover:bg-[#ff8a00] text-white px-6 font-bold text-[15px] transition-colors flex items-center gap-1"
            >
              🔍 生成攻略
            </button>
          </form>
        </div>
      </section>

      {/* 热门目的地 */}
      <section className="max-w-[1200px] mx-auto px-5 py-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[20px] font-bold text-[#333]">热门目的地</h2>
          <span className="text-[13px] text-[#999]">点击直接生成攻略 →</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {DESTINATIONS.map((d) => (
            <Link
              key={d.name}
              href={user ? `/generate?dest=${encodeURIComponent(d.name)}` : "/register"}
              className="block bg-white border border-[#e5e5e5] rounded overflow-hidden hover:shadow-md transition-all group"
            >
              <div className={`h-28 flex items-center justify-center text-[44px] bg-gradient-to-br ${d.color}`}>
                {d.emoji}
              </div>
              <div className="p-3">
                <div className="font-bold text-[16px] text-[#333] group-hover:text-[#ff9d00] transition-colors">
                  {d.name}
                </div>
                <div className="text-[12px] text-[#999] mt-0.5">{d.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 功能亮点 */}
      <section className="max-w-[1200px] mx-auto px-5 py-10">
        <h2 className="text-[20px] font-bold text-[#333] mb-5">为什么选择我们</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            { icon: "🤖", title: "AI 智能生成", desc: "基于真实景点数据+网络攻略，AI 自动规划按天行程，路线合理不绕路。" },
            { icon: "🗺️", title: "地图+路线", desc: "景点位置地图标注，步行/地铁/公交自动选择，出行一目了然。" },
            { icon: "✋", title: "自选编辑", desc: "生成后可勾选取消景点、搜索替换、拖拽排序，打造专属行程。" },
          ].map((f) => (
            <div key={f.title} className="bg-white border border-[#e5e5e5] rounded p-5 hover:border-[#ff9d00] transition-colors">
              <div className="text-[28px] mb-2">{f.icon}</div>
              <h3 className="font-bold text-[16px] text-[#333] mb-1">{f.title}</h3>
              <p className="text-[13px] text-[#666] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 使用流程 */}
      <section className="max-w-[1200px] mx-auto px-5 py-10 pb-16">
        <h2 className="text-[20px] font-bold text-[#333] mb-8 text-center">三步生成你的攻略</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-[800px] mx-auto">
          {[
            { step: "1", title: "填写需求", desc: "目的地、日期、偏好", color: "bg-[#ff9d00]" },
            { step: "2", title: "AI 生成", desc: "聚合真实数据智能规划", color: "bg-[#ffa726]" },
            { step: "3", title: "自选编辑", desc: "勾选景点、地图、预算", color: "bg-[#ffcc80]" },
          ].map((s) => (
            <div key={s.step} className="text-center">
              <div className={`w-12 h-12 mx-auto rounded-full ${s.color} text-white font-bold text-xl flex items-center justify-center mb-3`}>
                {s.step}
              </div>
              <h3 className="font-bold text-[15px] text-[#333] mb-1">{s.title}</h3>
              <p className="text-[13px] text-[#999]">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

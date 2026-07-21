"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const SLIDES = [
  {
    title: "洛阳拾芳，嵩山揽胜",
    sub: "赴一场河洛韶华，且随繁花醉神都",
    dest: "洛阳",
    img: "/covers/luoyang.jpg",
  },
  {
    title: "半城烟火半城仙",
    sub: "周末泉州特种兵，老街与海风同框",
    dest: "泉州",
    img: "/covers/quanzhou.jpg",
  },
  {
    title: "西湖烟雨，茶香入梦",
    sub: "环湖慢行，把雷峰夕照留给傍晚",
    dest: "杭州",
    img: "/covers/hangzhou_hero.jpg",
  },
];

const INTERESTS = [
  { label: "吃遍天下", tag: "美食", emoji: "🍜" },
  { label: "带着对象", tag: "情侣", emoji: "💑" },
  { label: "带着孩子", tag: "亲子", emoji: "👨‍👩‍👧" },
  { label: "登山徒步", tag: "自然", emoji: "🥾" },
  { label: "带着父母", tag: "文化", emoji: "🧓" },
  { label: "独自一人", tag: "自由", emoji: "🎒" },
  { label: "短途周末", tag: "周末", emoji: "☀️" },
  { label: "历史人文", tag: "历史", emoji: "🏛️" },
];

const DESTINATIONS = [
  {
    name: "北京",
    desc: "故宫长城 · 皇城根下",
    img: "/covers/beijing_hero.jpg",
  },
  {
    name: "成都",
    desc: "熊猫火锅 · 慢生活",
    img: "/covers/chengdu.jpg",
  },
  {
    name: "杭州",
    desc: "西湖龙井 · 江南烟雨",
    img: "/covers/westlake.jpg",
  },
  {
    name: "大理",
    desc: "风花雪月 · 苍山洱海",
    img: "/covers/dali.jpg",
  },
  {
    name: "西安",
    desc: "兵马俑 · 古城墙",
    img: "/covers/xian.jpg",
  },
  {
    name: "厦门",
    desc: "鼓浪屿 · 海边慢行",
    img: "/covers/xiamen.jpg",
  },
  {
    name: "上海",
    desc: "外滩夜景 · 魔都节奏",
    img: "/covers/shanghai_bund.jpg",
  },
  {
    name: "三亚",
    desc: "热带海岛 · 阳光沙滩",
    img: "/covers/sanya.jpg",
  },
];

const NOTES = [
  {
    title: "来腾冲一定不能错过，荷花泡一个户外森林温泉",
    meta: "温泉 · 腾冲",
    dest: "腾冲",
    img: "/covers/onsen.jpg",
  },
  {
    title: "晋中四日行纪：彩塑 · 琉璃 · 壁画",
    meta: "人文 · 晋中",
    dest: "晋中",
    img: "/covers/note_jinzhong.jpg",
  },
  {
    title: "贵州鸟类观察手册：把清晨留给山谷",
    meta: "自然 · 贵阳",
    dest: "贵阳",
    img: "/covers/nature.jpg",
  },
  {
    title: "洱海边的慢日子：大理三天两夜不赶路",
    meta: "慢旅行 · 大理",
    dest: "大理",
    img: "/covers/dali.jpg",
  },
];

const HOT = ["北京", "云南", "日本", "泰国", "青海湖", "香港", "成都", "杭州"];

export default function HomePage() {
  const router = useRouter();
  const [slide, setSlide] = useState(0);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"全部" | "目的地" | "攻略">("全部");

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 5500);
    return () => clearInterval(t);
  }, []);

  const go = (dest: string) => {
    router.push(`/generate?dest=${encodeURIComponent(dest)}`);
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    go(q.trim());
  };

  const current = SLIDES[slide];

  return (
    <div className="flex-1">
      {/* 大图 Hero —— 参考马蜂窝首页轮播结构 */}
      <section className="relative h-[420px] sm:h-[480px] overflow-hidden">
        {SLIDES.map((s, i) => (
          <div
            key={s.dest}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === slide ? "opacity-100" : "opacity-0"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.img} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/35 to-black/20" />
          </div>
        ))}

        <div className="relative z-10 site-container h-full flex flex-col justify-end pb-14">
          <p className="anim-fade-up text-white/70 text-[12px] tracking-[0.2em] uppercase mb-2">
            {new Date().toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </p>
          <h1 className="anim-fade-up font-display text-white text-[28px] sm:text-[40px] font-semibold leading-tight max-w-[18ch] mb-2">
            {current.title}
          </h1>
          <p className="anim-fade-up text-white/85 text-[15px] mb-7 max-w-[36ch]">
            {current.sub}
          </p>

          {/* 搜索条 */}
          <form
            onSubmit={onSearch}
            className="anim-fade-up w-full max-w-[640px] bg-white rounded-xl overflow-hidden shadow-[var(--shadow)]"
          >
            <div className="flex border-b border-[var(--line)] text-[13px]">
              {(["全部", "目的地", "攻略"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-4 py-2.5 ${
                    tab === t
                      ? "text-[var(--brand)] font-semibold border-b-2 border-[var(--brand)]"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex items-stretch">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜目的地 / 景点，如：北京、大理、鼓浪屿"
                className="flex-1 px-4 py-3.5 text-[15px] text-[var(--ink)] outline-none"
              />
              <button type="submit" className="btn-brand px-7 text-[15px]">
                搜索
              </button>
            </div>
          </form>

          <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-white/80">
            <span className="opacity-70">热门：</span>
            {HOT.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => go(h)}
                className="hover:text-white underline-offset-2 hover:underline"
              >
                {h}
              </button>
            ))}
          </div>

          <div className="absolute bottom-5 right-5 flex gap-2">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`slide ${i + 1}`}
                onClick={() => setSlide(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === slide ? "w-6 bg-white" : "w-1.5 bg-white/45"
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 快捷入口 */}
      <section className="bg-white border-b border-[var(--line)]">
        <div className="site-container py-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: "/generate", title: "AI 生成攻略", desc: "一键定制行程" },
            { href: "/generate", title: "自由行规划", desc: "景点地图路线" },
            { href: "/trips", title: "我的攻略", desc: "收藏与编辑" },
            { href: "/settings", title: "模型设置", desc: "自带 API Key" },
          ].map((x) => (
            <Link
              key={x.title}
              href={x.href}
              className="rounded-xl border border-[var(--line)] px-4 py-3 hover:border-[var(--brand)] hover:shadow-sm transition-all bg-[var(--background)]/40"
            >
              <div className="text-[var(--ink)] font-semibold text-[14px]">
                {x.title}
              </div>
              <div className="text-[12px] text-[var(--muted)] mt-0.5">{x.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* 兴趣标签 —— 马蜂窝式 */}
      <section className="site-container py-10">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="font-display text-[26px] font-semibold text-[var(--ink)]">
              按兴趣出发
            </h2>
            <p className="text-[13px] text-[var(--muted)] mt-1">
              选一种旅行姿态，AI 会更懂你要什么
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {INTERESTS.map((it) => (
            <Link
              key={it.label}
              href={`/generate?dest=北京`}
              className="chip rounded-2xl px-4 py-4 flex items-center gap-3 hover:-translate-y-0.5"
            >
              <span className="text-[22px]">{it.emoji}</span>
              <div>
                <div className="text-[14px] font-semibold text-[var(--ink)]">
                  {it.label}
                </div>
                <div className="text-[11px] text-[var(--muted)]">#{it.tag}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 热门目的地 */}
      <section className="site-container pb-6">
        <div className="flex items-end justify-between mb-5">
          <h2 className="font-display text-[26px] font-semibold text-[var(--ink)]">
            热门目的地
          </h2>
          <span className="text-[13px] text-[var(--muted)]">点击生成攻略 →</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {DESTINATIONS.map((d) => (
            <button
              key={d.name}
              type="button"
              onClick={() => go(d.name)}
              className="group relative aspect-[4/5] overflow-hidden rounded-2xl text-left"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={d.img}
                alt={d.name}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                <div className="font-display text-[22px] font-semibold">{d.name}</div>
                <div className="text-[12px] text-white/75 mt-0.5">{d.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 攻略推荐流 */}
      <section className="site-container py-12">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="font-display text-[26px] font-semibold text-[var(--ink)]">
              旅游攻略推荐
            </h2>
            <p className="text-[13px] text-[var(--muted)] mt-1">
              灵感来自旅行社区常见的游记卡片，一键带入 AI 生成
            </p>
          </div>
          <Link
            href="/generate"
            className="text-[13px] text-[var(--brand)] font-semibold hover:underline"
          >
            自己写一份 →
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {NOTES.map((n) => (
            <Link
              key={n.title}
              href={`/generate?dest=${encodeURIComponent(n.dest)}`}
              className="group bg-white rounded-2xl overflow-hidden border border-[var(--line)] hover:shadow-[var(--shadow)] transition-shadow"
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={n.img}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-4">
                <div className="text-[11px] text-[var(--brand)] mb-1.5">{n.meta}</div>
                <h3 className="text-[15px] font-semibold text-[var(--ink)] leading-snug line-clamp-2 group-hover:text-[var(--brand)] transition-colors">
                  {n.title}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 底部 CTA */}
      <section className="site-container pb-16">
        <div className="rounded-3xl overflow-hidden relative min-h-[200px] flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/covers/nature.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-[var(--ink)]/65" />
          <div className="relative z-10 px-8 py-10 sm:px-12 text-white max-w-xl">
            <h2 className="font-display text-[28px] font-semibold mb-2">
              旅游之前，先上旅迹
            </h2>
            <p className="text-white/80 text-[14px] mb-5 leading-relaxed">
              选好目的地，AI 帮你排日程、算路线、估预算——生成后还能继续改。
            </p>
            <Link
              href="/generate"
              className="inline-flex btn-brand rounded-full px-6 py-2.5 text-[14px]"
            >
              开始定制行程
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

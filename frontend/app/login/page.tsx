"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useAuthStore } from "@/stores/auth";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      router.push("/trips");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-14">
      <div className="w-full max-w-md bg-white rounded-2xl border border-[var(--line)] shadow-[var(--shadow)] p-8">
        <div className="font-display text-[26px] font-semibold text-[var(--ink)] mb-1">
          欢迎回来
        </div>
        <p className="text-[var(--muted)] mb-6 text-sm">登录旅迹，管理你的攻略</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
              用户名
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-[15px] outline-none focus:border-[var(--brand)]"
              placeholder="请输入用户名"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
              密码
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-[15px] outline-none focus:border-[var(--brand)]"
              placeholder="至少 6 位"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full btn-brand rounded-xl py-3 disabled:opacity-50"
          >
            {submitting ? "登录中…" : "登录"}
          </button>
        </form>

        <p className="text-center text-sm text-[var(--muted)] mt-6">
          还没有账号？{" "}
          <Link
            href="/register"
            className="text-[var(--brand)] hover:underline font-semibold"
          >
            立即注册
          </Link>
        </p>
      </div>
    </div>
  );
}

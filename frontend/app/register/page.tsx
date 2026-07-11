"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useAuthStore } from "@/stores/auth";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(username, password);
      router.push("/generate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-lg border border-gray-200/80 shadow-sm p-8">
        <h1 className="text-2xl font-extrabold mb-1">创建账号 ✨</h1>
        <p className="text-gray-600 mb-6 text-sm">开始生成你的专属旅行攻略</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-2">用户名</label>
            <input
              type="text"
              required
              minLength={2}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded border-[1.5px] border-gray-200 px-4 py-3 text-[15px] font-medium focus:outline-none focus:border-orange-400 transition-colors"
              placeholder="2-64 位用户名"
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-2">密码</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border-[1.5px] border-gray-200 px-4 py-3 text-[15px] font-medium focus:outline-none focus:border-orange-400 transition-colors"
              placeholder="至少 6 位"
            />
          </div>

          {error && (
            <div className="rounded bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gradient-to-r from-orange-400 to-orange-500 text-white rounded py-3 font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? "注册中..." : "注册"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          已有账号？{" "}
          <Link href="/login" className="text-#ff8a00 hover:underline font-semibold">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}

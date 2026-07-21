"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { ApiError, authApi } from "@/lib/api";
import type { LlmSettings } from "@/lib/types";
import { useAuthStore } from "@/stores/auth";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthStore();
  const [settings, setSettings] = useState<LlmSettings | null>(null);
  const [provider, setProvider] = useState("zhipu");
  const [model, setModel] = useState("glm-4");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await authApi.getLlmSettings();
        if (cancelled) return;
        setSettings(data);
        setProvider(data.provider || "zhipu");
        setModel(data.model || "glm-4");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, router]);

  const modelOptions = useMemo(() => {
    const list = settings?.suggested_models?.[provider] || ["glm-4"];
    return model && !list.includes(model) ? [model, ...list] : list;
  }, [settings, provider, model]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);
    setSaving(true);
    try {
      const payload: {
        provider: string;
        model: string;
        api_key?: string;
      } = { provider, model };
      if (clearKey) {
        payload.api_key = "";
      } else if (apiKey.trim()) {
        payload.api_key = apiKey.trim();
      }
      const data = await authApi.updateLlmSettings(payload);
      setSettings(data);
      setApiKey("");
      setClearKey(false);
      setOk("已保存。之后生成攻略将使用此配置。");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "保存失败";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 text-[var(--muted)]">
        加载中…
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 py-10">
      <div className="w-full max-w-lg mx-auto bg-white rounded-2xl border border-[var(--line)] shadow-[var(--shadow)] p-8">
        <h1 className="font-display text-[26px] font-semibold text-[var(--ink)] mb-1">
          LLM 设置
        </h1>
        <p className="text-[var(--muted)] mb-6 text-sm">
          默认智谱 <span className="font-semibold text-[var(--ink)]">glm-4</span>
          ，也可自填 Key，切换智谱 / 豆包 / MiMo / DeepSeek。
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
              提供商
            </label>
            <select
              value={provider}
              onChange={(e) => {
                const p = e.target.value;
                setProvider(p);
                const first = settings?.suggested_models?.[p]?.[0];
                if (first) setModel(first);
              }}
              className="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-[15px] outline-none focus:border-[var(--brand)] bg-white"
            >
              {(settings?.available_providers || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
              模型
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-[15px] outline-none focus:border-[var(--brand)] bg-white mb-2"
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-[15px] outline-none focus:border-[var(--brand)]"
              placeholder="或手动输入，如 glm-5.2"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                if (e.target.value) setClearKey(false);
              }}
              className="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-[15px] outline-none focus:border-[var(--brand)]"
              placeholder={
                settings?.has_api_key
                  ? `已保存 ${settings.api_key_hint || ""}，留空则不修改`
                  : "留空则使用服务器默认 Key"
              }
              autoComplete="off"
            />
            {settings?.has_api_key && (
              <label className="mt-2 flex items-center gap-2 text-sm text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={clearKey}
                  onChange={(e) => {
                    setClearKey(e.target.checked);
                    if (e.target.checked) setApiKey("");
                  }}
                />
                清除我的 Key，改回服务器默认
              </label>
            )}
            <p className="mt-2 text-[13px] text-[var(--muted)]">
              {settings?.using_server_default
                ? "当前：使用服务器默认 Key"
                : "当前：使用你保存的 Key"}
              {provider === "zhipu" && (
                <>
                  {" · "}
                  <a
                    href="https://open.bigmodel.cn/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--brand)] hover:underline"
                  >
                    申请智谱 Key
                  </a>
                </>
              )}
              {provider === "doubao" && (
                <>
                  {" · "}
                  <a
                    href="https://console.volcengine.com/ark"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--brand)] hover:underline"
                  >
                    火山方舟
                  </a>
                </>
              )}
              {provider === "mimo" && (
                <>
                  {" · "}
                  <a
                    href="https://mimo.mi.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--brand)] hover:underline"
                  >
                    MiMo
                  </a>
                </>
              )}
              {provider === "deepseek" && (
                <>
                  {" · "}
                  <a
                    href="https://platform.deepseek.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--brand)] hover:underline"
                  >
                    DeepSeek
                  </a>
                </>
              )}
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
              {error}
            </div>
          )}
          {ok && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3">
              {ok}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full btn-brand rounded-xl py-3 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存设置"}
          </button>
        </form>

        <p className="text-center text-sm text-[var(--muted)] mt-6">
          <Link
            href="/generate"
            className="text-[var(--brand)] hover:underline font-semibold"
          >
            去生成攻略
          </Link>
        </p>
      </div>
    </div>
  );
}

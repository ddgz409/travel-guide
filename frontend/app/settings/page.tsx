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
  const [baseUrl, setBaseUrl] = useState("");
  const [customProvider, setCustomProvider] = useState(false);
  const [customMode, setCustomMode] = useState(false);
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
        const p = data.provider || "zhipu";
        const m = data.model || "glm-4";
        const known = (data.available_providers || []).some((x) => x.id === p);
        setProvider(p);
        setModel(m);
        setBaseUrl(data.base_url || "");
        setCustomProvider(!known);
        const presets = data.suggested_models?.[p] || [];
        setCustomMode(Boolean(m) && !presets.includes(m));
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

  const presetModels = useMemo(() => {
    if (customProvider) return [];
    return settings?.suggested_models?.[provider] || ["glm-4"];
  }, [settings, provider, customProvider]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);
    const modelName = model.trim();
    const providerId = provider.trim().toLowerCase();
    const bu = baseUrl.trim().replace(/\/+$/, "");
    if (!providerId) {
      setError("请选择提供商，或输入自定义提供商 ID");
      return;
    }
    if (customProvider && !bu) {
      setError("自定义提供商需填写 Base URL");
      return;
    }
    if (!modelName) {
      setError("请选择预设模型，或输入自定义模型名");
      return;
    }
    setSaving(true);
    try {
      const payload: {
        provider: string;
        model: string;
        base_url: string;
        api_key?: string;
      } = {
        provider: providerId,
        model: modelName,
        base_url: customProvider ? bu : "",
      };
      if (clearKey) {
        payload.api_key = "";
      } else if (apiKey.trim()) {
        payload.api_key = apiKey.trim();
      }
      const data = await authApi.updateLlmSettings(payload);
      setSettings(data);
      setApiKey("");
      setClearKey(false);
      setBaseUrl(data.base_url || "");
      const known = (data.available_providers || []).some(
        (x) => x.id === data.provider,
      );
      setCustomProvider(!known);
      const presets = data.suggested_models?.[data.provider] || [];
      setCustomMode(!presets.includes(modelName));
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
          可选预设提供商与模型，也可自定义 OpenAI 兼容接口。
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
              提供商
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {(settings?.available_providers || []).map((p) => {
                const on = !customProvider && provider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setCustomProvider(false);
                      setProvider(p.id);
                      setBaseUrl("");
                      const first = settings?.suggested_models?.[p.id]?.[0];
                      if (first) {
                        setModel(first);
                        setCustomMode(false);
                      }
                    }}
                    className={`rounded-full px-3 py-1.5 text-[13px] border transition-colors ${
                      on
                        ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)] font-semibold"
                        : "border-[var(--line)] bg-[var(--background)] text-[var(--ink)] hover:border-[var(--brand)]/50"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setCustomProvider(true);
                  if (!customProvider) {
                    setProvider("");
                    setModel("");
                    setCustomMode(true);
                  }
                }}
                className={`rounded-full px-3 py-1.5 text-[13px] border transition-colors ${
                  customProvider
                    ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)] font-semibold"
                    : "border-[var(--line)] bg-[var(--background)] text-[var(--ink)] hover:border-[var(--brand)]/50"
                }`}
              >
                自定义
              </button>
            </div>
            {customProvider && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-[15px] outline-none focus:border-[var(--brand)]"
                  placeholder="提供商 ID，如 moonshot / qwen"
                  autoComplete="off"
                />
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-[15px] outline-none focus:border-[var(--brand)]"
                  placeholder="Base URL，如 https://api.moonshot.cn/v1"
                  autoComplete="off"
                />
                <p className="text-[12px] text-[var(--muted)]">
                  需为 OpenAI 兼容的 Chat Completions 接口地址
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
              模型
            </label>
            {presetModels.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {presetModels.map((m) => {
                  const on = !customMode && model === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setCustomMode(false);
                        setModel(m);
                      }}
                      className={`rounded-full px-3 py-1.5 text-[13px] border transition-colors ${
                        on
                          ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)] font-semibold"
                          : "border-[var(--line)] bg-[var(--background)] text-[var(--ink)] hover:border-[var(--brand)]/50"
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setCustomMode(true);
                    if (presetModels.includes(model)) setModel("");
                  }}
                  className={`rounded-full px-3 py-1.5 text-[13px] border transition-colors ${
                    customMode
                      ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)] font-semibold"
                      : "border-[var(--line)] bg-[var(--background)] text-[var(--ink)] hover:border-[var(--brand)]/50"
                  }`}
                >
                  自定义
                </button>
              </div>
            )}
            <input
              type="text"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setCustomMode(true);
              }}
              onFocus={() => setCustomMode(true)}
              className="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-[15px] outline-none focus:border-[var(--brand)]"
              placeholder="自定义模型名，如 glm-4.5 / deepseek-reasoner"
              autoComplete="off"
            />
            <p className="mt-2 text-[12px] text-[var(--muted)]">
              点选预设，或在输入框填写任意模型 ID（需与提供商一致）
            </p>
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
              {!customProvider && provider === "zhipu" && (
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
              {!customProvider && provider === "doubao" && (
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
              {!customProvider && provider === "mimo" && (
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
              {!customProvider && provider === "deepseek" && (
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

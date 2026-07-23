/** 本地 LLM 配置（游客未登录时自带 Key；登录用户优先用服务端账号设置） */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "travel_guide_local_llm";

export type LocalLlmConfig = {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
};

export const DEFAULT_LOCAL_LLM: LocalLlmConfig = {
  provider: "zhipu",
  model: "glm-4",
  apiKey: "",
  baseUrl: "",
};

export const LOCAL_PROVIDERS = [
  { id: "zhipu", label: "智谱 GLM" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "doubao", label: "豆包" },
  { id: "mimo", label: "小米 MiMo" },
  { id: "openai", label: "OpenAI 兼容" },
];

export const LOCAL_MODELS: Record<string, string[]> = {
  zhipu: ["glm-4", "glm-4-flash", "glm-4.7-flash", "glm-5"],
  deepseek: ["deepseek-v4-flash", "deepseek-chat"],
  doubao: ["doubao-seed-1-6", "doubao-1-5-pro-32k"],
  mimo: ["mimo-v2.5-pro", "mimo-v2.5"],
  openai: ["gpt-4o-mini", "gpt-4o"],
};

export async function loadLocalLlm(): Promise<LocalLlmConfig> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_LOCAL_LLM };
    const parsed = JSON.parse(raw) as Partial<LocalLlmConfig>;
    return {
      provider: parsed.provider || DEFAULT_LOCAL_LLM.provider,
      model: parsed.model || DEFAULT_LOCAL_LLM.model,
      apiKey: parsed.apiKey || "",
      baseUrl: parsed.baseUrl || "",
    };
  } catch {
    return { ...DEFAULT_LOCAL_LLM };
  }
}

export async function saveLocalLlm(cfg: LocalLlmConfig): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(cfg));
}

export async function clearLocalLlmKey(): Promise<void> {
  const cur = await loadLocalLlm();
  await saveLocalLlm({ ...cur, apiKey: "" });
}

/** 生成请求用的 llm 覆盖（有 Key 才带上） */
export async function localLlmOverride(): Promise<{
  provider: string;
  model: string;
  api_key: string;
  base_url?: string;
} | null> {
  const cfg = await loadLocalLlm();
  if (!cfg.apiKey.trim()) return null;
  return {
    provider: cfg.provider,
    model: cfg.model,
    api_key: cfg.apiKey.trim(),
    ...(cfg.baseUrl.trim() ? { base_url: cfg.baseUrl.trim() } : {}),
  };
}

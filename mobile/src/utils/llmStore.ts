/** 本地 LLM 配置（游客未登录时自带 Key；登录用户优先用服务端账号设置） */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "travel_guide_local_llm";
const CUSTOM_KEY = "travel_guide_custom_providers";

export type LocalLlmConfig = {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
};

export type CustomProvider = {
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
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

/** 返回 AI 助手可选的模型列表（含服务器默认 + 用户自定义供应商） */
export async function getAvailableModels(): Promise<
  Array<{ provider: string; model: string; label: string; badge?: string }>
> {
  const list: Array<{
    provider: string;
    model: string;
    label: string;
    badge?: string;
  }> = [];

  // 服务器默认模型（始终可用，不需要自己的 Key）
  list.push({
    provider: "zhipu",
    model: "glm-4",
    label: "GLM-4",
    badge: "服务器默认",
  });

  // 用户保存的自定义供应商
  const customs = await loadCustomProviders();
  for (const c of customs) {
    list.push({
      provider: c.provider,
      model: c.model,
      label: c.name,
      badge: "自定义",
    });
  }

  return list;
}

/** 加载自定义供应商列表 */
export async function loadCustomProviders(): Promise<CustomProvider[]> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** 保存自定义供应商（不自动切换为当前模型） */
export async function saveCustomProvider(p: CustomProvider): Promise<void> {
  const list = await loadCustomProviders();
  const idx = list.findIndex((x) => x.provider === p.provider);
  if (idx >= 0) list[idx] = p;
  else list.push(p);
  await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
}

/** 删除自定义供应商 */
export async function deleteCustomProvider(providerId: string): Promise<void> {
  const list = await loadCustomProviders();
  const filtered = list.filter((x) => x.provider !== providerId);
  await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(filtered));
}

/** 切换到某个已保存的供应商作为当前模型 */
export async function switchToProvider(p: CustomProvider): Promise<void> {
  await saveLocalLlm({
    provider: p.provider,
    model: p.model,
    apiKey: p.apiKey,
    baseUrl: p.baseUrl,
  });
}

/** 切换回服务器默认 */
export async function switchToDefault(): Promise<void> {
  await saveLocalLlm(DEFAULT_LOCAL_LLM);
}

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

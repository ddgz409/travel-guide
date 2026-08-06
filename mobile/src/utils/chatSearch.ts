/** AI 助手联网模式文案（与后端 chat_service.resolve_web_search_mode 一致） */

export type WebSearchPref = boolean | "auto" | "off" | "on";

export function resolveWebSearchMode(
  provider: string,
  pref: WebSearchPref = "auto",
): "zhipu_native" | "bing" | "off" {
  if (pref === false || pref === "off") return "off";
  if (pref === true || pref === "on") {
    return provider === "zhipu" ? "zhipu_native" : "bing";
  }
  return provider === "zhipu" ? "zhipu_native" : "bing";
}

export function getChatSearchSubtitle(
  provider: string,
  modelLabel: string,
  pref: WebSearchPref = "auto",
): string {
  const mode = resolveWebSearchMode(provider, pref);
  if (mode === "zhipu_native") return `${modelLabel} · 智谱联网搜索`;
  if (mode === "bing") return `${modelLabel} · 网页搜索`;
  return `${modelLabel} · 离线模式`;
}

import Constants from "expo-constants";

type Extra = {
  amapJsKey?: string;
  apiBase?: string;
};

function extra(): Extra {
  return (Constants.expoConfig?.extra || {}) as Extra;
}

/** 高德 JS API Key：优先环境变量，其次 app.config extra */
export function getAmapJsKey(): string {
  return (
    process.env.EXPO_PUBLIC_AMAP_JS_KEY ||
    extra().amapJsKey ||
    ""
  ).trim();
}

export function getApiBase(): string {
  return (
    process.env.EXPO_PUBLIC_API_BASE ||
    extra().apiBase ||
    ""
  ).trim();
}

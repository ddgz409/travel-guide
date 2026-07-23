import Constants from "expo-constants";

type Extra = {
  amapJsKey?: string;
  apiBase?: string;
};

function extra(): Extra {
  return (Constants.expoConfig?.extra || {}) as Extra;
}

// 生产服务器地址：extra 与环境变量都缺失时的安全兜底，
// 避免 APK 回退到 127.0.0.1 / 10.0.2.2 导致真机连不上后端。
const DEFAULT_API_BASE = "http://81.71.159.218:8000/api/v1";
const DEFAULT_AMAP_JS_KEY = "e2d15f867f9e7c13777ca47de260999b";

/** 高德 JS API Key：优先环境变量，其次 app.config extra */
export function getAmapJsKey(): string {
  return (
    process.env.EXPO_PUBLIC_AMAP_JS_KEY ||
    extra().amapJsKey ||
    DEFAULT_AMAP_JS_KEY
  ).trim();
}

export function getApiBase(): string {
  return (
    process.env.EXPO_PUBLIC_API_BASE ||
    extra().apiBase ||
    DEFAULT_API_BASE
  ).trim();
}

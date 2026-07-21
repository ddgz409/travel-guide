/** 高德 JS API 单例加载 */

declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: any;
    __amapLoading?: Promise<any>;
  }
}

const AMAP_JSAPI = "https://webapi.amap.com/maps?v=2.0&key=";

export function getAmapJsKey(): string {
  return process.env.NEXT_PUBLIC_AMAP_JS_KEY || "";
}

export function loadAmap(): Promise<any> {
  const key = getAmapJsKey();
  if (!key) return Promise.reject(new Error("未配置 NEXT_PUBLIC_AMAP_JS_KEY"));
  if (typeof window === "undefined") {
    return Promise.reject(new Error("仅浏览器可加载地图"));
  }
  if (window.AMap) return Promise.resolve(window.AMap);
  if (window.__amapLoading) return window.__amapLoading;

  window.__amapLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${AMAP_JSAPI}${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => resolve(window.AMap);
    script.onerror = () => reject(new Error("高德地图加载失败"));
    document.head.appendChild(script);
  });
  return window.__amapLoading;
}

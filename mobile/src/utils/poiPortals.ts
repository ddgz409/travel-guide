/** POI 详情页跳转：小红书 / 携程 / 去哪儿 */

import { Linking, Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { stringToBase64 } from "./base64";
import { openXiaohongshu } from "./openExternal";

export type PoiPortalKind = "attraction" | "meal" | "hotel" | "other";

function poiKeyword(city: string, name: string): string {
  const c = city.trim();
  const n = name.trim();
  return c ? `${c} ${n}` : n;
}

function xhsKeyword(city: string, name: string, kind: PoiPortalKind): string {
  const dest = city.trim() || "旅游";
  const poi = name.trim();
  if (kind === "meal") return `${dest} ${poi}`;
  if (kind === "hotel") return `${dest} ${poi} 酒店`;
  return `${dest} ${poi} 攻略`;
}

/** 已验证可访问的携程 H5 搜索页 */
export function ctripWebUrl(keyword: string, kind: PoiPortalKind): string {
  const enc = encodeURIComponent(keyword);
  if (kind === "hotel") {
    return `https://hotels.ctrip.com/hotels/list?keyword=${enc}`;
  }
  return `https://piao.ctrip.com/ticket/search?keyword=${enc}`;
}

/** 已验证可访问的去哪儿 H5 搜索页 */
export function qunarWebUrl(keyword: string, kind: PoiPortalKind): string {
  const enc = encodeURIComponent(keyword);
  if (kind === "hotel") {
    const city = keyword.trim().split(/\s+/)[0] || keyword.trim();
    return `https://touch.qunar.com/h5/hotel/hotellist?city=${encodeURIComponent(city)}`;
  }
  return `https://piao.qunar.com/ticket/list.htm?keyword=${enc}`;
}

/** 携程 App：用完整 H5 地址 base64 包一层（相对路径在新版 App 内易报「链接不存在」） */
export function ctripAppUrl(webUrl: string): string {
  return `ctrip://wireless/h5?url=${stringToBase64(webUrl)}&type=5`;
}

/** 去哪儿 App：hy 容器打开同上 H5 页 */
export function qunarAppUrl(webUrl: string): string {
  const scheme = Platform.OS === "ios" ? "qunariphone" : "qunaraphone";
  return `${scheme}://hy?url=${encodeURIComponent(webUrl)}`;
}

async function openWeb(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    await WebBrowser.openBrowserAsync(url);
  }
}

/**
 * 优先打开已验证的 HTTPS 页（系统/App Links 会拉起已安装 App）；
 * 再试 App 深链；最后内置浏览器兜底。
 */
async function openPortal(webUrl: string, appUrl: string): Promise<void> {
  try {
    await Linking.openURL(webUrl);
    return;
  } catch {
    /* 继续尝试 App 深链 */
  }

  try {
    await Linking.openURL(appUrl);
    return;
  } catch {
    /* 浏览器兜底 */
  }

  await WebBrowser.openBrowserAsync(webUrl);
}

export async function openCtripPoi(opts: {
  city: string;
  name: string;
  kind?: PoiPortalKind;
}): Promise<void> {
  const keyword = poiKeyword(opts.city, opts.name);
  const kind = opts.kind || "attraction";
  const web = ctripWebUrl(keyword, kind);
  await openPortal(web, ctripAppUrl(web));
}

export async function openQunarPoi(opts: {
  city: string;
  name: string;
  kind?: PoiPortalKind;
}): Promise<void> {
  const keyword = poiKeyword(opts.city, opts.name);
  const kind = opts.kind || "attraction";
  const web = qunarWebUrl(keyword, kind);
  await openPortal(web, qunarAppUrl(web));
}

export async function openXhsPoi(opts: {
  city: string;
  name: string;
  kind?: PoiPortalKind;
}): Promise<void> {
  const kind = opts.kind || "attraction";
  await openXiaohongshu({
    keyword: xhsKeyword(opts.city, opts.name, kind),
    title: opts.name,
  });
}

export function itemTypeToPortalKind(type: string): PoiPortalKind {
  if (type === "meal") return "meal";
  if (type === "hotel") return "hotel";
  if (type === "attraction") return "attraction";
  return "other";
}

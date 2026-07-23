/** 打开外链：小红书优先跳 App，失败再打开网页；其它用系统浏览器 */

import { Linking, Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";

function extractXhsKeyword(url: string, title?: string): string {
  try {
    const m = url.match(/[?&]keyword=([^&]+)/i);
    if (m?.[1]) return decodeURIComponent(m[1].replace(/\+/g, " "));
  } catch {
    /* ignore */
  }
  return (title || "旅游攻略").trim();
}

function isXhsUrl(url: string): boolean {
  return /xiaohongshu\.com|xhsdiscover:\/\/|xhsdiscovery:\/\//i.test(url);
}

/** 小红书：先试 App 深链，再打开 www 搜索页（系统浏览器，避免内置 WebView 空白） */
export async function openXiaohongshu(opts: {
  keyword?: string;
  webUrl?: string;
  title?: string;
  appUrl?: string;
}): Promise<void> {
  const keyword = (opts.keyword || opts.title || "旅游攻略").trim();
  const kw = encodeURIComponent(keyword);
  const web =
    opts.webUrl?.trim() ||
    `https://www.xiaohongshu.com/search_result?keyword=${kw}`;

  const schemes = [
    opts.appUrl,
    `xhsdiscover://search/result?keyword=${kw}`,
    `xhsdiscover://search_result?keyword=${kw}`,
    `xhsdiscovery://search/result?keyword=${kw}`,
  ].filter(Boolean) as string[];

  for (const scheme of schemes) {
    try {
      // Android 上 canOpenURL 常误报；直接 try open
      if (Platform.OS === "ios") {
        const ok = await Linking.canOpenURL(scheme);
        if (!ok) continue;
      }
      await Linking.openURL(scheme);
      return;
    } catch {
      /* try next */
    }
  }

  try {
    await Linking.openURL(web);
  } catch {
    await WebBrowser.openBrowserAsync(web);
  }
}

export async function openExternal(
  url: string,
  title?: string,
  meta?: { keyword?: string; app_url?: string; portal?: boolean } | null,
): Promise<void> {
  const u = (url || "").trim();
  if (!u) return;

  if (isXhsUrl(u) || meta?.app_url || meta?.keyword) {
    await openXiaohongshu({
      keyword: meta?.keyword || extractXhsKeyword(u, title),
      webUrl: u.startsWith("http") ? u : undefined,
      title,
      appUrl: meta?.app_url,
    });
    return;
  }

  try {
    await Linking.openURL(u);
  } catch {
    try {
      await WebBrowser.openBrowserAsync(u);
    } catch {
      /* ignore */
    }
  }
}

/** 分享链接：微信 / QQ / 复制 / 系统分享 */

import { Alert, Linking, Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";

export type ShareChoicePayload = {
  url: string;
  title?: string;
  message?: string;
};

export type ShareAppId = "weixin" | "qq" | "copy" | "more";

async function copyAndOpen(url: string, scheme: string, appName: string) {
  await Clipboard.setStringAsync(url);
  try {
    await Linking.openURL(scheme);
    Alert.alert("链接已复制", `已打开${appName}，长按输入框粘贴即可发送`);
  } catch {
    Alert.alert("链接已复制", `未检测到${appName}，可手动打开后粘贴发送`);
  }
}

export async function shareViaApp(
  id: ShareAppId,
  opts: ShareChoicePayload,
): Promise<void> {
  const url = opts.url.trim();
  if (!url) return;
  const title = opts.title || "分享";
  const message = opts.message || `${title}\n${url}`;

  if (id === "weixin") {
    await copyAndOpen(url, "weixin://", "微信");
    return;
  }
  if (id === "qq") {
    await copyAndOpen(
      url,
      Platform.OS === "ios" ? "mqq://" : "mqqwpa://",
      "QQ",
    );
    return;
  }
  if (id === "copy") {
    await Clipboard.setStringAsync(url);
    Alert.alert("已复制", url);
    return;
  }
  await Share.share({ message, url, title });
}

/** 无 UI 时的兜底（优先用 ShareChoiceSheet） */
export async function shareLinkToChoice(opts: ShareChoicePayload): Promise<void> {
  const url = opts.url.trim();
  if (!url) return;
  Alert.alert(opts.title || "分享链接", "选择分享方式", [
    {
      text: "微信",
      onPress: () => void shareViaApp("weixin", opts),
    },
    {
      text: "QQ",
      onPress: () => void shareViaApp("qq", opts),
    },
    {
      text: "更多",
      onPress: () => void shareViaApp("more", opts),
    },
  ]);
}

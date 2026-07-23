/** Android 侧载包：检查更新并引导下载安装 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Alert, Linking, Platform } from "react-native";
import type { AndroidUpdateInfo } from "@travel-guide/shared";
import { api } from "../api/client";

const SKIP_KEY = "travel_guide_skip_update_code";

export function currentVersionCode(): number {
  const n = Number(Constants.nativeBuildVersion || 0);
  if (Number.isFinite(n) && n > 0) return n;
  const fromConfig = Number(
    Constants.expoConfig?.android?.versionCode ||
      (Constants.expoConfig as { versionCode?: number } | null)?.versionCode ||
      0,
  );
  return Number.isFinite(fromConfig) ? fromConfig : 0;
}

export function currentVersionName(): string {
  return (
    Constants.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    "1.0.0"
  );
}

export type UpdateCheckResult =
  | { status: "unsupported" }
  | { status: "latest"; remote: AndroidUpdateInfo; localCode: number }
  | { status: "available"; remote: AndroidUpdateInfo; localCode: number }
  | { status: "error"; message: string };

export async function checkAndroidUpdate(): Promise<UpdateCheckResult> {
  if (Platform.OS !== "android") {
    return { status: "unsupported" };
  }
  try {
    const remote = await api.app.androidUpdate();
    const localCode = currentVersionCode();
    if (remote.versionCode > localCode) {
      return { status: "available", remote, localCode };
    }
    return { status: "latest", remote, localCode };
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : "检查更新失败",
    };
  }
}

export async function openApkDownload(apkUrl: string): Promise<void> {
  const ok = await Linking.canOpenURL(apkUrl);
  if (!ok) {
    throw new Error("无法打开下载链接");
  }
  await Linking.openURL(apkUrl);
}

/** 设置页：手动检查并弹窗 */
export async function promptCheckUpdate(): Promise<void> {
  const result = await checkAndroidUpdate();
  if (result.status === "unsupported") {
    Alert.alert("提示", "仅 Android 安装包支持检查更新");
    return;
  }
  if (result.status === "error") {
    Alert.alert("检查失败", result.message);
    return;
  }
  if (result.status === "latest") {
    Alert.alert(
      "已是最新",
      `当前版本 ${currentVersionName()} (${result.localCode})`,
    );
    return;
  }

  const { remote } = result;
  const buttons: Array<{
    text: string;
    style?: "cancel" | "destructive" | "default";
    onPress?: () => void;
  }> = [];
  if (!remote.force) {
    buttons.push({ text: "稍后", style: "cancel" });
  }
  buttons.push({
    text: "下载更新",
    onPress: () => {
      void openApkDownload(remote.apkUrl).catch((e) =>
        Alert.alert("打开失败", e instanceof Error ? e.message : "请稍后重试"),
      );
    },
  });

  Alert.alert(
    `发现新版本 ${remote.versionName}`,
    [
      `当前：${currentVersionName()} (${result.localCode})`,
      `最新：${remote.versionName} (${remote.versionCode})`,
      remote.notes ? `\n${remote.notes}` : "",
      remote.apkAvailable === false
        ? "\n（服务器尚未上传 APK 文件，链接可能暂时无效）"
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    buttons,
  );
}

/** 启动时：有更新则提示（可跳过同版本提醒一次） */
export async function maybePromptUpdateOnLaunch(): Promise<void> {
  if (Platform.OS !== "android") return;
  const result = await checkAndroidUpdate();
  if (result.status !== "available") return;

  const { remote } = result;
  try {
    const skipped = await AsyncStorage.getItem(SKIP_KEY);
    if (!remote.force && skipped === String(remote.versionCode)) return;
  } catch {
    /* ignore */
  }

  const buttons: Array<{
    text: string;
    style?: "cancel" | "default";
    onPress?: () => void;
  }> = [];
  if (!remote.force) {
    buttons.push({
      text: "稍后",
      style: "cancel",
      onPress: () => {
        void AsyncStorage.setItem(SKIP_KEY, String(remote.versionCode));
      },
    });
  }
  buttons.push({
    text: "下载更新",
    onPress: () => {
      void openApkDownload(remote.apkUrl).catch(() => undefined);
    },
  });

  Alert.alert(
    `发现新版本 ${remote.versionName}`,
    remote.notes || "请下载安装以获取最新功能与修复。",
    buttons,
  );
}

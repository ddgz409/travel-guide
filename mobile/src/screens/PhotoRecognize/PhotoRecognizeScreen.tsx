import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { VisionRecognizeResponse } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../../api/client";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { pickPhotoUri, takePhotoUri } from "../../utils/pickPhoto";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "PhotoRecognize">;

const KIND_LABELS: Record<VisionRecognizeResponse["kind"], string> = {
  scenery: "景点",
  hotel: "酒店",
  ticket: "车票",
  map: "地图",
  food: "美食",
  other: "其他",
};

export function PhotoRecognizeScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [uri, setUri] = useState<string | null>(route.params?.uri ?? null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VisionRecognizeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /** 识别结果的纯文本（复制用） */
  const resultText = result
    ? [
        `【图片识别】${result.title || "未知地点"}（${KIND_LABELS[result.kind]}）`,
        result.description,
        result.highlights.length ? `亮点：${result.highlights.join("；")}` : "",
        result.tips.length ? `提示：${result.tips.join("；")}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  /** 发给 AI 助手的行程规划请求（预填输入框，用户确认后发送） */
  function sendToAssistant() {
    if (!result) return;
    const dest = result.title ? `「${result.title}」` : "";
    const info = [
      result.description,
      result.highlights.length ? `亮点：${result.highlights.join("；")}` : "",
      result.tips.length ? `信息：${result.tips.join("；")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    navigation.navigate("Chat", {
      prefillMessage: `我想去${dest}玩，请根据下面的信息帮我安排一份行程攻略：\n${info}`,
    });
  }

  async function copyText() {
    try {
      await Clipboard.setStringAsync(resultText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      Alert.alert("复制失败", "请长按文字手动复制");
    }
  }

  const recognize = useCallback(async (u: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // 把本地图片读成 base64，走普通 JSON 接口上传（与其他接口同通道）
      let b64: string;
      try {
        b64 = await FileSystem.readAsStringAsync(u, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch (readErr) {
        throw new ApiError(
          `无法读取图片文件(${readErr instanceof Error ? readErr.message : readErr})`,
          0,
        );
      }
      const res = await api.vision.recognizeBase64(b64);
      setResult(res);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 404) {
          setError("识别功能尚未部署到服务器（后端需更新），请稍后重试");
        } else if (e.status === 0) {
          setError(e.message || "无法连接服务器：请确认后端已启动，且手机能访问服务器地址");
        } else {
          setError(e.message);
        }
      } else {
        setError(e instanceof Error ? e.message : "识别失败，请稍后重试");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // 从聊天相机按钮带图进入时自动识别
  const initialUri = route.params?.uri;
  useEffect(() => {
    if (initialUri && !result && !loading) {
      void recognize(initialUri);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUri]);

  async function fromCamera() {
    const u = await takePhotoUri();
    if (u) {
      setUri(u);
      setResult(null);
      setError(null);
      void recognize(u);
    }
  }

  async function fromLibrary() {
    const u = await pickPhotoUri();
    if (u) {
      setUri(u);
      setResult(null);
      setError(null);
      void recognize(u);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>拍照识景</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: colors.brand }]}
          onPress={fromCamera}
          disabled={loading}
        >
          <Text style={styles.actionText}>📷 拍照</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: colors.brandSoft }]}
          onPress={fromLibrary}
          disabled={loading}
        >
          <Text style={[styles.actionText, styles.actionTextAlt]}>🖼 相册选图</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {uri ? (
          <Image source={{ uri }} style={styles.preview} resizeMode="cover" />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              拍一张景点 / 美食照片，或选择酒店、车票、地图的截图，AI 帮你识别。
            </Text>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.brand} size="large" />
            <Text style={styles.loadingText}>AI 识别中…</Text>
          </View>
        ) : null}

        {error && !loading ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            {uri ? (
              <Pressable style={styles.retryBtn} onPress={() => recognize(uri)}>
                <Text style={styles.retryText}>重试</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {result && !loading ? (
          <View style={styles.card}>
            <View style={styles.kindRow}>
              <View style={styles.kindBadge}>
                <Text style={styles.kindText}>
                  {KIND_LABELS[result.kind] || "其他"}
                </Text>
              </View>
              <Text style={styles.cardTitle}>{result.title || "识别结果"}</Text>
            </View>
            {result.description ? (
              <Text style={styles.desc}>{result.description}</Text>
            ) : null}
            {result.highlights.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>亮点 / 关键信息</Text>
                {result.highlights.map((h, i) => (
                  <Text key={i} style={styles.bullet}>
                    · {h}
                  </Text>
                ))}
              </View>
            ) : null}
            {result.tips.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>建议</Text>
                {result.tips.map((t, i) => (
                  <Text key={i} style={styles.bullet}>
                    · {t}
                  </Text>
                ))}
              </View>
            ) : null}
            <View style={localStyles.actionRow}>
              <Pressable style={localStyles.copyBtn} onPress={copyText}>
                <Text style={localStyles.copyText}>
                  {copied ? "已复制 ✓" : "复制文字"}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  localStyles.planBtn,
                  result.kind === "other" && localStyles.planBtnMuted,
                ]}
                onPress={sendToAssistant}
              >
                <Text style={localStyles.planText}>发给 AI 助手安排行程</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const localStyles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  copyBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  copyText: { fontSize: 13, color: colors.ink, fontWeight: "600" },
  planBtn: {
    flex: 1,
    backgroundColor: colors.brand,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  planBtnMuted: { opacity: 0.85 },
  planText: { fontSize: 13, color: "#fff", fontWeight: "700" },
});

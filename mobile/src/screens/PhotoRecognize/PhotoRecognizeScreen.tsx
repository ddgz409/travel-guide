import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

  const recognize = useCallback(async (u: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.vision.recognize(u);
      setResult(res);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 404) {
          setError("识别功能尚未部署到服务器（后端需更新），请稍后重试");
        } else if (e.status === 0) {
          setError("无法连接服务器：请确认后端已启动，且手机能访问服务器地址");
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
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

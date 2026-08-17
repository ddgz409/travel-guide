import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import {
  currentVersionCode,
  currentVersionName,
  promptCheckUpdate,
} from "../../utils/appUpdate";
import {
  loadLocationConsent,
  saveLocationConsent,
  type LocationConsent,
} from "../../utils/locationPrefs";
import { FadeSlideIn } from "../../utils/motion";
import type { AppStackParamList } from "../../navigation/types";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "Settings">;

export function SettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [locationConsent, setLocationConsent] =
    useState<LocationConsent>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadLocationConsent()
      .then((consent) => {
        if (!cancelled) setLocationConsent(consent);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function setLocationEnabled(enabled: boolean) {
    if (enabled) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("系统未授权", "请在系统设置中允许定位权限。");
        await saveLocationConsent("denied");
        setLocationConsent("denied");
        return;
      }
      await saveLocationConsent("granted");
      setLocationConsent("granted");
    } else {
      await saveLocationConsent("denied");
      setLocationConsent("denied");
    }
  }

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 8) }]}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.headTitle}>设置</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 40) },
        ]}
      >
        <FadeSlideIn delay={40}>
          <View style={styles.locCard}>
            <Text style={styles.locTitle}>地图定位</Text>
            <Text style={styles.locSub}>
              开启后，可在全屏地图中显示你的当前位置。首次使用会弹窗询问。
            </Text>
            <View style={styles.locRow}>
              <Text style={styles.locStatus}>
                {locationConsent === "granted"
                  ? "已允许"
                  : locationConsent === "denied"
                    ? "已关闭"
                    : "尚未设置"}
              </Text>
              <Pressable
                style={[
                  styles.locBtn,
                  locationConsent === "granted" && styles.locBtnOff,
                ]}
                onPress={() =>
                  void setLocationEnabled(locationConsent !== "granted")
                }
              >
                <Text
                  style={[
                    styles.locBtnText,
                    locationConsent === "granted" && styles.locBtnTextOff,
                  ]}
                >
                  {locationConsent === "granted" ? "关闭定位" : "开启定位"}
                </Text>
              </Pressable>
            </View>
          </View>
        </FadeSlideIn>

        <FadeSlideIn delay={90}>
          <View style={styles.locCard}>
            <Text style={styles.locTitle}>应用更新</Text>
            <Text style={styles.locSub}>
              当前版本 {currentVersionName()}（{currentVersionCode() || "-"}
              ）。有新版本时可下载安装包更新。
            </Text>
            <View style={styles.locRow}>
              <Text style={styles.locStatus}>检查服务器版本</Text>
              <Pressable
                style={[styles.locBtn, checkingUpdate && { opacity: 0.7 }]}
                disabled={checkingUpdate}
                onPress={() => {
                  setCheckingUpdate(true);
                  void promptCheckUpdate().finally(() =>
                    setCheckingUpdate(false),
                  );
                }}
              >
                {checkingUpdate ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.locBtnText}>检查更新</Text>
                )}
              </Pressable>
            </View>
          </View>
        </FadeSlideIn>

        <FadeSlideIn delay={140}>
          <View style={styles.locCard}>
            <Text style={styles.locTitle}>管理模型</Text>
            <Text style={styles.locSub}>
              添加自定义 LLM 供应商，配置 API Key 和模型。
            </Text>
            <View style={styles.locRow}>
              <Text style={styles.locStatus}>AI 助手 / 攻略生成</Text>
              <Pressable
                style={styles.locBtn}
                onPress={() => navigation.navigate("ModelManage")}
              >
                <Text style={styles.locBtnText}>去管理</Text>
              </Pressable>
            </View>
          </View>
        </FadeSlideIn>
      </ScrollView>
    </View>
  );
}

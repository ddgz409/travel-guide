import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { buildAmapHtml, type MapMarker } from "../amapHtml";
import { getAmapJsKey } from "../config";
import {
  describeLocationError,
  getDeviceLocation,
} from "../getDeviceLocation";
import {
  loadLocationConsent,
  saveLocationConsent,
} from "../locationPrefs";
import type { AppStackParamList } from "../navigation/types";
import { colors } from "../theme";

type Props = NativeStackScreenProps<AppStackParamList, "MapFull">;

export function MapFullScreen({ route }: Props) {
  const { title, markers, polyline } = route.params;
  const amapKey = getAmapJsKey();
  const webRef = useRef<WebView>(null);
  const [locating, setLocating] = useState(false);
  const mapReadyRef = useRef(false);

  const html = useMemo(() => {
    if (!amapKey) return "";
    mapReadyRef.current = false;
    return buildAmapHtml({
      key: amapKey,
      markers: markers || [],
      polyline: polyline || [],
      interactive: true,
    });
  }, [amapKey, markers, polyline]);

  const inject = useCallback((js: string) => {
    webRef.current?.injectJavaScript(`${js}; true;`);
  }, []);

  const requestAndShowLocation = useCallback(async () => {
    setLocating(true);
    try {
      let consent = await loadLocationConsent();
      if (consent === null) {
        const choice = await new Promise<"granted" | "denied">((resolve) => {
          Alert.alert(
            "定位权限",
            "是否允许旅迹获取你的位置，用于在地图上显示当前位置？可稍后在设置中修改。",
            [
              {
                text: "不允许",
                style: "cancel",
                onPress: () => resolve("denied"),
              },
              { text: "允许", onPress: () => resolve("granted") },
            ],
          );
        });
        await saveLocationConsent(choice);
        consent = choice;
      }
      if (consent !== "granted") {
        Alert.alert("未开启定位", "可在「设置」中打开定位权限后再试。");
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        await saveLocationConsent("denied");
        Alert.alert(
          "系统未授权",
          "请在系统设置里允许「Expo Go / 旅迹」使用位置信息。",
        );
        return;
      }
      await saveLocationConsent("granted");
      const { lng, lat } = await getDeviceLocation();
      if (!mapReadyRef.current) {
        // 地图脚本可能尚未 boot，稍等再注入
        await new Promise((r) => setTimeout(r, 600));
      }
      inject(
        `window.setUserLocation && window.setUserLocation(${lng},${lat},true)`,
      );
    } catch (e) {
      Alert.alert("定位失败", describeLocationError(e));
    } finally {
      setLocating(false);
    }
  }, [inject]);

  if (!amapKey) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>地图未配置</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://webapi.amap.com" }}
        style={styles.map}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg?.type === "ready") mapReadyRef.current = true;
          } catch {
            /* ignore */
          }
        }}
        onLoadEnd={() => {
          // HTML 载入后稍晚才有 AMap boot；给一点缓冲
          setTimeout(() => {
            mapReadyRef.current = true;
          }, 800);
        }}
      />

      <View style={styles.controls} pointerEvents="box-none">
        <Pressable
          style={styles.ctrlBtn}
          onPress={() => inject("window.zoomIn && window.zoomIn()")}
        >
          <Text style={styles.ctrlText}>＋</Text>
        </Pressable>
        <Pressable
          style={styles.ctrlBtn}
          onPress={() => inject("window.zoomOut && window.zoomOut()")}
        >
          <Text style={styles.ctrlText}>－</Text>
        </Pressable>
        <Pressable
          style={[styles.ctrlBtn, styles.locateBtn]}
          onPress={() => void requestAndShowLocation()}
          disabled={locating}
        >
          {locating ? (
            <ActivityIndicator color="#1a66ff" />
          ) : (
            <Text style={styles.locateText}>定位</Text>
          )}
        </Pressable>
      </View>

      {title ? (
        <View style={styles.titleChip} pointerEvents="none">
          <Text style={styles.titleText} numberOfLines={1}>
            {title}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// re-export type for navigation params typing convenience
export type { MapMarker };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#eef2f7" },
  map: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  hint: { color: colors.muted },
  controls: {
    position: "absolute",
    right: 14,
    bottom: 36,
    gap: 8,
  },
  ctrlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  ctrlText: { fontSize: 22, fontWeight: "700", color: colors.ink, lineHeight: 24 },
  locateBtn: { marginTop: 4 },
  locateText: { fontSize: 12, fontWeight: "800", color: "#1a66ff" },
  titleChip: {
    position: "absolute",
    top: 12,
    left: 14,
    right: 70,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  titleText: { fontSize: 13, fontWeight: "700", color: colors.ink },
});

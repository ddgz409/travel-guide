import React, { useCallback, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WebView } from "react-native-webview";
import { buildAmapHtml, type MapMarker } from "../../utils/amapHtml";
import { getAmapJsKey } from "../../api/config";
import { useMapLocation } from "../../hooks/useMapLocation";
import type { AppStackParamList } from "../../navigation/types";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "MapFull">;

export function MapFullScreen({ route }: Props) {
  const { title, markers, polyline } = route.params;
  const amapKey = getAmapJsKey();
  const webRef = useRef<WebView>(null);
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

  const { locating, requestAndShowLocation } = useMapLocation(
    inject,
    mapReadyRef,
    "地图",
  );

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

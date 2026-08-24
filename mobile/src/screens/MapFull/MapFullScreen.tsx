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
import { buildMapUserLocationJs } from "../../utils/mapUserLocation";
import { useMapLocation } from "../../hooks/useMapLocation";
import { MapLocateIcon } from "../../components/MapLocateIcon";
import { getAmapJsKey } from "../../api/config";
import type { AppStackParamList } from "../../navigation/types";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "MapFull">;

export function MapFullScreen({ route }: Props) {
  const { title, markers, polyline, polylines, userLocation } = route.params;
  const amapKey = getAmapJsKey();
  const webRef = useRef<WebView>(null);
  const mapReadyRef = useRef(false);

  // 多段折线优先；旧调用方只传单条 polyline 时退化为一组
  const groups = useMemo(() => {
    if (polylines && polylines.length)
      return polylines.filter((g) => g && g.length > 1);
    return polyline && polyline.length > 1 ? [polyline] : [];
  }, [polylines, polyline]);

  const html = useMemo(() => {
    if (!amapKey) return "";
    mapReadyRef.current = false;
    return buildAmapHtml({
      key: amapKey,
      markers: markers || [],
      polylines: groups,
      interactive: true,
      userLocation: userLocation ?? null,
      linkMarkers: false,
    });
  }, [amapKey, markers, groups, userLocation]);

  const inject = useCallback((js: string) => {
    webRef.current?.injectJavaScript(`${js}; true;`);
  }, []);

  const showUserOnMap = useCallback(() => {
    if (!userLocation) return;
    inject(
      buildMapUserLocationJs(userLocation.lng, userLocation.lat, {
        accuracy: userLocation.accuracy ?? undefined,
      }),
    );
  }, [inject, userLocation]);

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
            if (msg?.type === "ready") {
              mapReadyRef.current = true;
              showUserOnMap();
            }
          } catch {
            /* ignore */
          }
        }}
        onLoadEnd={() => {
          // HTML 载入后稍晚才有 AMap boot；给一点缓冲
          setTimeout(() => {
            mapReadyRef.current = true;
            showUserOnMap();
          }, 800);
        }}
      />

      <View style={styles.controls} pointerEvents="box-none">
        <Pressable
          style={[styles.ctrlBtn, styles.locateBtn]}
          onPress={() => void requestAndShowLocation()}
          disabled={locating}
        >
          {locating ? (
            <ActivityIndicator color="#1a66ff" />
          ) : (
            <MapLocateIcon size={18} color="#1a66ff" />
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

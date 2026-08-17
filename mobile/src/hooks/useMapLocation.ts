/**
 * 地图定位 hook：合并 TransportRouteSheet 与 MapFullScreen 中近乎逐字重复的
 * requestAndShowLocation 逻辑（权限询问 → 定位 → 注入坐标到 WebView）。
 */

import { useCallback, useState } from "react";
import { Alert } from "react-native";
import {
  describeLocationError,
  ensureLocationAccess,
  getFreshDeviceLocation,
  peekCachedAccuracy,
  type LatLng,
} from "../utils/location";
import { buildMapUserLocationJs } from "../utils/mapUserLocation";

type InjectFn = (js: string) => void;
type MapReadyRef = { current: boolean };

export function useMapLocation(
  inject: InjectFn,
  mapReadyRef: MapReadyRef,
  scopeLabel: string,
  onLocated?: (loc: LatLng) => void,
) {
  const [locating, setLocating] = useState(false);

  const requestAndShowLocation = useCallback(async () => {
    setLocating(true);
    try {
      const ok = await ensureLocationAccess(async () =>
        new Promise<"granted" | "denied">((resolve) => {
          Alert.alert(
            "定位权限",
            `是否允许知径获取你的位置，用于在${scopeLabel}上显示当前位置？可稍后在设置中修改。`,
            [
              {
                text: "不允许",
                style: "cancel",
                onPress: () => resolve("denied"),
              },
              { text: "允许", onPress: () => resolve("granted") },
            ],
          );
        }),
      );
      if (!ok) {
        Alert.alert("未开启定位", "可在「设置」中打开定位权限后再试。");
        return;
      }
      const loc = await getFreshDeviceLocation();
      onLocated?.(loc);
      if (!mapReadyRef.current) {
        await new Promise((r) => setTimeout(r, 600));
      }
      inject(
        buildMapUserLocationJs(loc.lng, loc.lat, {
          center: true,
          zoom: 15,
          accuracy: peekCachedAccuracy(),
        }),
      );
    } catch (e) {
      Alert.alert("定位失败", describeLocationError(e));
    } finally {
      setLocating(false);
    }
  }, [inject, mapReadyRef, scopeLabel, onLocated]);

  return { locating, requestAndShowLocation };
}

/**
 * 地图定位 hook：合并 TransportRouteSheet 与 MapFullScreen 中近乎逐字重复的
 * requestAndShowLocation 逻辑（权限询问 → 定位 → 注入坐标到 WebView）。
 */

import { useCallback, useState } from "react";
import { Alert } from "react-native";
import * as Location from "expo-location";
import {
  describeLocationError,
  getDeviceLocation,
} from "../utils/location";
import {
  loadLocationConsent,
  saveLocationConsent,
} from "../utils/locationPrefs";

type InjectFn = (js: string) => void;
type MapReadyRef = { current: boolean };

export function useMapLocation(
  inject: InjectFn,
  mapReadyRef: MapReadyRef,
  scopeLabel: string,
) {
  const [locating, setLocating] = useState(false);

  const requestAndShowLocation = useCallback(async () => {
    setLocating(true);
    try {
      let consent = await loadLocationConsent();
      if (consent === null) {
        const choice = await new Promise<"granted" | "denied">((resolve) => {
          Alert.alert(
            "定位权限",
            `是否允许旅迹获取你的位置，用于在${scopeLabel}上显示当前位置？可稍后在设置中修改。`,
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
          "请在系统设置里允许「旅迹」使用位置信息。",
        );
        return;
      }
      await saveLocationConsent("granted");
      const { lng, lat } = await getDeviceLocation();
      if (!mapReadyRef.current) {
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
  }, [inject, mapReadyRef, scopeLabel]);

  return { locating, requestAndShowLocation };
}

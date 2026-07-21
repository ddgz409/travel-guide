import * as Location from "expo-location";

export type LatLng = { lng: number; lat: number };

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** 尽量拿到当前位置：先缓存，再实时；超时则友好报错 */
export async function getDeviceLocation(): Promise<LatLng> {
  const enabled = await Location.hasServicesEnabledAsync();
  if (!enabled) {
    throw new Error("系统定位服务未开启，请打开手机的「位置信息 / GPS」后再试");
  }

  try {
    // Android：引导打开高精度 / 网络定位，提高成功率
    await Location.enableNetworkProviderAsync();
  } catch {
    /* 用户取消或非 Android，忽略 */
  }

  const last = await Location.getLastKnownPositionAsync({
    maxAge: 1000 * 60 * 10,
    requiredAccuracy: 500,
  });
  if (last?.coords) {
    return {
      lng: last.coords.longitude,
      lat: last.coords.latitude,
    };
  }

  try {
    const pos = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        mayShowUserSettingsDialog: true,
      }),
      15000,
      "获取位置超时，请到开阔处重试，或确认已开启定位服务",
    );
    return {
      lng: pos.coords.longitude,
      lat: pos.coords.latitude,
    };
  } catch (first) {
    // 再降精度试一次（部分安卓机高精度会一直转圈）
    try {
      const pos = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
          mayShowUserSettingsDialog: true,
        }),
        12000,
        "获取位置超时，请到开阔处重试，或确认已开启定位服务",
      );
      return {
        lng: pos.coords.longitude,
        lat: pos.coords.latitude,
      };
    } catch {
      throw first instanceof Error
        ? first
        : new Error("无法获取当前位置，请检查定位权限与网络");
    }
  }
}

export function describeLocationError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e || "");
  const lower = msg.toLowerCase();
  if (/timeout|超时/.test(lower) || /timed?\s*out/.test(lower)) {
    return "获取位置超时。请确认手机已开定位，并尽量在室外/窗边再试。";
  }
  if (/disabled|未开启|location.?service|provider/.test(lower)) {
    return "系统定位服务未开启，请打开手机的「位置信息 / GPS」。";
  }
  if (/permission|denied|授权|权限/.test(lower)) {
    return "没有定位权限，请在系统设置中允许旅迹（或 Expo Go）使用位置。";
  }
  if (/unavailable|unable|无法/.test(lower)) {
    return "当前无法定位。请检查网络与定位开关后重试。";
  }
  return msg || "定位失败，请稍后重试";
}

import * as Location from "expo-location";
import {
  loadLocationConsent,
  saveLocationConsent,
} from "./locationPrefs";

export type LatLng = { lng: number; lat: number };

type LocationCache = { loc: LatLng; city?: string; at: number; accuracy?: number };

let memCache: LocationCache | null = null;

/** 自动定位可复用的内存缓存时长（主动点「定位」会强制刷新） */
const AUTO_CACHE_MS = 1000 * 60 * 2;
/** 系统 lastKnown 可接受的最大误差（米） */
const LAST_KNOWN_MAX_ACCURACY_M = 80;
/** 系统 lastKnown 最大年龄 */
const LAST_KNOWN_MAX_AGE_MS = 1000 * 60 * 5;

/** 读取内存里的最近一次定位（首页成功后会被写入） */
export function peekCachedLocation(maxAgeMs = 1000 * 60 * 30): LatLng | null {
  if (!memCache || Date.now() - memCache.at > maxAgeMs) return null;
  return memCache.loc;
}

export function peekCachedCity(maxAgeMs = 1000 * 60 * 30): string | undefined {
  if (!memCache || Date.now() - memCache.at > maxAgeMs) return undefined;
  return memCache.city;
}

export function rememberLocation(loc: LatLng, city?: string, accuracy?: number) {
  memCache = {
    loc,
    city: city ?? memCache?.city,
    at: Date.now(),
    accuracy: accuracy ?? memCache?.accuracy,
  };
}

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

function locFromPosition(pos: Location.LocationObject): LatLng {
  return { lng: pos.coords.longitude, lat: pos.coords.latitude };
}

function rememberFromPosition(pos: Location.LocationObject, city?: string): LatLng {
  const loc = locFromPosition(pos);
  rememberLocation(loc, city, pos.coords.accuracy ?? undefined);
  return loc;
}

async function getCurrentPosition(
  accuracy: Location.Accuracy,
  timeoutMs: number,
): Promise<Location.LocationObject> {
  return withTimeout(
    Location.getCurrentPositionAsync({
      accuracy,
      mayShowUserSettingsDialog: true,
    }),
    timeoutMs,
    "获取位置超时，请到开阔处重试，或确认已开启定位服务",
  );
}

async function tryLastKnown(maxAgeMs: number, requiredAccuracy: number): Promise<LatLng | null> {
  const last = await Location.getLastKnownPositionAsync({
    maxAge: maxAgeMs,
    requiredAccuracy,
  });
  if (!last?.coords) return null;
  return rememberFromPosition(last);
}

/**
 * 统一权限流程：与探索页一致，始终尝试申请系统定位权限。
 * prompt 仅在用户主动点「定位」时传入，用于 App 内首次确认。
 */
export async function ensureLocationAccess(
  prompt?: () => Promise<"granted" | "denied">,
): Promise<boolean> {
  let consent = await loadLocationConsent();
  if (consent === null && prompt) {
    consent = await prompt();
    await saveLocationConsent(consent);
  }
  if (consent === "denied") return false;

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    await saveLocationConsent("denied");
    return false;
  }
  await saveLocationConsent("granted");
  return true;
}

/** 尽量拿到当前位置：短缓存 → 高精度实时；超时则友好报错 */
export async function getDeviceLocation(): Promise<LatLng> {
  const cached = peekCachedLocation(AUTO_CACHE_MS);
  if (cached) return cached;

  return readDeviceLocation(false);
}

/** 用户主动点「定位」：跳过缓存，重新读取高精度 GPS */
export async function getFreshDeviceLocation(): Promise<LatLng> {
  return readDeviceLocation(true);
}

async function readDeviceLocation(fresh: boolean): Promise<LatLng> {
  const enabled = await Location.hasServicesEnabledAsync();
  if (!enabled) {
    throw new Error("系统定位服务未开启，请打开手机的「位置信息 / GPS」后再试");
  }

  try {
    await Location.enableNetworkProviderAsync();
  } catch {
    /* 用户取消或非 Android，忽略 */
  }

  if (!fresh) {
    const last = await tryLastKnown(LAST_KNOWN_MAX_AGE_MS, LAST_KNOWN_MAX_ACCURACY_M);
    if (last) return last;
  }

  const primaryAccuracy = fresh
    ? Location.Accuracy.BestForNavigation
    : Location.Accuracy.High;
  const primaryTimeout = fresh ? 28000 : 20000;

  try {
    const pos = await getCurrentPosition(primaryAccuracy, primaryTimeout);
    return rememberFromPosition(pos);
  } catch (first) {
    try {
      const pos = await getCurrentPosition(
        fresh ? Location.Accuracy.High : Location.Accuracy.Balanced,
        fresh ? 22000 : 15000,
      );
      return rememberFromPosition(pos);
    } catch {
      const last = await tryLastKnown(
        fresh ? 1000 * 60 * 2 : LAST_KNOWN_MAX_AGE_MS,
        fresh ? 120 : LAST_KNOWN_MAX_ACCURACY_M,
      );
      if (last) return last;

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

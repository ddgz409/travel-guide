/** 旅行地图：各省一张相册照片（本地存储） */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Paths } from "expo-file-system";
import {
  copyAsync,
  deleteAsync,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  EncodingType,
} from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

const KEY = "travel_guide_map_photos:v1";
const THUMB_EDGE = 480;

type Store = Record<string, string>;

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) {
    fn();
  }
}

export function subscribeMapPhotos(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function photosDir(): string {
  return `${Paths.document.uri}map-province-photos/`;
}

async function ensureDir(): Promise<void> {
  await makeDirectoryAsync(photosDir(), { intermediates: true });
}

function normalizeEntry(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (Array.isArray(value) && typeof value[0] === "string" && value[0]) {
    return value[0];
  }
  return null;
}

async function readStore(): Promise<Store> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Store = {};
    for (const [key, value] of Object.entries(parsed)) {
      const uri = normalizeEntry(value);
      if (uri) out[key] = uri;
    }
    return out;
  } catch {
    return {};
  }
}

async function writeStore(store: Store): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(store));
}

export async function getProvincePhotoUri(provinceKey: string): Promise<string | null> {
  const store = await readStore();
  const uri = store[provinceKey];
  if (!uri) return null;
  const info = await getInfoAsync(uri);
  return info.exists ? uri : null;
}

export async function getAllProvincePhotos(): Promise<Store> {
  const store = await readStore();
  const out: Store = {};
  for (const [key, uri] of Object.entries(store)) {
    const info = await getInfoAsync(uri);
    if (info.exists) out[key] = uri;
  }
  return out;
}

async function persistThumb(sourceUri: string, destUri: string): Promise<string> {
  const processed = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: THUMB_EDGE } }],
    { compress: 0.78, format: ImageManipulator.SaveFormat.JPEG },
  );
  const existing = await getInfoAsync(destUri);
  if (existing.exists) {
    await deleteAsync(destUri, { idempotent: true });
  }
  await copyAsync({ from: processed.uri, to: destUri });
  return destUri;
}

export async function setProvincePhoto(
  provinceKey: string,
  pickedUri: string,
): Promise<string | null> {
  await ensureDir();
  const store = await readStore();
  const prev = store[provinceKey];
  if (prev) {
    const info = await getInfoAsync(prev);
    if (info.exists) {
      await deleteAsync(prev, { idempotent: true });
    }
  }

  const dest = `${photosDir()}${provinceKey}.jpg`;
  store[provinceKey] = await persistThumb(pickedUri, dest);
  await writeStore(store);
  notify();
  return store[provinceKey];
}

export async function clearProvincePhotos(provinceKey: string): Promise<void> {
  const store = await readStore();
  const uri = store[provinceKey];
  if (uri) {
    const info = await getInfoAsync(uri);
    if (info.exists) {
      await deleteAsync(uri, { idempotent: true });
    }
  }
  delete store[provinceKey];
  await writeStore(store);
  notify();
}

/** WebView 内嵌用 data URI */
export async function uriToDataUri(uri: string): Promise<string | null> {
  try {
    const info = await getInfoAsync(uri);
    if (!info.exists) return null;
    const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
    return `data:image/jpeg;base64,${base64}`;
  } catch {
    return null;
  }
}

export async function buildProvincePhotoDataUris(
  store: Store,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, uri] of Object.entries(store)) {
    const data = await uriToDataUri(uri);
    if (data) out[key] = data;
  }
  return out;
}

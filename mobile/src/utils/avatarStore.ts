/** 用户头像（本地相册导入，按 userId 存储） */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Paths } from "expo-file-system";
import {
  copyAsync,
  deleteAsync,
  getInfoAsync,
  makeDirectoryAsync,
} from "expo-file-system/legacy";
import { prepareSquareAvatar, type AvatarCropRect } from "./avatarImage";

const KEY = "travel_guide_avatars:v1";
const GUEST_ID = "guest";

type AvatarMap = Record<string, string>;

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) {
    fn();
  }
}

export function subscribeAvatars(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function readMap(): Promise<AvatarMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AvatarMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(map: AvatarMap): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(map));
}

function avatarsDirUri(): string {
  return `${Paths.document.uri}avatars/`;
}

function avatarUriFor(userId: string): string {
  return `${avatarsDirUri()}${userId}.jpg`;
}

async function ensureAvatarsDir(): Promise<void> {
  await makeDirectoryAsync(avatarsDirUri(), { intermediates: true });
}

/** 读取已保存头像；无则 null */
export async function getAvatarUri(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const map = await readMap();
  const uri = map[userId];
  if (!uri) return null;
  const info = await getInfoAsync(uri);
  return info.exists ? uri : null;
}

export function guestAvatarUserId(): string {
  return GUEST_ID;
}

/** 从相册 URI 持久化头像，返回本地 file:// 路径 */
export async function setAvatarFromPicker(
  userId: string,
  pickedUri: string,
  crop?: AvatarCropRect,
): Promise<string> {
  await ensureAvatarsDir();
  const destUri = avatarUriFor(userId);
  const existing = await getInfoAsync(destUri);
  if (existing.exists) {
    await deleteAsync(destUri, { idempotent: true });
  }

  const processed = await prepareSquareAvatar(pickedUri, crop);
  await copyAsync({ from: processed, to: destUri });

  const map = await readMap();
  map[userId] = destUri;
  await writeMap(map);
  notify();
  return destUri;
}

export async function clearAvatar(userId: string): Promise<void> {
  const map = await readMap();
  const uri = map[userId];
  if (uri) {
    const info = await getInfoAsync(uri);
    if (info.exists) {
      await deleteAsync(uri, { idempotent: true });
    }
  }
  delete map[userId];
  await writeMap(map);
  notify();
}

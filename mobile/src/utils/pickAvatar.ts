import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  clearAvatar,
  getAvatarUri,
  guestAvatarUserId,
  setAvatarFromPicker,
} from "./avatarStore";
import type { AvatarCropRect } from "./avatarImage";

export async function pickAvatarSourceUri(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("无法访问相册", "请在系统设置中允许知径访问照片。");
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: 1,
  });

  if (result.canceled || !result.assets[0]?.uri) {
    return null;
  }

  return result.assets[0].uri;
}

export async function saveAvatarFromSource(
  userId: string,
  sourceUri: string,
  crop?: AvatarCropRect,
): Promise<string> {
  try {
    return await setAvatarFromPicker(userId, sourceUri, crop);
  } catch (e) {
    Alert.alert("设置头像失败", e instanceof Error ? e.message : "请稍后重试");
    throw e;
  }
}

export async function loadAvatarUri(
  userId: string | null | undefined,
  isGuest: boolean,
): Promise<string | null> {
  if (userId) {
    return getAvatarUri(userId);
  }
  if (isGuest) {
    return getAvatarUri(guestAvatarUserId());
  }
  return null;
}

export async function removeAvatar(
  userId: string | null | undefined,
  isGuest: boolean,
): Promise<void> {
  const id = userId || (isGuest ? guestAvatarUserId() : null);
  if (!id) return;
  await clearAvatar(id);
}

export { guestAvatarUserId };

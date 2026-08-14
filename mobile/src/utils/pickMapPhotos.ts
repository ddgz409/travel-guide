import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";

export async function pickMapPhotoFromLibrary(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("无法访问相册", "请在系统设置中允许旅迹访问照片。");
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    allowsMultipleSelection: false,
    quality: 0.85,
  });

  if (result.canceled || !result.assets.length) {
    return null;
  }

  return result.assets[0]?.uri ?? null;
}

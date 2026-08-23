import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";

/** 拍照识景：相机拍照，返回图片 uri；拒绝权限或取消返回 null */
export async function takePhotoUri(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("无法使用相机", "请在系统设置中允许知径访问相机。");
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.9,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  return result.assets[0].uri;
}

/** 拍照识景：相册选图，返回图片 uri；拒绝权限或取消返回 null */
export async function pickPhotoUri(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("无法访问相册", "请在系统设置中允许知径访问照片。");
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.9,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  return result.assets[0].uri;
}

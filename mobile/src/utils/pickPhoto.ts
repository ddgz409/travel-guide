import { Alert, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Paths } from "expo-file-system";
import { copyAsync } from "expo-file-system/legacy";

/** 上传用：最长边超过此值才压缩，避免小图被放大 */
const UPLOAD_MAX_EDGE = 1600;
/** JPEG 质量，兼顾清晰度与体积（压缩后通常 200-500KB） */
const UPLOAD_QUALITY = 0.72;

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

function isContentUri(uri: string): boolean {
  return /^content:\/\//i.test(uri);
}

/** 将任意 URI（含 content://）拷贝到应用缓存，返回 file:// 路径，供 FormData 上传 */
async function copyToCacheFile(uri: string): Promise<string> {
  const dest = `${Paths.cache.uri}upload-${Date.now()}-${Math.round(
    Math.random() * 1e6,
  )}.jpg`;
  await copyAsync({ from: uri, to: dest });
  return dest;
}

/**
 * 上传前预处理：压缩到最长边 ≤1600px 的 JPEG，并转为 file:// 缓存路径。
 * 好处：① 体积小、上传快；② 避开 content:// 等相册 URI 在 RN FormData
 * 上传时读取失败导致的「无法连接服务器」；③ 后端处理更快。
 * 压缩失败时也绝不回退到 content://（否则仍会触发「无法连接服务器」），
 * 而是用文件系统把原图拷成 file:// 缓存文件后再上传。
 */
async function prepareUploadImage(uri: string): Promise<string> {
  try {
    const { width, height } = await getImageSize(uri);
    const maxEdge = Math.max(width, height);
    // resize 只传一个维度（较长边），另一边由库按宽高比自动计算；
    // 同时传 width+height 会把非方形图硬拉伸成正方形（变形）。
    const actions =
      maxEdge > UPLOAD_MAX_EDGE
        ? [
            width >= height
              ? { resize: { width: UPLOAD_MAX_EDGE } }
              : { resize: { height: UPLOAD_MAX_EDGE } },
          ]
        : [];
    const processed = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: UPLOAD_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return processed.uri;
  } catch {
    // 压缩/取尺寸失败（如 HEIC、超大图）：绝不回退 content://，改成拷贝到缓存
    if (isContentUri(uri)) {
      try {
        return await copyToCacheFile(uri);
      } catch {
        return uri;
      }
    }
    return uri;
  }
}

/** 拍照识景：相机拍照，返回预处理后的图片 uri；拒绝权限或取消返回 null */
export async function takePhotoUri(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("无法使用相机", "请在系统设置中允许知径访问相机。");
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.85,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  return prepareUploadImage(result.assets[0].uri);
}

/** 拍照识景：相册选图，返回预处理后的图片 uri；拒绝权限或取消返回 null */
export async function pickPhotoUri(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("无法访问相册", "请在系统设置中允许知径访问照片。");
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.85,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  return prepareUploadImage(result.assets[0].uri);
}

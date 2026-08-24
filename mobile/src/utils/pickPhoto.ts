import { Alert, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Paths } from "expo-file-system";
import {
  copyAsync,
  readAsStringAsync,
  writeAsStringAsync,
  EncodingType,
} from "expo-file-system/legacy";

/** 上传用：最长边超过此值才压缩，避免小图被放大 */
const UPLOAD_MAX_EDGE = 1600;
/** JPEG 质量，兼顾清晰度与体积（压缩后通常 200-500KB） */
const UPLOAD_QUALITY = 0.72;

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

function isFileUri(uri: string): boolean {
  return /^file:\/\//i.test(uri);
}

function errBrief(e: unknown): string {
  if (e instanceof Error) return e.message.slice(0, 60) || e.name;
  return String(e).slice(0, 60);
}

function newCachePath(tag: string): string {
  return `${Paths.cache.uri}${tag}-${Date.now()}-${Math.round(
    Math.random() * 1e6,
  )}.jpg`;
}

/** 将任意 URI（含 content://、file://）拷贝到应用缓存，返回 file:// 路径 */
async function copyToCacheFile(uri: string): Promise<string> {
  const dest = newCachePath("upload");
  await copyAsync({ from: uri, to: dest });
  return dest;
}

/**
 * 兜底方案：通过 base64 中转把任意可读 URI 落成缓存里的 file:// 文件。
 * ContentResolver 能读的（content://、加密目录等）这里都能读。
 */
async function base64ToCacheFile(uri: string): Promise<string> {
  const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  const dest = newCachePath("upload-b64");
  await writeAsStringAsync(dest, b64, { encoding: EncodingType.Base64 });
  return dest;
}

/**
 * 上传前预处理：压缩到最长边 ≤1600px 的 JPEG，并保证最终拿到 file:// 路径。
 *
 * 三层策略（任一成功即可上传）：
 *   ① ImageManipulator 压缩转码（首选，体积最小）；
 *   ② 文件系统 copy 到缓存；
 *   ③ base64 读出再写入缓存。
 * 全部失败时抛出带诊断信息的错误，绝不把 content:// 等不可直接上传的
 * URI 交给 FormData（否则原生层读取失败，表现为「无法连接服务器」）。
 */
async function prepareUploadImage(uri: string): Promise<string> {
  let e1: unknown = null;
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
    if (!isFileUri(processed.uri)) {
      // 极少数情况下库可能返回远程/特殊 URI，仍需落地成本地文件
      return await base64ToCacheFile(processed.uri);
    }
    return processed.uri;
  } catch (e) {
    e1 = e;
  }
  try {
    return await copyToCacheFile(uri);
  } catch (e2) {
    try {
      return await base64ToCacheFile(uri);
    } catch (e3) {
      throw new Error(
        `图片读取失败(${errBrief(e1)} | ${errBrief(e2)} | ${errBrief(e3)})，请换一张图片试试`,
      );
    }
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
  try {
    return await prepareUploadImage(result.assets[0].uri);
  } catch (e) {
    Alert.alert("图片处理失败", e instanceof Error ? e.message : String(e));
    return null;
  }
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
  try {
    return await prepareUploadImage(result.assets[0].uri);
  } catch (e) {
    Alert.alert("图片处理失败", e instanceof Error ? e.message : String(e));
    return null;
  }
}

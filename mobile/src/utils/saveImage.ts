/** 将网络图片保存到系统相册 */

import * as MediaLibrary from "expo-media-library";
import { downloadAsync, cacheDirectory } from "expo-file-system/legacy";

export async function saveRemoteImageToLibrary(imageUrl: string): Promise<void> {
  const trimmed = imageUrl.trim();
  if (!trimmed) throw new Error("无效的图片地址");

  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) {
    throw new Error("需要相册访问权限才能保存图片");
  }

  const ext = /\.png(\?|$)/i.test(trimmed) ? "png" : "jpg";
  const localUri = `${cacheDirectory}place_${Date.now()}.${ext}`;
  const { uri } = await downloadAsync(trimmed, localUri);
  await MediaLibrary.createAssetAsync(uri);
}

import { Image } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import { AVATAR_JPEG_QUALITY, AVATAR_MAX_EDGE } from "./avatarConfig";

export type AvatarCropRect = {
  originX: number;
  originY: number;
  size: number;
};

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

/** 按选区裁成正方形并压缩；无选区则居中裁切 */
export async function prepareSquareAvatar(
  uri: string,
  crop?: AvatarCropRect,
): Promise<string> {
  const { width, height } = await getImageSize(uri);
  let originX: number;
  let originY: number;
  let size: number;

  if (crop) {
    size = Math.min(crop.size, width, height);
    originX = Math.round(Math.min(Math.max(crop.originX, 0), width - size));
    originY = Math.round(Math.min(Math.max(crop.originY, 0), height - size));
  } else {
    size = Math.min(width, height);
    originX = Math.round((width - size) / 2);
    originY = Math.round((height - size) / 2);
  }

  const processed = await ImageManipulator.manipulateAsync(
    uri,
    [
      { crop: { originX, originY, width: size, height: size } },
      { resize: { width: AVATAR_MAX_EDGE, height: AVATAR_MAX_EDGE } },
    ],
    {
      compress: AVATAR_JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );
  return processed.uri;
}

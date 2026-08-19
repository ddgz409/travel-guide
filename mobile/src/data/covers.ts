/** 行程封面图按城市名匹配 */

import type { ImageSourcePropType } from "react-native";
import { colors } from "../theme";

/** 空占位图：纯白 */
export const EMPTY_COVER: ImageSourcePropType = {
  uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
};

/** 行程卡片封面：全部走后端 API 拉取，不再用本地 AI 图 */
export function coverFor(destination: string): ImageSourcePropType {
  return EMPTY_COVER;
}

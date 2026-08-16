import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";

/** 共用：可侧滑返回，时长偏缓，避免硬切 */
const soft: Pick<
  NativeStackNavigationOptions,
  "gestureEnabled" | "fullScreenGestureEnabled"
> = {
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
};

/** 设置页：从右侧推入 */
export const pushSettings: NativeStackNavigationOptions = {
  ...soft,
  animation: "slide_from_right",
  animationDuration: 520,
};

/** 一级内页：右侧稍慢，和设置接近但不一样 */
export const pushPage: NativeStackNavigationOptions = {
  ...soft,
  animation: "slide_from_right",
  animationDuration: 480,
};

/** 再钻一层：更快的右侧推入 */
export const pushNested: NativeStackNavigationOptions = {
  ...soft,
  animation: "slide_from_right",
  animationDuration: 400,
};

/** 详情：系统式 push，位移更短 */
export const pushNative: NativeStackNavigationOptions = {
  ...soft,
  animation: "simple_push",
  animationDuration: 460,
};

/** 任务流：右侧中速 */
export const pushFlow: NativeStackNavigationOptions = {
  ...soft,
  animation: "slide_from_right",
  animationDuration: 440,
};

/** 浮层：登录 / 聊天 / 添加足迹 */
export const riseSoft: NativeStackNavigationOptions = {
  ...soft,
  animation: "fade_from_bottom",
  animationDuration: 500,
};

/** 更慢的浮层：注册、模型管理 */
export const riseSlow: NativeStackNavigationOptions = {
  ...soft,
  animation: "fade_from_bottom",
  animationDuration: 560,
};

/** 全屏地图：淡入盖住，不滑页 */
export const fadeCover: NativeStackNavigationOptions = {
  ...soft,
  animation: "fade",
  animationDuration: 380,
};

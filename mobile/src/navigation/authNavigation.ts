import type { NavigationProp } from "@react-navigation/native";
import type { AppStackParamList } from "./types";

type Nav = NavigationProp<AppStackParamList>;

/** 登录/注册成功后回到主页 */
export function resetToMain(navigation: Nav) {
  navigation.reset({
    index: 0,
    routes: [{ name: "Main" }],
  });
}

/** 退出登录：保留 Main，在其上打开 Login，返回可回到主页 */
export function resetToLoginAfterLogout(navigation: Nav) {
  navigation.reset({
    index: 1,
    routes: [{ name: "Main" }, { name: "Login" }],
  });
}

/** 登录页返回：有上一页则 pop，否则回主页 */
export function leaveLoginScreen(navigation: Nav) {
  if (navigation.canGoBack()) {
    navigation.goBack();
  } else {
    resetToMain(navigation);
  }
}

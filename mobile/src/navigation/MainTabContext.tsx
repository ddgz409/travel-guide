import { createContext, useContext } from "react";
import type { SharedValue } from "react-native-reanimated";

export type MainTab = "Trips" | "Explore" | "Me";

export type MainTabContextValue = {
  tab: MainTab;
  setTab: (tab: MainTab) => void;
  /** 1 显示底栏气泡，0 收起；探索页抽屉拖动时联动 */
  tabBarReveal: SharedValue<number> | null;
};

export const MainTabContext = createContext<MainTabContextValue>({
  tab: "Explore",
  setTab: () => {},
  tabBarReveal: null,
});

export function useMainTab() {
  return useContext(MainTabContext);
}

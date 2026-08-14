import { createContext, useContext } from "react";

export type MainTab = "Trips" | "Explore" | "Me";

export const MainTabContext = createContext<{
  tab: MainTab;
  setTab: (tab: MainTab) => void;
}>({
  tab: "Explore",
  setTab: () => {},
});

export function useMainTab() {
  return useContext(MainTabContext);
}

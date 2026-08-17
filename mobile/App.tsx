import React, { Suspense, lazy, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { maybePromptUpdateOnLaunch } from "./src/utils/appUpdate";
import type { AppStackParamList } from "./src/navigation/types";
import { LoginScreen } from "./src/screens/Login/LoginScreen";
import { RegisterScreen } from "./src/screens/Register/RegisterScreen";
import { TripsScreen } from "./src/screens/Trips/TripsScreen";
import { ExploreScreen } from "./src/screens/Explore/ExploreScreen";
import { MeScreen } from "./src/screens/Me/MeScreen";
import { FootprintOverviewScreen } from "./src/screens/Me/FootprintOverviewScreen";
import { FootprintListScreen } from "./src/screens/Me/FootprintListScreen";
import { AddFootprintScreen } from "./src/screens/Me/AddFootprintScreen";
import { FavoritesScreen } from "./src/screens/Me/FavoritesScreen";
import { GenerateScreen } from "./src/screens/Generate/GenerateScreen";
import { SettingsScreen } from "./src/screens/Settings/SettingsScreen";
import { MapFullScreen } from "./src/screens/MapFull/MapFullScreen";
import { ChatScreen } from "./src/screens/Chat/ChatScreen";
import { TravelSearchScreen } from "./src/screens/TravelSearch/TravelSearchScreen";
import { PortalSelectScreen } from "./src/screens/PortalSelect/PortalSelectScreen";
import { ModelManageScreen } from "./src/screens/ModelManage/ModelManageScreen";
import { CustomTabBar } from "./src/components/CustomTabBar";
import { MainTabContext, type MainTab } from "./src/navigation/MainTabContext";
import { colors } from "./src/theme";
import { SplashOverlay } from "./src/components/SplashOverlay";
import {
  fadeCover,
  pushFlow,
  pushNative,
  pushNested,
  pushPage,
  pushSettings,
  riseSlow,
  riseSoft,
} from "./src/navigation/transitions";

/** 推迟加载带地图的页面 */
const TripDetailScreen = lazy(() =>
  import("./src/screens/TripDetail/TripDetailScreen").then((m) => ({
    default: m.TripDetailScreen,
  })),
);
const TripItemDetailScreen = lazy(() =>
  import("./src/screens/TripDetail/TripItemDetailScreen").then((m) => ({
    default: m.TripItemDetailScreen,
  })),
);
const ShareScreen = lazy(() =>
  import("./src/screens/Share/ShareScreen").then((m) => ({ default: m.ShareScreen })),
);
const CityDetailScreen = lazy(() =>
  import("./src/screens/CityDetail/CityDetailScreen").then((m) => ({
    default: m.CityDetailScreen,
  })),
);
const CheckInMapFullScreen = lazy(() =>
  import("./src/screens/CheckInMap/CheckInMapFullScreen").then((m) => ({
    default: m.CheckInMapFullScreen,
  })),
);

const Stack = createNativeStackNavigator<AppStackParamList>();

/** 底部 Tab 容器（计划 / 探索 / 我的）：仅探索页保活，避免 WebView 挡住其它 Tab */
function MainScreen() {
  const [tab, setTab] = useState<MainTab>("Explore");
  const [exploreMounted, setExploreMounted] = useState(true);

  function onTabChange(next: MainTab) {
    if (next === "Explore") setExploreMounted(true);
    setTab(next);
  }

  return (
    <MainTabContext.Provider value={{ tab, setTab: onTabChange }}>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          {tab === "Trips" ? <TripsScreen /> : null}
          {tab === "Me" ? <MeScreen /> : null}
          {exploreMounted ? (
            <View
              style={{ flex: 1, display: tab === "Explore" ? "flex" : "none" }}
              pointerEvents={tab === "Explore" ? "auto" : "none"}
            >
              <ExploreScreen />
            </View>
          ) : null}
        </View>
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
        >
          <CustomTabBar activeTab={tab} onTabChange={onTabChange} />
        </View>
      </View>
    </MainTabContext.Provider>
  );
}

function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Main"
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.bg },
        animationDuration: 480,
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      {/* 底部导航主页 */}
      <Stack.Screen
        name="Main"
        component={MainScreen}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ headerShown: false, ...riseSoft }}
      />
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false, ...riseSoft }}
      />
      <Stack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ title: "注册", ...riseSlow }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: false, ...pushSettings }}
      />
      <Stack.Screen
        name="MapFull"
        component={MapFullScreen}
        options={{ title: "地图", ...fadeCover }}
      />
      <Stack.Screen
        name="ModelManage"
        component={ModelManageScreen}
        options={{ headerShown: false, ...riseSlow }}
      />

      <Stack.Screen
        name="CheckInMapFull"
        component={CheckInMapFullScreen}
        options={{ headerShown: false, ...fadeCover }}
      />
      <Stack.Screen
        name="FootprintOverview"
        component={FootprintOverviewScreen}
        options={{ headerShown: false, ...pushPage }}
      />
      <Stack.Screen
        name="FootprintList"
        component={FootprintListScreen}
        options={{ headerShown: false, ...pushNested }}
      />
      <Stack.Screen
        name="AddFootprint"
        component={AddFootprintScreen}
        options={{ headerShown: false, ...riseSoft }}
      />
      <Stack.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{ headerShown: false, ...pushPage }}
      />
      <Stack.Screen
        name="CityDetail"
        component={CityDetailScreen}
        options={{ headerShown: false, ...pushNative }}
      />
      <Stack.Screen
        name="TripDetail"
        component={TripDetailScreen}
        options={{ title: "行程详情", headerShown: false, ...pushNative }}
      />
      <Stack.Screen
        name="TripItemDetail"
        component={TripItemDetailScreen}
        options={{ title: "安排详情", ...pushNested }}
      />
      <Stack.Screen
        name="Generate"
        component={GenerateScreen}
        options={{ title: "生成攻略", ...pushFlow }}
      />
      <Stack.Screen
        name="Share"
        component={ShareScreen}
        options={{ title: "分享攻略", ...pushFlow }}
      />
      <Stack.Screen
        name="TravelSearch"
        component={TravelSearchScreen}
        options={{ headerShown: false, ...pushFlow }}
      />
      <Stack.Screen
        name="PortalSelect"
        component={PortalSelectScreen}
        options={{ headerShown: false, ...pushNested }}
      />
    </Stack.Navigator>
  );
}

function Root() {
  const { loading } = useAuth();
  const [splash, setSplash] = useState(true);

  useEffect(() => {
    if (loading || splash) return;
    const t = setTimeout(() => {
      void maybePromptUpdateOnLaunch();
    }, 1200);
    return () => clearTimeout(t);
  }, [loading, splash]);

  if (splash) {
    return (
      <View style={{ flex: 1, backgroundColor: "#D7EBFC" }}>
        <SplashOverlay ready={!loading} onFinished={() => setSplash(false)} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#F7FBFF" }}>
      <NavigationContainer>
        <Suspense
          fallback={
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: colors.bg,
              }}
            >
              <ActivityIndicator color={colors.brand} size="large" />
            </View>
          }
        >
          <RootNavigator />
        </Suspense>
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" animated />
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

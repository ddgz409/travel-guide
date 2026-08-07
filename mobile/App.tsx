import React, { Suspense, lazy, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { maybePromptUpdateOnLaunch } from "./src/utils/appUpdate";
import type { AppStackParamList } from "./src/navigation/types";
import { LoginScreen } from "./src/screens/Login/LoginScreen";
import { RegisterScreen } from "./src/screens/Register/RegisterScreen";
import { TripsScreen } from "./src/screens/Trips/TripsScreen";
import { GenerateScreen } from "./src/screens/Generate/GenerateScreen";
import { SettingsScreen } from "./src/screens/Settings/SettingsScreen";
import { MapFullScreen } from "./src/screens/MapFull/MapFullScreen";
import { ChatScreen } from "./src/screens/Chat/ChatScreen";
import { TravelSearchScreen } from "./src/screens/TravelSearch/TravelSearchScreen";
import { PortalSelectScreen } from "./src/screens/PortalSelect/PortalSelectScreen";
import { ModelManageScreen } from "./src/screens/ModelManage/ModelManageScreen";
import { CustomTabBar } from "./src/components/CustomTabBar";
import { colors } from "./src/theme";

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
const ExploreScreen = lazy(() =>
  import("./src/screens/Explore/ExploreScreen").then((m) => ({ default: m.ExploreScreen })),
);
const CityDetailScreen = lazy(() =>
  import("./src/screens/CityDetail/CityDetailScreen").then((m) => ({
    default: m.CityDetailScreen,
  })),
);
const CityGuideScreen = lazy(() =>
  import("./src/screens/CityGuide/CityGuideScreen").then((m) => ({
    default: m.CityGuideScreen,
  })),
);
const CheckInMapFullScreen = lazy(() =>
  import("./src/screens/CheckInMap/CheckInMapFullScreen").then((m) => ({
    default: m.CheckInMapFullScreen,
  })),
);

const Stack = createNativeStackNavigator<AppStackParamList>();

/** 底部 Tab 容器（探索 / + / 行程） */
function MainScreen() {
  const [tab, setTab] = useState<"Trips" | "Explore">("Explore");
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1 }}>
        {tab === "Trips" ? <TripsScreen /> : <ExploreScreen />}
      </View>
      <CustomTabBar activeTab={tab} onTabChange={setTab} />
    </View>
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
        animationDuration: 400,
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

      {/* 辅助功能页：底部滑入 */}
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ headerShown: false, animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false, animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ title: "注册", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "设置", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="MapFull"
        component={MapFullScreen}
        options={{ title: "地图", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="ModelManage"
        component={ModelManageScreen}
        options={{ headerShown: false, animation: "slide_from_bottom" }}
      />

      {/* 浏览流程页：翻页效果 */}
      <Stack.Screen
        name="CheckInMapFull"
        component={CheckInMapFullScreen}
        options={{ headerShown: false, animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="CityDetail"
        component={CityDetailScreen}
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="CityGuide"
        component={CityGuideScreen}
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="TripDetail"
        component={TripDetailScreen}
        options={{ title: "行程详情", headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="TripItemDetail"
        component={TripItemDetailScreen}
        options={{ title: "安排详情", animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="Generate"
        component={GenerateScreen}
        options={{ title: "生成攻略", animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="Share"
        component={ShareScreen}
        options={{ title: "分享攻略", animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="TravelSearch"
        component={TravelSearchScreen}
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="PortalSelect"
        component={PortalSelectScreen}
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
    </Stack.Navigator>
  );
}

function Root() {
  const { loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      void maybePromptUpdateOnLaunch();
    }, 1200);
    return () => clearTimeout(t);
  }, [loading]);

  if (loading) {
    return (
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
    );
  }

  return (
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

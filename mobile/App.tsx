import React, { Suspense, lazy, useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { maybePromptUpdateOnLaunch } from "./src/appUpdate";
import type { AppStackParamList } from "./src/navigation/types";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { RegisterScreen } from "./src/screens/RegisterScreen";
import { TripsScreen } from "./src/screens/TripsScreen";
import { GenerateScreen } from "./src/screens/GenerateScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { MapFullScreen } from "./src/screens/MapFullScreen";
import { colors } from "./src/theme";

/** 推迟加载带地图的页面，避免启动时拉起 react-native-maps 导致闪退 */
const TripDetailScreen = lazy(() =>
  import("./src/screens/TripDetailScreen").then((m) => ({
    default: m.TripDetailScreen,
  })),
);
const ShareScreen = lazy(() =>
  import("./src/screens/ShareScreen").then((m) => ({ default: m.ShareScreen })),
);

const Stack = createNativeStackNavigator<AppStackParamList>();

function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.bg },
        animation: "fade_from_bottom",
        animationDuration: 320,
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false, animation: "fade" }}
      />
      <Stack.Screen
        name="Trips"
        component={TripsScreen}
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="TripDetail"
        component={TripDetailScreen}
        options={{ title: "行程详情", animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="Generate"
        component={GenerateScreen}
        options={{ title: "生成攻略", animation: "fade_from_bottom" }}
      />
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false, animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ title: "注册", animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "设置", animation: "fade_from_bottom" }}
      />
      <Stack.Screen
        name="MapFull"
        component={MapFullScreen}
        options={{ title: "地图", animation: "fade_from_bottom" }}
      />
      <Stack.Screen
        name="Share"
        component={ShareScreen}
        options={{ title: "分享攻略", animation: "slide_from_right" }}
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
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" animated />
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

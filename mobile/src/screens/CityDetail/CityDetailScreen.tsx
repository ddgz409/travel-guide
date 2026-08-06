import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { ApiError } from "@travel-guide/shared";
import type { CityFood, CitySpot } from "@travel-guide/shared";
import { api } from "../../api/client";
import { getAmapJsKey } from "../../api/config";
import { PlaceImage } from "../../components/PlaceImage";
import { colors } from "../../theme";
import { getCachedCityInfo, setCachedCityInfo } from "../../utils/cityInfoCache";
import { getDeviceLocation } from "../../utils/location";
import { loadLocationConsent, saveLocationConsent } from "../../utils/locationPrefs";
import { hasCoords, type LatLng } from "../../utils/geo";
import { addCheckIn, isCheckedIn } from "../../utils/checkInStore";
import type { AppStackParamList } from "../../navigation/types";
import { buildAmapHtml, type MapMarker } from "../../utils/amapHtml";
import { openXiaohongshu } from "../../utils/openExternal";
import {
  CATEGORIES,
  cityCoord,
  cityIntro,
  fakePopularity,
  itemCoord,
  xhsCategoryKeyword,
  type ExploreCategory,
} from "./helpers";
import { PoiDetailSheet } from "./PoiDetailSheet";
import { DraggableBottomSheet } from "./DraggableBottomSheet";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "CityDetail">;
type PoiItem = CityFood | CitySpot;

export function CityDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { city } = route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [foods, setFoods] = useState<CityFood[]>([]);
  const [spots, setSpots] = useState<CitySpot[]>([]);
  const [category, setCategory] = useState<ExploreCategory>("spots");
  const [selectedItem, setSelectedItem] = useState<PoiItem | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());

  const amapKey = getAmapJsKey();
  const webRef = useRef<WebView>(null);
  const baseCoord = useMemo(() => cityCoord(city), [city]);

  const applyResult = useCallback((result: { foods?: CityFood[]; spots?: CitySpot[] }) => {
    setFoods(result.foods || []);
    setSpots(result.spots || []);
    if ((result.spots || []).length > 0) setCategory("spots");
    else if ((result.foods || []).length > 0) setCategory("foods");
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const cached = await getCachedCityInfo(city);
    const hasCache =
      cached && ((cached.foods?.length ?? 0) > 0 || (cached.spots?.length ?? 0) > 0);

    if (hasCache) {
      applyResult(cached!);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const result = await api.destinations.info(city);
      applyResult(result);
      if ((result.foods?.length ?? 0) > 0 || (result.spots?.length ?? 0) > 0) {
        await setCachedCityInfo(city, result);
      }
    } catch (e) {
      if (!hasCache) {
        setError(e instanceof ApiError ? e.message : "搜索失败，请重试");
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, applyResult]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const fetchUserLocation = useCallback(async () => {
    try {
      const consent = await loadLocationConsent();
      if (consent === "denied") return;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (consent === null) await saveLocationConsent("denied");
        return;
      }
      await saveLocationConsent("granted");
      const pos = await getDeviceLocation();
      setUserLocation(pos);
    } catch {
      /* 定位失败时不展示假距离 */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchUserLocation();
    }, [fetchUserLocation]),
  );

  const refreshCheckedState = useCallback(async (items: PoiItem[]) => {
    const keys = new Set<string>();
    await Promise.all(
      items.map(async (item) => {
        if (await isCheckedIn(city, item.name)) {
          keys.add(`${city}::${item.name}`);
        }
      }),
    );
    setCheckedKeys(keys);
  }, [city]);

  useEffect(() => {
    void refreshCheckedState([...foods, ...spots]);
  }, [foods, spots, refreshCheckedState]);

  const handleCheckIn = useCallback(
    async (item: PoiItem) => {
      try {
        await addCheckIn({
          city,
          name: item.name,
          category,
          lng: item.lng,
          lat: item.lat,
          address: item.address,
        });
        setCheckedKeys((prev) => new Set(prev).add(`${city}::${item.name}`));
        Alert.alert(
          "打卡成功",
          `「${item.name}」已记录，可在「我的行程」顶部查看打卡地图。`,
        );
      } catch (e) {
        Alert.alert("打卡失败", e instanceof Error ? e.message : "请稍后重试");
      }
    },
    [city, category],
  );

  const activeItems: PoiItem[] = category === "foods" ? foods : spots;
  const activeCat = CATEGORIES.find((c) => c.key === category)!;

  const mapMarkers: MapMarker[] = useMemo(() => {
    const items = category === "foods" ? foods : spots;
    return items.map((item, i) => {
      const coord = hasCoords(item)
        ? { lng: item.lng!, lat: item.lat! }
        : itemCoord(baseCoord, item.name, i);
      return {
        lng: coord.lng,
        lat: coord.lat,
        name: item.name,
        color: activeCat.color,
        icon: activeCat.icon,
      };
    });
  }, [category, foods, spots, baseCoord, activeCat]);

  const mapHtml = useMemo(() => {
    if (!amapKey) return "";
    return buildAmapHtml({
      key: amapKey,
      markers: mapMarkers,
      interactive: true,
      linkMarkers: false,
    });
  }, [amapKey, mapMarkers]);

  const intro = useMemo(
    () => cityIntro(city, spots.map((s) => s.desc)),
    [city, spots],
  );

  function goGenerate() {
    navigation.navigate("Generate", { destination: city });
  }

  function openCategoryXhs() {
    void openXiaohongshu({
      keyword: xhsCategoryKeyword(city, category),
      title: `${city} ${activeCat.label}`,
    });
  }

  const isEmpty = !loading && !error && foods.length === 0 && spots.length === 0;
  const topPad = Math.max(insets.top, 8);
  const filterTop = topPad + 56;
  const locateTop = filterTop + 52;

  if (loading || error || isEmpty) {
    return (
      <View style={styles.overlay}>
        <View style={[styles.overlayHeader, { paddingTop: topPad }]}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text style={styles.overlayTitle}>{city}</Text>
        </View>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} size="large" />
            <Text style={styles.loadingText}>正在搜索 {city} 真实信息…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>重试</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.center}>
            <Text style={styles.emptyText}>暂无 {city} 的相关信息</Text>
            <Pressable style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>重新搜索</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {amapKey && mapHtml ? (
        <>
          {!mapLoaded ? (
            <View style={styles.mapLoading}>
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : null}
          <WebView
            ref={webRef}
            originWhitelist={["*"]}
            source={{ html: mapHtml, baseUrl: "https://webapi.amap.com" }}
            style={styles.map}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            setSupportMultipleWindows={false}
            androidLayerType="hardware"
            onLoadEnd={() => setMapLoaded(true)}
          />
        </>
      ) : (
        <View style={styles.mapLoading}>
          <Text style={{ color: colors.muted, fontSize: 14 }}>地图未配置</Text>
        </View>
      )}

      <View style={[styles.topOverlay, { paddingTop: topPad }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.topCityBlock}>
          <Text style={styles.topCityName}>{city}</Text>
          <Text style={styles.topCitySub}>探索当地 · 真实信息</Text>
        </View>
        <Pressable style={styles.searchBtn} onPress={goGenerate}>
          <Text style={styles.searchIcon}>🔍</Text>
        </Pressable>
      </View>

      <View style={[styles.filterBar, { top: filterTop }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {CATEGORIES.map((cat) => {
            const count = cat.key === "foods" ? foods.length : spots.length;
            const on = category === cat.key;
            return (
              <Pressable
                key={cat.key}
                style={[styles.filterChip, on && styles.filterChipOn]}
                onPress={() => setCategory(cat.key)}
                disabled={count === 0}
              >
                <Text style={styles.filterIcon}>{cat.icon}</Text>
                <Text style={[styles.filterLabel, on && styles.filterLabelOn]}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <Pressable
        style={[styles.locateBtn, { top: locateTop }]}
        onPress={() => webRef.current?.injectJavaScript("window.__map && window.__map.setZoomAndCenter(12, [" + baseCoord.lng + "," + baseCoord.lat + "]); true;")}
      >
        <Text style={styles.locateIcon}>◎</Text>
      </Pressable>

      <DraggableBottomSheet bottomInset={Math.max(insets.bottom, 8)}>
        <Text style={styles.sheetTitle}>{city}</Text>
        <Text style={styles.sheetDesc} numberOfLines={3}>
          {intro}
        </Text>
        <ScrollView
          style={styles.sheetScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sheetList}
          nestedScrollEnabled
        >
          {activeItems.map((item, i) => (
            <Pressable
              key={`${category}-${i}`}
              style={styles.itemCard}
              onPress={() => setSelectedItem(item)}
            >
              <View style={styles.itemThumb}>
                <PlaceImage
                  city={city}
                  name={item.name}
                  category={category}
                  image={item.image}
                  images={item.images}
                  style={styles.itemThumbImg}
                />
              </View>
              <View style={styles.itemBody}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.itemMeta}>{fakePopularity(item.name)}</Text>
              </View>
              <Pressable
                style={styles.itemAdd}
                onPress={() => setSelectedItem(item)}
                hitSlop={8}
              >
                <Text style={styles.itemAddText}>+</Text>
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable style={styles.xhsBtn} onPress={openCategoryXhs}>
          <Text style={styles.xhsBtnIcon}>📕</Text>
          <Text style={styles.xhsBtnText}>
            去小红书看{city}{activeCat.label}真实评价
          </Text>
          <Text style={styles.xhsBtnArrow}>›</Text>
        </Pressable>
        <Pressable style={styles.genBtn} onPress={goGenerate}>
          <Text style={styles.genBtnText}>为 {city} 生成旅行攻略 ›</Text>
        </Pressable>
      </DraggableBottomSheet>

      <PoiDetailSheet
        visible={!!selectedItem}
        item={selectedItem}
        category={category}
        city={city}
        userLocation={userLocation}
        checked={
          selectedItem
            ? checkedKeys.has(`${city}::${selectedItem.name}`)
            : false
        }
        onCheckIn={handleCheckIn}
        onClose={() => setSelectedItem(null)}
      />
    </View>
  );
}

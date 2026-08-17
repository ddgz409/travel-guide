import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type { PoiSearchResult } from "@travel-guide/shared";
import type { AppStackParamList } from "../../navigation/types";
import { api } from "../../api/client";
import { colors } from "../../theme";
import { buildCheckInMapHtml } from "../../utils/checkInMapHtml";
import {
  getCheckedPrefectureIds,
  subscribeCheckIns,
} from "../../utils/checkInStore";
import {
  ensureLocationAccess,
  getDeviceLocation,
  peekCachedCity,
  peekCachedLocation,
  rememberLocation,
} from "../../utils/location";
import { resolvePrefectureFromText } from "../../assets/cityToPrefecture";
import {
  addFavoritePlace,
  createFavoriteFolder,
  DEFAULT_FOLDER_ID,
  listFavoriteFolders,
  listFavoritePlaces,
  removeFavoritePlace,
  subscribeFavorites,
  type FavoriteFolder,
  type FavoritePlace,
} from "../../utils/favoriteStore";
import { DraggableBottomSheet } from "../CityDetail/DraggableBottomSheet";
import { styles } from "./favoritesStyles";

type Props = NativeStackScreenProps<AppStackParamList, "Favorites">;

function cityOfPoi(poi: PoiSearchResult, fallback: string): string {
  const blob = `${poi.address || ""} ${poi.location?.address || ""} ${poi.name}`;
  return resolvePrefectureFromText(blob)?.city || fallback;
}

export function FavoritesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [folders, setFolders] = useState<FavoriteFolder[]>([]);
  const [places, setPlaces] = useState<FavoritePlace[]>([]);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PoiSearchResult[]>([]);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [locCity, setLocCity] = useState(
    () => peekCachedCity()?.replace(/市$/, "") || "",
  );
  const userLocRef = useRef(peekCachedLocation());
  const locCityRef = useRef(locCity);
  locCityRef.current = locCity;

  const load = useCallback(async () => {
    const [nextFolders, nextPlaces, ids] = await Promise.all([
      listFavoriteFolders(),
      listFavoritePlaces(),
      getCheckedPrefectureIds(),
    ]);
    setFolders(nextFolders);
    setPlaces(nextPlaces);
    setCheckedIds(ids);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => subscribeFavorites(() => void load()), [load]);
  useEffect(() => subscribeCheckIns(() => void load()), [load]);

  const mapHtml = useMemo(
    () =>
      buildCheckInMapHtml(checkedIds, {
        highlightChecked: true,
        interactive: true,
      }),
    [checkedIds],
  );

  const visiblePlaces = openFolderId
    ? places.filter((p) => p.folderId === openFolderId)
    : places;

  const ensureSearchContext = useCallback(async () => {
    let pos = userLocRef.current ?? peekCachedLocation();
    if (!pos) {
      const ok = await ensureLocationAccess();
      if (ok) {
        pos = await getDeviceLocation();
        userLocRef.current = pos;
      }
    }
    if (pos) {
      try {
        const geo = await api.destinations.regeo(pos.lng, pos.lat);
        const city = (geo.city || geo.province || "").replace(/市$/, "");
        if (city) {
          locCityRef.current = city;
          setLocCity(city);
        }
        rememberLocation(pos, geo.city || geo.province || undefined);
      } catch {
        /* ignore */
      }
    }
    return { pos, city: locCityRef.current };
  }, []);

  useEffect(() => {
    if (searchOpen) void ensureSearchContext();
  }, [searchOpen, ensureSearchContext]);

  const runSearch = useCallback(
    async (keyword: string) => {
      const kw = keyword.trim();
      if (!kw) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const { pos, city } = await ensureSearchContext();
        if (!pos) {
          Alert.alert("需要定位", "请允许定位权限后再搜索附近地点。");
          return;
        }
        const list = await api.trips.searchPois(kw, city, 15, true, pos);
        setResults(list);
      } catch (e) {
        Alert.alert("搜索失败", e instanceof Error ? e.message : "请稍后重试");
      } finally {
        setSearching(false);
      }
    },
    [ensureSearchContext],
  );

  function onChangeQuery(text: string) {
    setQ(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void runSearch(text);
    }, 280);
  }

  const targetFolderId = openFolderId || DEFAULT_FOLDER_ID;

  async function pickPoi(poi: PoiSearchResult) {
    const lng = poi.location?.lng;
    const lat = poi.location?.lat;
    if (lng == null || lat == null) {
      Alert.alert("无法定位", "该地点没有坐标，换一个试试");
      return;
    }
    await addFavoritePlace(targetFolderId, {
      name: poi.name,
      city: cityOfPoi(poi, locCity),
      address: poi.address || poi.location?.address || "",
      lng,
      lat,
    });
    Keyboard.dismiss();
    setSearchOpen(false);
    setQ("");
    setResults([]);
    setOpenFolderId(targetFolderId);
  }

  async function confirmCreate() {
    const folder = await createFavoriteFolder(newName);
    setCreateOpen(false);
    setNewName("");
    setOpenFolderId(folder.id);
    setSearchOpen(true);
  }

  const openFolder = folders.find((f) => f.id === openFolderId) ?? null;
  const sheetInset = Math.max(insets.bottom, 10);

  return (
    <View style={styles.root}>
      <View style={[styles.mapBox, { width: winW, height: winH }]} collapsable={false}>
        <WebView
          originWhitelist={["*"]}
          source={{ html: mapHtml }}
          style={[styles.map, { width: winW, height: winH }]}
          scrollEnabled={false}
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          javaScriptEnabled
          domStorageEnabled={false}
          androidLayerType="hardware"
          setSupportMultipleWindows={false}
        />
      </View>

      <Pressable
        style={[styles.backBtn, { top: Math.max(insets.top, 10) + 4 }]}
        onPress={() => {
          if (openFolderId) setOpenFolderId(null);
          else navigation.goBack();
        }}
      >
        <Text style={styles.backText}>‹</Text>
      </Pressable>

      <DraggableBottomSheet
        bottomInset={sheetInset}
        footer={
          <Pressable
            style={styles.addBtn}
            onPress={() => {
              if (openFolderId) setSearchOpen(true);
              else setCreateOpen(true);
            }}
          >
            <Text style={styles.addPlus}>+</Text>
            <Text style={styles.addText}>
              {openFolderId ? "添加地点" : "新建收藏夹"}
            </Text>
          </Pressable>
        }
      >
        <View style={styles.sheetContent}>
          {openFolder ? (
            <>
              <Text style={styles.title}>{openFolder.name}</Text>
              <Text style={styles.sub}>{visiblePlaces.length} 地点</Text>
              <Pressable
                style={styles.searchBar}
                onPress={() => setSearchOpen(true)}
              >
                <Text style={styles.searchPlaceholder}>搜索地点，添加到收藏夹</Text>
              </Pressable>
              <ScrollView
                style={styles.sheetScroll}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                {visiblePlaces.length === 0 ? (
                  <Text style={styles.empty}>还没有地点，搜索一个加上吧</Text>
                ) : (
                  visiblePlaces.map((p) => (
                    <Pressable
                      key={p.id}
                      style={styles.placeRow}
                      onLongPress={() => {
                        Alert.alert("移除收藏", `从收藏夹去掉「${p.name}」？`, [
                          { text: "取消", style: "cancel" },
                          {
                            text: "移除",
                            style: "destructive",
                            onPress: () => void removeFavoritePlace(p.id),
                          },
                        ]);
                      }}
                    >
                      <Text style={styles.placeStar}>★</Text>
                      <View style={styles.placeBody}>
                        <Text style={styles.placeName} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text style={styles.placeSub} numberOfLines={1}>
                          {[p.city, p.address].filter(Boolean).join(" · ")}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </>
          ) : (
            <>
              <Text style={styles.title}>我的收藏</Text>
              <Text style={styles.sub}>
                收藏夹 · {folders.length}{"  "}地点 · {places.length}
              </Text>
              <ScrollView
                style={styles.sheetScroll}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                {folders.map((f) => {
                  const count = places.filter((p) => p.folderId === f.id).length;
                  return (
                    <Pressable
                      key={f.id}
                      style={styles.folderCard}
                      onPress={() => setOpenFolderId(f.id)}
                    >
                      <View style={styles.folderBody}>
                        <Text style={styles.folderName}>{f.name}</Text>
                        <Text style={styles.folderMeta}>
                          {f.locked ? "🔒  " : ""}
                          {count} 地点
                        </Text>
                      </View>
                      <Text style={styles.folderIcon}>📁</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}
        </View>
      </DraggableBottomSheet>

      <Modal
        visible={createOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateOpen(false)}
      >
        <Pressable style={styles.modalMask} onPress={() => setCreateOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>新建收藏夹</Text>
            <TextInput
              autoFocus
              value={newName}
              onChangeText={setNewName}
              placeholder="收藏夹名称"
              placeholderTextColor={colors.muted}
              style={styles.modalInput}
              returnKeyType="done"
              onSubmitEditing={() => void confirmCreate()}
            />
            <View style={styles.modalRow}>
              <Pressable onPress={() => setCreateOpen(false)}>
                <Text style={styles.modalCancel}>取消</Text>
              </Pressable>
              <Pressable onPress={() => void confirmCreate()}>
                <Text style={styles.modalOk}>创建并搜地点</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {searchOpen ? (
        <View
          style={[styles.searchSheet, { paddingTop: Math.max(insets.top, 8) }]}
        >
          <View style={styles.searchHead}>
            <Pressable
              onPress={() => {
                setSearchOpen(false);
                Keyboard.dismiss();
              }}
            >
              <Text style={styles.sheetBack}>‹</Text>
            </Pressable>
            <View style={styles.searchField}>
              <TextInput
                autoFocus
                value={q}
                onChangeText={onChangeQuery}
                placeholder={locCity ? `搜索${locCity}附近地点` : "搜索地点"}
                placeholderTextColor={colors.muted}
                style={styles.input}
                returnKeyType="search"
                onSubmitEditing={() => void runSearch(q)}
              />
            </View>
            <Pressable style={styles.searchBtn} onPress={() => void runSearch(q)}>
              <Text style={styles.searchBtnText}>搜索</Text>
            </Pressable>
          </View>
          {searching ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
          ) : (
            <ScrollView contentContainerStyle={styles.list}>
              {results.map((poi) => (
                <Pressable
                  key={`${poi.poi_id || poi.name}-${poi.location?.lng}`}
                  style={styles.row}
                  onPress={() => void pickPoi(poi)}
                >
                  <Text style={styles.rowPin}>📍</Text>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {poi.name}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {poi.address || poi.location?.address || ""}
                    </Text>
                  </View>
                </Pressable>
              ))}
              {!q.trim() ? (
                <Text style={styles.empty}>输入关键词，搜索要收藏的地点</Text>
              ) : null}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

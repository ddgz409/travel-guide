import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Alternative, PoiSearchResult, Trip } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../../api/client";
import { PlaceGallery } from "../../components/PlaceImage";
import { PoiPortalLinks } from "../../components/PoiPortalLinks";
import { CheckInButton } from "../../components/CheckInButton";
import type { AppStackParamList } from "../../navigation/types";
import { addCheckIn, isCheckedIn, removeCheckIn } from "../../utils/checkInStore";
import { distanceLabel, type LatLng } from "../../utils/geo";
import {
  openAmapPoiLookup,
  openMapNavigation,
} from "../../utils/openMapNavigation";
import { firstDialablePhone, telDialUri } from "../../utils/phone";
import { openCtripPoi } from "../../utils/poiPortals";
import {
  formatPoiAddress,
  fakePopularity,
  splitReviewPoints,
  type ExploreCategory,
} from "./helpers";
import { styles } from "./styles";

type Item = {
  name: string;
  desc: string;
  image?: string;
  images?: string[];
  lng?: number;
  lat?: number;
  address?: string;
};

type Props = {
  visible: boolean;
  item: Item | null;
  category: ExploreCategory;
  city: string;
  userLocation: LatLng | null;
  checked?: boolean;
  onCheckIn?: (item: Item) => void;
  onUncheck?: (item: Item) => void;
  tripId?: string;
  tripItemId?: string;
  tripItemSelected?: boolean;
  tripAlternatives?: Alternative[] | null;
  tripCanEdit?: boolean;
  onTripUpdated?: (trip: Trip) => void;
  onClose: () => void;
};

const CAT_LABEL: Record<ExploreCategory, string> = {
  spots: "景点",
  foods: "美食",
  hotels: "住宿",
};

function pickPoiMatch(list: PoiSearchResult[], name: string): PoiSearchResult | null {
  if (!list.length) return null;
  const target = name.trim();
  const exact = list.find((p) => p.name.trim() === target);
  if (exact) return exact;
  const fuzzy = list.find(
    (p) => p.name.includes(target) || target.includes(p.name),
  );
  return fuzzy || list[0];
}

function ReviewPointRow({ label, text }: { label: string; text: string }) {
  return (
    <Text style={styles.reviewPoint}>
      <Text style={styles.reviewLabel}>{label}</Text>
      {text}
    </Text>
  );
}

export function PoiDetailSheet({
  visible,
  item,
  category,
  city,
  userLocation,
  checked: checkedProp,
  onCheckIn,
  onUncheck,
  tripId,
  tripItemId,
  tripItemSelected = true,
  tripAlternatives,
  tripCanEdit = false,
  onTripUpdated,
  onClose,
}: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const [checkedLocal, setCheckedLocal] = useState(false);
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [tripEditBusy, setTripEditBusy] = useState(false);
  const [tripSelected, setTripSelected] = useState(tripItemSelected);
  const [poiExtra, setPoiExtra] = useState<PoiSearchResult | null>(null);

  const checked = checkedProp ?? checkedLocal;

  useEffect(() => {
    if (!visible || !item) return;
    if (checkedProp == null) {
      let cancelled = false;
      void isCheckedIn(city, item.name).then((ok) => {
        if (!cancelled) setCheckedLocal(ok);
      });
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [visible, item, city, checkedProp]);

  useEffect(() => {
    setTripSelected(tripItemSelected);
  }, [tripItemSelected, tripItemId, visible]);

  useEffect(() => {
    if (!visible || !item) {
      setPoiExtra(null);
      return;
    }
    let cancelled = false;
    void api.trips
      .searchPois(item.name, city, 5)
      .then((list) => {
        if (cancelled) return;
        setPoiExtra(pickPoiMatch(list, item.name));
      })
      .catch(() => {
        if (!cancelled) setPoiExtra(null);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, item, city]);

  const mergedItem = useMemo((): Item | null => {
    if (!item) return null;
    return {
      ...item,
      lng: item.lng ?? poiExtra?.location?.lng ?? undefined,
      lat: item.lat ?? poiExtra?.location?.lat ?? undefined,
      address: item.address || poiExtra?.address || undefined,
    };
  }, [item, poiExtra]);

  const distance = useMemo(
    () => (mergedItem ? distanceLabel(userLocation, mergedItem) : null),
    [mergedItem, userLocation],
  );

  const address = mergedItem
    ? formatPoiAddress(city, mergedItem.name, mergedItem.address)
    : "";

  const phone = useMemo(
    () => firstDialablePhone(poiExtra?.tel),
    [poiExtra?.tel],
  );

  const opentime = (poiExtra?.opentime || "").trim();

  const navTarget = useMemo(
    () =>
      mergedItem
        ? {
            name: mergedItem.name,
            lng: mergedItem.lng,
            lat: mergedItem.lat,
            address: mergedItem.address || address,
            city,
          }
        : null,
    [mergedItem, address, city],
  );

  const handleCheckIn = useCallback(async () => {
    if (!mergedItem || checkInBusy) return;
    setCheckInBusy(true);
    try {
      if (checked) {
        await removeCheckIn(city, mergedItem.name);
        setCheckedLocal(false);
        onUncheck?.(mergedItem);
      } else {
        await addCheckIn({
          city,
          name: mergedItem.name,
          category,
          lng: mergedItem.lng,
          lat: mergedItem.lat,
          address: mergedItem.address,
        });
        setCheckedLocal(true);
        onCheckIn?.(mergedItem);
      }
    } catch (e) {
      Alert.alert("打卡失败", e instanceof Error ? e.message : "请稍后重试");
    } finally {
      setCheckInBusy(false);
    }
  }, [mergedItem, checkInBusy, city, category, checked, onCheckIn, onUncheck]);

  const handleToggleTripItem = useCallback(async () => {
    if (!tripId || !tripItemId || !tripCanEdit || tripEditBusy) return;
    setTripEditBusy(true);
    try {
      const updated = await api.trips.toggleItem(tripId, tripItemId, !tripSelected);
      setTripSelected(!tripSelected);
      onTripUpdated?.(updated);
    } catch (e) {
      Alert.alert("失败", e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setTripEditBusy(false);
    }
  }, [
    tripId,
    tripItemId,
    tripCanEdit,
    tripEditBusy,
    tripSelected,
    onTripUpdated,
  ]);

  const handleSwapTripItem = useCallback(
    async (altIndex: number) => {
      if (!tripId || !tripItemId || !tripCanEdit || tripEditBusy) return;
      setTripEditBusy(true);
      try {
        onTripUpdated?.(await api.trips.swapItem(tripId, tripItemId, altIndex));
      } catch (e) {
        Alert.alert("失败", e instanceof ApiError ? e.message : "换一个失败");
      } finally {
        setTripEditBusy(false);
      }
    },
    [tripId, tripItemId, tripCanEdit, tripEditBusy, onTripUpdated],
  );

  const handleAdd = useCallback(() => {
    if (!mergedItem) return;
    onClose();
    navigation.navigate("Generate", {
      destination: city,
      mode: "custom",
      interests: [mergedItem.name],
      chatHint: `请把「${mergedItem.name}」加入${city}的行程规划`,
    });
  }, [mergedItem, city, navigation, onClose]);

  const handleNavigate = useCallback(() => {
    if (!navTarget) return;
    void openMapNavigation(navTarget);
  }, [navTarget]);

  const handleHours = useCallback(() => {
    if (navTarget) {
      void openAmapPoiLookup(navTarget);
      return;
    }
    void openCtripPoi({
      city,
      name: mergedItem?.name || "",
      kind: category === "foods" ? "meal" : "attraction",
    });
  }, [navTarget, city, mergedItem?.name, category]);

  const handlePhone = useCallback(() => {
    if (phone) {
      void Linking.openURL(telDialUri(phone)).catch(() => {
        Alert.alert("无法拨号", phone);
      });
      return;
    }
    if (navTarget) {
      void openAmapPoiLookup(navTarget);
      return;
    }
    Alert.alert("暂无电话", "未查到联系电话，可在高德地图中查看");
  }, [phone, navTarget]);

  const handleFeedback = useCallback(() => {
    if (!mergedItem) return;
    onClose();
    navigation.navigate("Chat", {
      prefillMessage: `关于「${city} · ${mergedItem.name}」的反馈：`,
    });
  }, [mergedItem, city, navigation, onClose]);

  if (!mergedItem) return null;

  const { positive, neutral } = splitReviewPoints(mergedItem.desc, category);
  const catLabel = CAT_LABEL[category];
  const portalKind =
    category === "foods"
      ? "meal"
      : category === "hotels"
        ? "hotel"
        : "attraction";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.detailRoot}>
        <Pressable style={styles.detailBackdrop} onPress={onClose} />
        <View style={[styles.detailSheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.detailHead}>
              <View style={styles.detailHeadMain}>
                <Text style={styles.detailTitle}>{mergedItem.name}</Text>
                <View style={styles.detailTags}>
                  <View style={styles.detailTag}>
                    <Text style={styles.detailTagText}>
                      {fakePopularity(mergedItem.name)}
                    </Text>
                  </View>
                  <View style={[styles.detailTag, styles.detailTagBlue]}>
                    <Text style={styles.detailTagBlueText}>{catLabel}</Text>
                  </View>
                  {distance ? (
                    <View style={styles.detailTag}>
                      <Text style={styles.detailTagText}>
                        📍 {distance.replace("距我 ", "距离 ")}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <Pressable style={styles.detailClose} onPress={onClose} hitSlop={12}>
                <Text style={styles.detailCloseText}>✕</Text>
              </Pressable>
            </View>

            <View style={[styles.detailSection, { paddingTop: 0 }]}>
              <PoiPortalLinks city={city} name={mergedItem.name} kind={portalKind} />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.detailGallery}
            >
              <PlaceGallery
                city={city}
                name={mergedItem.name}
                category={category === "hotels" ? "spots" : category}
                image={mergedItem.image}
                images={mergedItem.images}
                itemWidth={screenW * 0.72}
                itemStyle={styles.detailGalleryImg}
                count={3}
              />
            </ScrollView>

            <View style={styles.detailSection}>
              <View style={styles.detailSectionHead}>
                <Text style={styles.detailSectionTitle}>地点介绍</Text>
                <View style={styles.aiBadge}>
                  <Text style={styles.aiBadgeText}>AI生成</Text>
                </View>
              </View>
              <Text style={styles.detailDesc}>
                {mergedItem.desc ||
                  `${city} · ${mergedItem.name}，可在下方查看攻略或发起导航。`}
              </Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>真实评价</Text>
              {positive.length || neutral.length ? (
                <>
                  <View style={styles.reviewCardGreen}>
                    <Text style={styles.reviewStickerGreen}>Wow</Text>
                    {positive.map((p, i) => (
                      <ReviewPointRow key={`p-${i}`} label={p.label} text={p.text} />
                    ))}
                  </View>
                  <View style={styles.reviewCardPink}>
                    <Text style={styles.reviewStickerPink}>oh no</Text>
                    {neutral.map((p, i) => (
                      <ReviewPointRow key={`n-${i}`} label={p.label} text={p.text} />
                    ))}
                  </View>
                </>
              ) : (
                <Text style={styles.detailDesc}>
                  暂无评价，可点击上方攻略链接查看真实攻略。
                </Text>
              )}
            </View>

            <View style={styles.infoList}>
              <Pressable style={styles.infoRow} onPress={handleNavigate}>
                <Text style={styles.infoIcon}>📍</Text>
                <View style={styles.infoBody}>
                  <Text style={styles.infoTitle} numberOfLines={1}>
                    {address}
                  </Text>
                  <Text style={styles.infoSub}>
                    {distance ??
                      (userLocation ? "点击导航" : "开启定位后可显示距离")}
                  </Text>
                </View>
                <Text style={styles.infoChevron}>›</Text>
              </Pressable>

              <Pressable style={styles.infoRow} onPress={handleHours}>
                <Text style={styles.infoIcon}>🕐</Text>
                <View style={styles.infoBody}>
                  <Text style={styles.infoTitle}>营业时间</Text>
                  <Text style={styles.infoSub} numberOfLines={2}>
                    {opentime || "点击查看高德/携程最新营业时间"}
                  </Text>
                </View>
                <Text style={styles.infoChevron}>›</Text>
              </Pressable>

              <Pressable style={styles.infoRow} onPress={handlePhone}>
                <Text style={styles.infoIcon}>📞</Text>
                <View style={styles.infoBody}>
                  <Text style={styles.infoTitle}>电话咨询</Text>
                  <Text style={styles.infoSub}>
                    {phone || "点击拨打或在高德地图查看"}
                  </Text>
                </View>
                <Text style={styles.infoChevron}>›</Text>
              </Pressable>

              <Pressable
                style={[styles.infoRow, styles.infoRowLast]}
                onPress={handleFeedback}
              >
                <Text style={styles.infoIcon}>❓</Text>
                <View style={styles.infoBody}>
                  <Text style={styles.infoTitle}>反馈问题</Text>
                  <Text style={styles.infoSub}>向 AI 助手反馈地点信息</Text>
                </View>
                <Text style={styles.infoChevron}>›</Text>
              </Pressable>
            </View>
          </ScrollView>

          {tripItemId && tripCanEdit ? (
            <View style={styles.tripEditSection}>
              <Pressable
                style={styles.tripEditToggle}
                onPress={() => void handleToggleTripItem()}
                disabled={tripEditBusy}
              >
                <Text style={styles.tripEditToggleText}>
                  {tripEditBusy
                    ? "处理中…"
                    : tripSelected
                      ? "从行程中移除"
                      : "恢复此项"}
                </Text>
              </Pressable>
              {(tripAlternatives?.length ?? 0) > 0 ? (
                <View style={styles.tripEditAlts}>
                  <Text style={styles.tripEditAltsLabel}>换一个：</Text>
                  {tripAlternatives!.slice(0, 3).map((alt, i) => (
                    <Pressable
                      key={`${alt.poi_id}-${i}`}
                      style={styles.tripEditAltChip}
                      onPress={() => void handleSwapTripItem(i)}
                      disabled={tripEditBusy}
                    >
                      <Text style={styles.tripEditAltText}>{alt.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.detailActions}>
            <Pressable style={styles.detailActionBtn} onPress={handleAdd}>
              <Text style={styles.detailActionText}>+ 添加至</Text>
            </Pressable>
            <CheckInButton
              checked={checked}
              busy={checkInBusy}
              onPress={() => void handleCheckIn()}
            />
            <Pressable
              style={[styles.detailActionBtn, styles.detailActionPrimary]}
              onPress={handleNavigate}
            >
              <Text style={[styles.detailActionText, styles.detailActionTextPrimary]}>
                ➤ 导航
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

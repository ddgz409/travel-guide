import React, { useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PlaceGallery } from "../../components/PlaceImage";
import { openXiaohongshu } from "../../utils/openExternal";
import { distanceLabel, type LatLng } from "../../utils/geo";
import {
  formatPoiAddress,
  fakePopularity,
  splitReviewPoints,
  xhsItemKeyword,
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
  onClose: () => void;
};

const CAT_LABEL: Record<ExploreCategory, string> = {
  spots: "景点",
  foods: "美食",
};

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
  checked = false,
  onCheckIn,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  const distance = useMemo(
    () => (item ? distanceLabel(userLocation, item) : null),
    [item, userLocation],
  );
  const address = item
    ? formatPoiAddress(city, item.name, item.address)
    : "";

  if (!item) return null;

  const { positive, neutral } = splitReviewPoints(item.desc, category);
  const catLabel = CAT_LABEL[category];
  const xhsKeyword = xhsItemKeyword(city, item.name, category);

  const poiName = item.name;

  function openXhs() {
    void openXiaohongshu({ keyword: xhsKeyword, title: poiName });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailRoot}>
        <Pressable style={styles.detailBackdrop} onPress={onClose} />
        <View style={[styles.detailSheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.detailHead}>
              <View style={styles.detailHeadMain}>
                <Text style={styles.detailTitle}>{item.name}</Text>
                <View style={styles.detailTags}>
                  <View style={styles.detailTag}>
                    <Text style={styles.detailTagText}>{fakePopularity(item.name)}</Text>
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

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.detailGallery}
            >
              <PlaceGallery
                city={city}
                name={item.name}
                category={category}
                image={item.image}
                images={item.images}
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
              <Text style={styles.detailDesc}>{item.desc}</Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>真实评价</Text>

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

              <Pressable style={styles.sourceRow} onPress={openXhs}>
                <Text style={styles.sourceLabel}>内容来源</Text>
                <View style={styles.sourcePill}>
                  <View style={styles.xhsLogo}>
                    <Text style={styles.xhsLogoText}>红</Text>
                  </View>
                  <Text style={styles.sourcePillText}>小红书</Text>
                  <Text style={styles.sourceDropdown}>▾</Text>
                </View>
              </Pressable>
            </View>

            <View style={styles.infoList}>
              <View style={styles.infoRow}>
                <Text style={styles.infoIcon}>🕐</Text>
                <View style={styles.infoBody}>
                  <Text style={styles.infoTitle}>营业时间</Text>
                  <Text style={styles.infoSub}>建议提前查询最新时间</Text>
                </View>
                <Text style={styles.infoChevron}>›</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoIcon}>📍</Text>
                <View style={styles.infoBody}>
                  <Text style={styles.infoTitle} numberOfLines={1}>
                    {address}
                  </Text>
                  <Text style={styles.infoSub}>
                    {distance ?? (userLocation ? "暂无坐标" : "开启定位后可显示距离")}
                  </Text>
                </View>
                <Text style={styles.infoChevron}>›</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoIcon}>📞</Text>
                <View style={styles.infoBody}>
                  <Text style={styles.infoTitle}>电话咨询</Text>
                  <Text style={styles.infoSub}>可在地图 App 中查看</Text>
                </View>
                <Text style={styles.infoChevron}>›</Text>
              </View>
              <View style={[styles.infoRow, styles.infoRowLast]}>
                <Text style={styles.infoIcon}>❓</Text>
                <View style={styles.infoBody}>
                  <Text style={styles.infoTitle}>反馈问题</Text>
                </View>
                <Text style={styles.infoChevron}>›</Text>
              </View>
            </View>
          </ScrollView>

          <View style={styles.detailActions}>
            <Pressable style={styles.detailActionBtn}>
              <Text style={styles.detailActionText}>+ 添加至</Text>
            </Pressable>
            <Pressable
              style={[styles.detailActionBtn, checked && styles.detailActionChecked]}
              onPress={() => onCheckIn?.(item)}
            >
              <Text
                style={[
                  styles.detailActionText,
                  checked && styles.detailActionTextChecked,
                ]}
              >
                {checked ? "✓ 已打卡" : "◎ 打卡"}
              </Text>
            </Pressable>
            <Pressable style={[styles.detailActionBtn, styles.detailActionPrimary]}>
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

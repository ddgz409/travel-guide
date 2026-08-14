import React, { useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AvatarCropRect } from "../utils/avatarImage";
import { colors } from "../theme";

type Props = {
  visible: boolean;
  imageUri: string | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (crop: AvatarCropRect) => void;
};

/** 选图后拖动照片对齐圆框，点「完成」裁切 */
export function AvatarCropSheet({
  visible,
  imageUri,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const frame = Math.min(width - 56, 300);

  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const coverScale = useSharedValue(1);
  const displayW = useSharedValue(0);
  const displayH = useSharedValue(0);
  const imgW = useSharedValue(0);
  const imgH = useSharedValue(0);

  useEffect(() => {
    if (!visible || !imageUri) return;
    let cancelled = false;
    Image.getSize(
      imageUri,
      (w, h) => {
        if (cancelled) return;
        const cs = Math.max(frame / w, frame / h);
        const dw = w * cs;
        const dh = h * cs;
        coverScale.value = cs;
        displayW.value = dw;
        displayH.value = dh;
        imgW.value = w;
        imgH.value = h;
        offsetX.value = (frame - dw) / 2;
        offsetY.value = (frame - dh) / 2;
      },
      () => {
        /* keep defaults */
      },
    );
    return () => {
      cancelled = true;
    };
  }, [
    visible,
    imageUri,
    frame,
    coverScale,
    displayH,
    displayW,
    imgH,
    imgW,
    offsetX,
    offsetY,
  ]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          startX.value = offsetX.value;
          startY.value = offsetY.value;
        })
        .onUpdate((e) => {
          const minX = frame - displayW.value;
          const minY = frame - displayH.value;
          offsetX.value = Math.min(0, Math.max(minX, startX.value + e.translationX));
          offsetY.value = Math.min(0, Math.max(minY, startY.value + e.translationY));
        }),
    [frame, displayH, displayW, offsetX, offsetY, startX, startY],
  );

  const imageStyle = useAnimatedStyle(() => ({
    width: displayW.value,
    height: displayH.value,
    transform: [{ translateX: offsetX.value }, { translateY: offsetY.value }],
  }));

  const handleConfirm = () => {
    const cs = coverScale.value;
    const iw = imgW.value;
    const ih = imgH.value;
    if (!cs || !iw || !ih) return;
    const size = Math.round(frame / cs);
    const maxX = Math.max(0, iw - size);
    const maxY = Math.max(0, ih - size);
    const originX = Math.round(Math.min(maxX, Math.max(0, -offsetX.value / cs)));
    const originY = Math.round(Math.min(maxY, Math.max(0, -offsetY.value / cs)));
    onConfirm({ originX, originY, size });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <GestureHandlerRootView style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Text style={styles.title}>调整头像</Text>
          <View
            style={[
              styles.frame,
              { width: frame, height: frame, borderRadius: frame / 2 },
            ]}
          >
            {imageUri ? (
              <GestureDetector gesture={pan}>
                <Animated.View style={imageStyle}>
                  <Image source={{ uri: imageUri }} style={styles.image} />
                </Animated.View>
              </GestureDetector>
            ) : null}
          </View>
          <Text style={styles.hint}>拖动照片，把想要的部分移进圆框</Text>
          <View style={styles.actions}>
            <Pressable
              style={styles.cancelBtn}
              onPress={onCancel}
              disabled={busy}
            >
              <Text style={styles.cancelText}>取消</Text>
            </Pressable>
            <Pressable
              style={styles.doneBtn}
              onPress={handleConfirm}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.doneText}>完成</Text>
              )}
            </Pressable>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 20,
  },
  frame: {
    overflow: "hidden",
    backgroundColor: "#F0F2F5",
    borderWidth: 3,
    borderColor: "#fff",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  hint: {
    marginTop: 14,
    fontSize: 13,
    color: colors.muted,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
  },
  doneBtn: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: colors.brand,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  doneText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
});

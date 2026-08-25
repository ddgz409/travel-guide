import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  type NativeGesture,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import type { Item } from "@travel-guide/shared";

/** 行卡片之间固定间距（与 ItemListRow feedCard 的 marginBottom 一致） */
const ROW_GAP = 12;

/** 松手落位：Q弹 */
const DROP_SPRING = { damping: 16, stiffness: 300, mass: 0.9 };
/** 长按激活时长 */
const ACTIVATE_MS = 280;
/** 自动滚动边缘/速度 */
const AUTO_EDGE = 72;
const AUTO_SPEED = 7;
/** 震动 ms */
const TICK_MS = 8;

type OrderIds = string[];

/** 拖拽位移 → 目标序号（worklet） */
function computeTarget(
  from: number,
  ty: number,
  orderIds: OrderIds,
  heights: Record<string, number>,
): number {
  "worklet";
  const n = orderIds.length;
  let draggedTop = 0;
  for (let i = 0; i < from; i++) draggedTop += heights[orderIds[i]] || 0;
  const hFrom = heights[orderIds[from]] || 0;
  const draggedCenter = draggedTop + hFrom / 2 + ty;
  let top = 0;
  for (let i = 0; i < n; i++) {
    if (i === from) {
      top += hFrom;
      continue;
    }
    const h = heights[orderIds[i]] || 0;
    const center = top + h / 2;
    if (draggedCenter < center) return i;
    top += h;
  }
  return n - 1;
}

/** 目标槽位相对于原位置的位移（worklet）：负=上移 */
function slotDisplacement(
  from: number,
  to: number,
  orderIds: OrderIds,
  heights: Record<string, number>,
): number {
  "worklet";
  let d = 0;
  if (to > from) {
    for (let i = from + 1; i <= to; i++) d -= heights[orderIds[i]] || 0;
  } else if (to < from) {
    for (let i = to; i < from; i++) d += heights[orderIds[i]] || 0;
  }
  return d;
}

export type ScrollWindow = { top: number; height: number };

/**
 * 单行：左侧竖排操作栏(↑↓✕) + 卡片 + 右侧☰拖拽栏。
 * 操作栏是真实布局空间，不悬浮、不遮挡卡片内容。
 * 拖拽：长按 ☰ 280ms 激活；拖动中卡片 1:1 跟手，
 * 其他行在被越过时瞬时让位 —— 全程所见即所得。
 */
const SortableRow = memo(function SortableRow({
  item,
  canEdit,
  dragDisabled,
  scrollGesture,
  renderRow,
  activeIndex,
  visualFrom,
  dragTy,
  fingerBase,
  targetIndex,
  orderIds,
  heights,
  shifts,
  scrollWindow,
  lastAutoDir,
  onRemove,
  onDragBegin,
  onDragEnd,
  setAutoDir,
  moveBy,
  onMeasure,
  notifyDrag,
  commitOrder,
}: {
  item: Item;
  canEdit: boolean;
  dragDisabled: boolean;
  scrollGesture?: NativeGesture;
  renderRow: (item: Item) => React.ReactElement;
  activeIndex: SharedValue<number>;
  visualFrom: SharedValue<number>;
  dragTy: SharedValue<number>;
  fingerBase: SharedValue<number>;
  targetIndex: SharedValue<number>;
  orderIds: SharedValue<OrderIds>;
  heights: SharedValue<Record<string, number>>;
  shifts: SharedValue<Record<string, number>>;
  scrollWindow: SharedValue<ScrollWindow | null>;
  lastAutoDir: SharedValue<number>;
  onRemove?: (item: Item) => void;
  onDragBegin: () => void;
  onDragEnd: () => void;
  setAutoDir: (dir: number) => void;
  moveBy: (id: string, delta: number) => void;
  onMeasure: (id: string, height: number) => void;
  notifyDrag: (active: boolean) => void;
  commitOrder: (ids: OrderIds) => void;
}) {
  const hapticTick = useCallback(() => Vibration.vibrate(TICK_MS), []);

  /** 让位量：纯数字，直接读取；换位时由拖拽 worklet 一次性赋值 */
  const myShift = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    const ids = orderIds.value;
    const idx = ids.indexOf(item.id);
    const from = visualFrom.value;
    if (idx < 0 || from < 0) {
      return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0 };
    }
    if (idx === from) {
      return {
        transform: [{ translateY: dragTy.value }, { scale: 1.02 }],
        zIndex: 100,
        elevation: 12,
      };
    }
    return {
      transform: [
        { translateY: myShift.value },
        { scale: myShift.value === 0 ? 1 : 0.985 },
      ],
      zIndex: 0,
    };
  });

  const handlePan = useMemo(() => {
    let g = Gesture.Pan()
      .activateAfterLongPress(ACTIVATE_MS)
      .maxPointers(1)
      .enabled(canEdit && !dragDisabled)
      .onStart(() => {
        if (activeIndex.value >= 0) return;
        const idx = orderIds.value.indexOf(item.id);
        if (idx < 0) return;
        activeIndex.value = idx;
        visualFrom.value = idx;
        targetIndex.value = idx;
        dragTy.value = 0;
        fingerBase.value = 0;
        runOnJS(notifyDrag)(true);
        runOnJS(onDragBegin)();
        runOnJS(hapticTick)();
      })
      .onUpdate((e) => {
        const from = activeIndex.value;
        if (from < 0) return;
        const ids = orderIds.value;
        const hs = heights.value;
        const t = computeTarget(from, e.translationY, ids, hs);
        if (t !== targetIndex.value) {
          // 换位：被越过的行瞬时让位（无 spring 重启 → 丝滑不卡）
          const hFrom = hs[ids[from]] || 0;
          const prev = targetIndex.value;
          targetIndex.value = t;
          fingerBase.value = e.translationY;
          if (prev >= 0) {
            // 归位上一轮被推开的行
            if (prev > from) {
              for (let i = from + 1; i <= prev; i++) {
                const k = ids[i];
                if (k != null) shifts.value[k] = 0;
              }
            } else if (prev < from) {
              for (let i = prev; i < from; i++) {
                const k = ids[i];
                if (k != null) shifts.value[k] = 0;
              }
            }
          }
          if (t > from) {
            for (let i = from + 1; i <= t; i++) {
              const k = ids[i];
              if (k != null) shifts.value[k] = -hFrom;
            }
          } else if (t < from) {
            for (let i = t; i < from; i++) {
              const k = ids[i];
              if (k != null) shifts.value[k] = hFrom;
            }
          }
          runOnJS(hapticTick)();
        }
        // 1:1 跟手：目标槽位位移 + 基准内手指微调
        const disp = slotDisplacement(from, t, ids, heights.value);
        dragTy.value = disp + (e.translationY - fingerBase.value);
        // 边缘自动滚动
        const win = scrollWindow.value;
        if (win) {
          const dir =
            e.absoluteY < win.top + AUTO_EDGE
              ? -1
              : e.absoluteY > win.top + win.height - AUTO_EDGE
                ? 1
                : 0;
          if (dir !== lastAutoDir.value) {
            lastAutoDir.value = dir;
            runOnJS(setAutoDir)(dir);
          }
        }
      })
      .onFinalize(() => {
        lastAutoDir.value = 0;
        runOnJS(setAutoDir)(0);
        runOnJS(notifyDrag)(false);
        runOnJS(onDragEnd)();
        const from = activeIndex.value;
        const to = targetIndex.value;
        if (from < 0) return;
        activeIndex.value = -1; // 先解锁，杜绝后续卡死
        if (to >= 0 && to !== from) {
          const ids = orderIds.value.slice();
          const [moved] = ids.splice(from, 1);
          ids.splice(to, 0, moved);
          const exact = slotDisplacement(from, to, orderIds.value, heights.value);
          dragTy.value = withSpring(exact, DROP_SPRING, () => {
            visualFrom.value = -1;
            targetIndex.value = -1;
            dragTy.value = 0;
            fingerBase.value = 0;
          });
          runOnJS(commitOrder)(ids); // 立即提交，不等落位动画
        } else {
          dragTy.value = withSpring(0, DROP_SPRING, () => {
            visualFrom.value = -1;
            targetIndex.value = -1;
            dragTy.value = 0;
            fingerBase.value = 0;
          });
        }
      });
    if (scrollGesture) {
      g = g.blocksExternalGesture(scrollGesture);
    }
    return g;
  }, [
    canEdit,
    dragDisabled,
    scrollGesture,
    activeIndex,
    visualFrom,
    dragTy,
    fingerBase,
    targetIndex,
    orderIds,
    heights,
    shifts,
    scrollWindow,
    lastAutoDir,
    setAutoDir,
    onDragBegin,
    onDragEnd,
    notifyDrag,
    commitOrder,
    hapticTick,
    item.id,
  ]);

  const editing = canEdit && !dragDisabled;

  return (
    <View
      collapsable={false}
      onLayout={(e) => onMeasure(item.id, e.nativeEvent.layout.height)}
    >
      <GestureDetector gesture={handlePan}>
        <Animated.View style={[styles.rowInner, animatedStyle]}>
          {editing ? (
            <View style={styles.railLeft}>
              <Pressable
                style={({ pressed }) => [
                  styles.railBtn,
                  pressed && styles.railBtnPressed,
                ]}
                onPress={() => moveBy(item.id, -1)}
              >
                <Text style={styles.railUp}>↑</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.railBtn,
                  pressed && styles.railBtnPressed,
                ]}
                onPress={() => moveBy(item.id, 1)}
              >
                <Text style={styles.railDown}>↓</Text>
              </Pressable>
              {onRemove ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.railBtn,
                    styles.railX,
                    pressed && styles.railXPressed,
                  ]}
                  onPress={() => onRemove(item)}
                >
                  <Text style={styles.railXIcon}>✕</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.cardSlot}>{renderRow(item)}</View>

          {editing ? (
            <View style={styles.railRight} pointerEvents="box-none">
              <GestureDetector gesture={handlePan}>
                <Pressable
                  style={({ pressed }) => [
                    styles.gripBtn,
                    pressed && styles.gripBtnPressed,
                  ]}
                >
                  <View style={styles.gripBar} />
                  <View style={[styles.gripBar, styles.gripBarMid]} />
                  <View style={styles.gripBar} />
                </Pressable>
              </GestureDetector>
            </View>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

type Props = {
  items: Item[];
  canEdit: boolean;
  dragDisabled?: boolean;
  scrollGesture?: NativeGesture;
  renderRow: (item: Item) => React.ReactElement;
  onOrderChange: (orderedIds: string[]) => void;
  onDragStateChange?: (dragging: boolean) => void;
  /** 编辑态删除单条（左侧 ✕） */
  onRemove?: (item: Item) => void;
  getScrollWindow?: () => ScrollWindow | null;
  onAutoScroll?: (dy: number) => void;
};

/**
 * 当天行程可排序列表。
 *
 * 编辑态：每行左侧竖排 ↑↓✕ 微调/删除，右侧 ☰ 长按拖拽；
 * 拖动全程 1:1 跟手，其他景点被实时挤开预览最终排列；
 * 松手 Q 弹落位后统一回调 onOrderChange。
 */
export function SortableDayList({
  items,
  canEdit,
  dragDisabled = false,
  scrollGesture,
  renderRow,
  onOrderChange,
  onDragStateChange,
  onRemove,
  getScrollWindow,
  onAutoScroll,
}: Props) {
  const [order, setOrder] = useState<Item[]>(items);
  const activeIndex = useSharedValue(-1);
  const visualFrom = useSharedValue(-1);
  const dragTy = useSharedValue(0);
  const fingerBase = useSharedValue(0);
  const targetIndex = useSharedValue(-1);
  const orderIds = useSharedValue<OrderIds>(items.map((it) => it.id));
  const heights = useSharedValue<Record<string, number>>({});
  const shifts = useSharedValue<Record<string, number>>({});
  const scrollWindow = useSharedValue<ScrollWindow | null>(null);
  const lastAutoDir = useSharedValue(0);

  const onDragStateChangeRef = useRef(onDragStateChange);
  onDragStateChangeRef.current = onDragStateChange;
  const onOrderChangeRef = useRef(onOrderChange);
  onOrderChangeRef.current = onOrderChange;

  useEffect(() => {
    setOrder(items);
    orderIds.value = items.map((it) => it.id);
  }, [items, orderIds]);

  const notifyDrag = useCallback((active: boolean) => {
    onDragStateChangeRef.current?.(active);
  }, []);

  // ---- 兜底：退出编辑/禁用时强制复位，绝不留卡死状态 ----
  useEffect(() => {
    if (!canEdit || dragDisabled) {
      activeIndex.value = -1;
      visualFrom.value = -1;
      targetIndex.value = -1;
      dragTy.value = 0;
      fingerBase.value = 0;
      shifts.value = {};
      stopAutoScroll();
      onDragStateChangeRef.current?.(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, dragDisabled]);

  // ---- 自动滚动 ----
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoDirRef = useRef(0);

  const stopAutoScroll = useCallback(() => {
    if (autoTimer.current) {
      clearInterval(autoTimer.current);
      autoTimer.current = null;
    }
    autoDirRef.current = 0;
  }, []);

  const setAutoDir = useCallback(
    (dir: number) => {
      if (!onAutoScroll) return;
      if (autoDirRef.current === dir) return;
      if (autoTimer.current) {
        clearInterval(autoTimer.current);
        autoTimer.current = null;
      }
      autoDirRef.current = dir;
      if (dir !== 0) {
        autoTimer.current = setInterval(() => onAutoScroll(dir * AUTO_SPEED), 16);
      }
    },
    [onAutoScroll],
  );

  const onDragBegin = useCallback(() => {
    const win = getScrollWindow?.() ?? null;
    if (win) scrollWindow.value = win;
  }, [getScrollWindow, scrollWindow]);

  const onDragEnd = useCallback(() => {
    stopAutoScroll();
    Vibration.vibrate(TICK_MS);
  }, [stopAutoScroll]);

  // 卸载兜底：务必把外层滚动解锁
  useEffect(
    () => () => {
      stopAutoScroll();
      onDragStateChangeRef.current?.(false);
    },
    [stopAutoScroll],
  );

  const commitOrder = useCallback(
    (ids: OrderIds) => {
      const map = new Map<string, Item>();
      order.forEach((it) => map.set(it.id, it));
      const next = ids
        .map((id) => map.get(id))
        .filter((it): it is Item => it != null);
      setOrder(next);
      orderIds.value = ids;
      shifts.value = {};
      onOrderChangeRef.current?.(ids);
    },
    [order, orderIds, shifts],
  );

  const moveBy = useCallback(
    (id: string, delta: number) => {
      if (activeIndex.value >= 0) return;
      const ids = orderIds.value.slice();
      const i = ids.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= ids.length) return;
      const tmp = ids[i];
      ids[i] = ids[j];
      ids[j] = tmp;
      Vibration.vibrate(TICK_MS);
      commitOrder(ids);
    },
    [orderIds, activeIndex, commitOrder],
  );

  const onMeasure = useCallback(
    (id: string, h: number) => {
      const layoutH = h + ROW_GAP;
      if (layoutH > 0 && heights.value[id] !== layoutH) {
        heights.value = { ...heights.value, [id]: layoutH };
      }
    },
    [heights],
  );

  return (
    <View>
      {order.map((item) => (
        <SortableRow
          key={item.id}
          item={item}
          canEdit={canEdit}
          dragDisabled={dragDisabled}
          scrollGesture={scrollGesture}
          renderRow={renderRow}
          activeIndex={activeIndex}
          visualFrom={visualFrom}
          dragTy={dragTy}
          fingerBase={fingerBase}
          targetIndex={targetIndex}
          orderIds={orderIds}
          heights={heights}
          shifts={shifts}
          scrollWindow={scrollWindow}
          lastAutoDir={lastAutoDir}
          onRemove={onRemove}
          onDragBegin={onDragBegin}
          onDragEnd={onDragEnd}
          setAutoDir={setAutoDir}
          moveBy={moveBy}
          onMeasure={onMeasure}
          notifyDrag={notifyDrag}
          commitOrder={commitOrder}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  cardSlot: { flex: 1, minWidth: 0 },
  // 左侧竖排操作栏
  railLeft: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginRight: 8,
  },
  railBtn: {
    width: 32,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(33,84,63,0.22)",
  },
  railBtnPressed: { backgroundColor: "#DEF2E4" },
  railUp: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: "900",
    color: "#1B7A43",
    includeFontPadding: false,
  },
  railDown: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: "900",
    color: "#45605A",
    includeFontPadding: false,
  },
  railX: { borderColor: "rgba(198,40,40,0.32)" },
  railXPressed: { backgroundColor: "#FDEBEB" },
  railXIcon: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "800",
    color: "#C62828",
    includeFontPadding: false,
  },
  // 右侧拖拽栏
  railRight: {
    width: 42,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    alignSelf: "stretch",
  },
  gripBtn: {
    width: 36,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DEF2E4",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(27,122,67,0.35)",
  },
  gripBtnPressed: { backgroundColor: "#C4E7CF" },
  gripBar: {
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#1B7A43",
  },
  gripBarMid: { marginVertical: 2.5 },
});

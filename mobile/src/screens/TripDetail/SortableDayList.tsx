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
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import type { Item } from "@travel-guide/shared";

/** 长按激活时长 */
const ACTIVATE_MS = 280;
/** 自动滚动边缘/速度 */
const AUTO_EDGE = 44;
const AUTO_SPEED = 3;
/** 行间距（ItemListRow feedCard 的 marginBottom），提交后递推 tops 用 */
const ROW_GAP = 12;
/** 单次拖拽自动滚动总里程上限（防贴边跑飞） */
const MAX_AUTO_SCROLL = 900;
/** 震动 ms */
const TICK_MS = 8;

type OrderIds = string[];

/**
 * 拖拽判定（worklet）：被拖卡片中心越过哪行的中心线 → 目标序号。
 * 全部使用真实渲染几何（tops/heights：onLayout 实测 + 提交后递推维护）。
 */
function computeTarget(
  from: number,
  tyContent: number,
  orderIds: OrderIds,
  tops: Record<string, number>,
  heights: Record<string, number>,
): number {
  "worklet";
  const n = orderIds.length;
  const topFrom = tops[orderIds[from]];
  const hFrom = heights[orderIds[from]] || 0;
  if (topFrom == null) return from;
  const draggedCenter = topFrom + tyContent + hFrom / 2;
  for (let i = 0; i < n; i++) {
    if (i === from) continue;
    const id = orderIds[i];
    const t = tops[id];
    if (t == null) continue;
    if (draggedCenter < t + (heights[id] || 0) / 2) return i;
  }
  return n - 1;
}

export type ScrollWindow = { top: number; height: number };

/**
 * 单行：左侧竖排操作栏(↑↓) + 卡片 + 右侧(✕☰)。
 *
 * ItemTouchHelper 式交互（Android RecyclerView 拖拽排序范式）：
 * - 被拖卡片每帧贴手指当前位置（translateY 只作用于被拖行）
 * - 中心一旦越过邻行中心线，立即交换数据顺序（列表真相实时正确）
 * - 其他行由 Reanimated layout 弹簧自动滑到新槽位
 * - 松手时顺序已是最终顺序，无需落位动画
 */
const SortableRow = memo(function SortableRow({
  item,
  canEdit,
  dragDisabled,
  scrollGesture,
  renderRow,
  currentIndex,
  visualActive,
  dragTy,
  orderIds,
  tops,
  heights,
  scrollWindow,
  scrollY,
  lastAutoDir,
  onRemove,
  onDragBegin,
  onDragEnd,
  setAutoDir,
  moveBy,
  onMeasure,
  swapTo,
}: {
  item: Item;
  canEdit: boolean;
  dragDisabled: boolean;
  scrollGesture?: NativeGesture;
  renderRow: (item: Item) => React.ReactElement;
  /** 被拖行当前所处序号（随中途交换实时更新） */
  currentIndex: SharedValue<number>;
  /** 拖拽激活标记（>0 时仅当前行消费 dragTy） */
  visualActive: SharedValue<number>;
  dragTy: SharedValue<number>;
  orderIds: SharedValue<OrderIds>;
  tops: SharedValue<Record<string, number>>;
  heights: SharedValue<Record<string, number>>;
  scrollWindow: SharedValue<ScrollWindow | null>;
  scrollY?: SharedValue<number>;
  lastAutoDir: SharedValue<number>;
  onRemove?: (item: Item) => void;
  onDragBegin: () => void;
  onDragEnd: () => void;
  setAutoDir: (dir: number) => void;
  moveBy: (id: string, delta: number) => void;
  onMeasure: (id: string, y: number, height: number) => void;
  /** 中途换位：JS 线程完成数据交换+tops递推 */
  swapTo: (fromIndex: number, toIndex: number) => void;
}) {
  const hapticTick = useCallback(() => Vibration.vibrate(TICK_MS), []);
  /** 抓取偏移：开拖首个可用帧锁定「手指内容系Y − 卡片真实顶」 */
  const grabOffset = useSharedValue<number | null>(null);

  /** 手指屏幕Y → 内容系Y；窗口未就绪返回 null。scrollY 实时回流补偿滚动 */
  const fingerContentY = (absoluteY: number): number | null => {
    "worklet";
    const win = scrollWindow.value;
    if (!win) return null;
    const sy = scrollY?.value ?? 0;
    return absoluteY - win.top + sy;
  };

  // 仅被拖行有位移 transform；其余行走 layout 过渡
  const animatedStyle = useAnimatedStyle(() => {
    const ids = orderIds.value;
    const idx = ids.indexOf(item.id);
    if (idx < 0 || visualActive.value < 0) {
      return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0 };
    }
    if (idx === currentIndex.value) {
      return {
        transform: [{ translateY: dragTy.value }, { scale: 1.02 }],
        zIndex: 100,
        elevation: 12,
      };
    }
    return { transform: [{ translateY: 0 }, { scale: 1 }] };
  });

  const handlePan = useMemo(() => {
    let g = Gesture.Pan()
      .activateAfterLongPress(ACTIVATE_MS)
      .maxPointers(1)
      .enabled(canEdit && !dragDisabled)
      .onStart(() => {
        if (currentIndex.value >= 0) return;
        const idx = orderIds.value.indexOf(item.id);
        if (idx < 0) return;
        currentIndex.value = idx;
        visualActive.value = idx;
        dragTy.value = 0;
        grabOffset.value = null;
        runOnJS(onDragBegin)();
        runOnJS(hapticTick)();
      })
      .onUpdate((e) => {
        const cur = currentIndex.value;
        if (cur < 0) return;
        const ids = orderIds.value;
        const ys = tops.value;
        const hs = heights.value;
        const topCur = ys[ids[cur]];
        const hCur = hs[ids[cur]];
        // 几何未就绪：不判定不位移
        if (topCur == null || !hCur) return;

        // 锁定抓取偏移（首个可用帧）：手指内容系Y − 卡片真实顶
        if (grabOffset.value == null) {
          const f0 = fingerContentY(e.absoluteY);
          if (f0 != null) grabOffset.value = f0 - topCur;
        }
        const f = fingerContentY(e.absoluteY);
        const desiredTop =
          f != null && grabOffset.value != null
            ? f - grabOffset.value
            : topCur + e.translationY;

        // 被拖卡片贴手指（相对其当前真实槽位）
        dragTy.value = desiredTop - topCur;

        // 中心越线即换位：数据先行，视图随后由 layout 弹簧归位
        const t = computeTarget(cur, dragTy.value, ids, ys, hs);
        if (t !== cur) {
          const fromIdx = cur;
          currentIndex.value = t;
          runOnJS(swapTo)(fromIdx, t);
          runOnJS(hapticTick)();
        }

        // 边缘自动滚动（边缘检测用屏幕系；滚动量经 scrollY 回流补偿）
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
        runOnJS(onDragEnd)();
        // 数据顺序已在拖拽中实时交换完毕，这里只清状态
        currentIndex.value = -1;
        visualActive.value = -1;
        dragTy.value = 0;
      });
    if (scrollGesture) {
      g = g.blocksExternalGesture(scrollGesture);
    }
    return g;
  }, [
    canEdit,
    dragDisabled,
    scrollGesture,
    currentIndex,
    visualActive,
    dragTy,
    orderIds,
    tops,
    heights,
    scrollWindow,
    scrollY,
    lastAutoDir,
    setAutoDir,
    onDragBegin,
    onDragEnd,
    swapTo,
    hapticTick,
    item.id,
  ]);

  const editing = canEdit && !dragDisabled;

  return (
    <View
      collapsable={false}
      onLayout={(e) =>
        onMeasure(item.id, e.nativeEvent.layout.y, e.nativeEvent.layout.height)
      }
    >
      {/* layout 过渡负责非拖拽行的滑位动画 */}
      <Animated.View layout={LINEAR_SPRING}>
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
              </View>
            ) : null}

            <View style={styles.cardSlot}>{renderRow(item)}</View>

            {editing ? (
              <View style={styles.railRight}>
                {onRemove ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.railX,
                      pressed && styles.railXPressed,
                    ]}
                    onPress={() => onRemove(item)}
                  >
                    <Text style={styles.railXIcon}>✕</Text>
                  </Pressable>
                ) : null}
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
      </Animated.View>
    </View>
  );
});

// 非拖拽行的滑位动画：数据交换后自动滑到新槽位
const LINEAR_SPRING = LinearTransition.springify().damping(22).stiffness(300);

type Props = {
  items: Item[];
  canEdit: boolean;
  dragDisabled?: boolean;
  scrollGesture?: NativeGesture;
  renderRow: (item: Item) => React.ReactElement;
  onOrderChange: (orderedIds: string[]) => void;
  /** 编辑态删除单条（右上 ✕） */
  onRemove?: (item: Item) => void;
  getScrollWindow?: () => ScrollWindow | null;
  onAutoScroll?: (dy: number) => void;
  /** 列表实时滚动偏移（SharedValue），手指坐标→内容系换算用 */
  scrollY?: SharedValue<number>;
};

/**
 * 当天行程可排序列表 —— ItemTouchHelper 式实现。
 *
 * 拖拽中每次中心越线立即交换数据顺序（列表真相实时正确），
 * 其他景点由 layout 弹簧自动滑开/合拢；被拖卡片全程贴手指；
 * 松手时顺序已是最终顺序。
 */
export function SortableDayList({
  items,
  canEdit,
  dragDisabled = false,
  scrollGesture,
  renderRow,
  onOrderChange,
  onRemove,
  getScrollWindow,
  onAutoScroll,
  scrollY,
}: Props) {
  const [order, setOrder] = useState<Item[]>(items);
  const orderRef = useRef(order);
  orderRef.current = order;

  const currentIndex = useSharedValue(-1);
  const visualActive = useSharedValue(-1);
  const dragTy = useSharedValue(0);
  const orderIds = useSharedValue<OrderIds>(items.map((it) => it.id));
  const heights = useSharedValue<Record<string, number>>({});
  const tops = useSharedValue<Record<string, number>>({});
  const scrollWindow = useSharedValue<ScrollWindow | null>(null);
  const lastAutoDir = useSharedValue(0);

  const onOrderChangeRef = useRef(onOrderChange);
  onOrderChangeRef.current = onOrderChange;

  useEffect(() => {
    setOrder(items);
    orderIds.value = items.map((it) => it.id);
    relayoutTops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  /** 提交后递推 tops：首行锚点沿用测量值，其后按前一行高+间距 */
  const relayoutTops = useCallback(() => {
    const ids = orderIds.value;
    const hs = heights.value;
    const prevTops = tops.value;
    const next: Record<string, number> = {};
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (i === 0) {
        next[id] =
          typeof prevTops[id] === "number" ? (prevTops[id] as number) : 0;
      } else {
        const prevId = ids[i - 1];
        next[id] = next[prevId] + (hs[prevId] || 0) + ROW_GAP;
      }
    }
    tops.value = next;
  }, [orderIds, heights, tops]);

  /**
   * 中途换位（引用稳定，不会在拖拽中重建手势）：
   * 数据先行交换 + tops 递推 + 通知父级。
   */
  const swapTo = useCallback(
    (fromIndex: number, toIndex: number) => {
      const ids = orderIds.value.slice();
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= ids.length ||
        toIndex >= ids.length
      ) {
        return;
      }
      const [moved] = ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, moved);
      const map = new Map<string, Item>();
      orderRef.current.forEach((it) => map.set(it.id, it));
      setOrder(
        ids.map((id) => map.get(id)).filter((it): it is Item => it != null),
      );
      orderIds.value = ids;
      relayoutTops();
      onOrderChangeRef.current?.(ids);
    },
    [orderIds, relayoutTops],
  );

  // ---- 自动滚动 ----
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoDirRef = useRef(0);
  const autoMileageRef = useRef(0);

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
        autoTimer.current = setInterval(() => {
          if (Math.abs(autoMileageRef.current) >= MAX_AUTO_SCROLL) {
            stopAutoScroll();
            return;
          }
          const dy = dir * AUTO_SPEED;
          autoMileageRef.current += dy;
          onAutoScroll(dy);
        }, 16);
      }
    },
    [onAutoScroll, stopAutoScroll],
  );

  const onDragBegin = useCallback(() => {
    autoMileageRef.current = 0;
    const win = getScrollWindow?.() ?? null;
    if (win) scrollWindow.value = win;
  }, [getScrollWindow, scrollWindow]);

  const onDragEnd = useCallback(() => {
    stopAutoScroll();
    Vibration.vibrate(TICK_MS);
  }, [stopAutoScroll]);

  // 卸载兜底
  useEffect(
    () => () => {
      stopAutoScroll();
    },
    [stopAutoScroll],
  );

  // 兜底：退出编辑复位全部手势状态
  useEffect(() => {
    if (!canEdit || dragDisabled) {
      currentIndex.value = -1;
      visualActive.value = -1;
      dragTy.value = 0;
      stopAutoScroll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, dragDisabled]);

  const moveBy = useCallback(
    (id: string, delta: number) => {
      const ids = orderIds.value.slice();
      const i = ids.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= ids.length) return;
      swapTo(i, j);
      Vibration.vibrate(TICK_MS);
    },
    [orderIds, swapTo],
  );

  const onMeasure = useCallback(
    (id: string, y: number, h: number) => {
      if (h <= 0) return;
      let changed = false;
      if (heights.value[id] !== h) {
        heights.value = { ...heights.value, [id]: h };
        changed = true;
      }
      if (tops.value[id] !== y) {
        tops.value = { ...tops.value, [id]: y };
        changed = true;
      }
      if (changed) relayoutTops();
    },
    [heights, tops, relayoutTops],
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
          currentIndex={currentIndex}
          visualActive={visualActive}
          dragTy={dragTy}
          orderIds={orderIds}
          tops={tops}
          heights={heights}
          scrollWindow={scrollWindow}
          scrollY={scrollY}
          lastAutoDir={lastAutoDir}
          onRemove={onRemove}
          onDragBegin={onDragBegin}
          onDragEnd={onDragEnd}
          setAutoDir={setAutoDir}
          moveBy={moveBy}
          onMeasure={onMeasure}
          swapTo={swapTo}
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
  railRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 8,
  },
  railX: {
    width: 32,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(198,40,40,0.32)",
  },
  railXPressed: { backgroundColor: "#FDEBEB" },
  railXIcon: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "800",
    color: "#C62828",
    includeFontPadding: false,
  },
  gripBtn: {
    width: 36,
    height: 30,
    borderRadius: 10,
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

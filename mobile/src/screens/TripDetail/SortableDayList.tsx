import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
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

/** 拖拽中被挤开卡片的让位动画：接近临界阻尼，平滑不回弹 */
const PUSH_SPRING = { damping: 28, stiffness: 300, mass: 0.9 };
/** 松手后的归位动画：稍快一点，干脆利落 */
const DROP_SPRING = { damping: 30, stiffness: 380, mass: 0.9 };

type OrderIds = string[];

/** 根据拖拽位移，计算应插入的目标序号（UI 线程 worklet）。 */
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

type RowProps = {
  item: Item;
  canEdit: boolean;
  dragDisabled: boolean;
  /** 包裹外层竖向 ScrollView 的原生手势，用于与行内拖拽 Pan 协调，避免编辑模式下 UI 线程卡死 */
  scrollGesture?: NativeGesture;
  renderRow: (item: Item) => React.ReactElement;
  activeIndex: SharedValue<number>;
  dragTy: SharedValue<number>;
  targetIndex: SharedValue<number>;
  orderIds: SharedValue<OrderIds>;
  heights: SharedValue<Record<string, number>>;
  onMeasure: (id: string, height: number) => void;
  notifyDrag: (active: boolean) => void;
  commitOrder: (ids: OrderIds) => void;
};

function SortableRow({
  item,
  canEdit,
  dragDisabled,
  scrollGesture,
  renderRow,
  activeIndex,
  dragTy,
  targetIndex,
  orderIds,
  heights,
  onMeasure,
  notifyDrag,
  commitOrder,
}: RowProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const ids = orderIds.value;
    const idx = ids.indexOf(item.id);
    const from = activeIndex.value;
    if (idx < 0 || from < 0) {
      return { transform: [{ translateY: 0 }], zIndex: 0, elevation: 0 };
    }
    if (idx === from) {
      // 被拖拽的卡片跟随手指，不做弹簧（否则有拖泥带水感）
      return {
        transform: [{ translateY: dragTy.value }],
        zIndex: 100,
        elevation: 12,
        opacity: 0.97,
      };
    }
    // 其余卡片被挤开/回落：用弹簧过渡，避免瞬间跳位
    let shift = 0;
    const to = targetIndex.value;
    if (to >= 0 && to !== from) {
      const hFrom = heights.value[ids[from]] || 0;
      if (from < to && idx > from && idx <= to) shift = -hFrom;
      else if (from > to && idx >= to && idx < from) shift = hFrom;
    }
    return {
      transform: [{ translateY: withSpring(shift, PUSH_SPRING) }],
      zIndex: 0,
      elevation: 0,
    };
  });

  const pan = useMemo(
    () => {
      let g = Gesture.Pan()
        .activateAfterLongPress(300)
        .enabled(canEdit && !dragDisabled)
        .onStart(() => {
          // 上一次松手的归位动画尚未落位时忽略新的拖拽
          if (activeIndex.value >= 0) return;
          const idx = orderIds.value.indexOf(item.id);
          if (idx < 0) return;
          activeIndex.value = idx;
          dragTy.value = 0;
          targetIndex.value = idx;
          runOnJS(notifyDrag)(true);
        })
        .onUpdate((e) => {
          const from = activeIndex.value;
          if (from < 0) return;
          dragTy.value = e.translationY;
          targetIndex.value = computeTarget(
            from,
            e.translationY,
            orderIds.value,
            heights.value,
          );
        })
        .onFinalize(() => {
          const from = activeIndex.value;
          const to = targetIndex.value;
          if (from < 0) return;
          if (to >= 0 && to !== from) {
            // 先把卡片弹簧滑到目标槽位的视觉位置，落位动画结束后再切换数据，
            // 布局与变换同帧交换，消除「松手瞬移」的生硬感。
            const ids = orderIds.value.slice();
            const [moved] = ids.splice(from, 1);
            ids.splice(to, 0, moved);
            const hs = heights.value;
            let land = dragTy.value;
            if (to > from) {
              for (let i = from + 1; i <= to; i++) land -= hs[ids[i]] || 0;
            } else {
              for (let i = to; i < from; i++) land += hs[ids[i]] || 0;
            }
            dragTy.value = withSpring(land, DROP_SPRING, (finished) => {
              if (!finished) return;
              runOnJS(commitOrder)(ids);
            });
          } else {
            // 未跨越阈值：弹回原位
            dragTy.value = withSpring(0, DROP_SPRING, () => {
              activeIndex.value = -1;
              targetIndex.value = -1;
            });
          }
        });
      if (scrollGesture) {
        g = g.blocksExternalGesture(scrollGesture);
      }
      return g;
    },
    [
      item.id,
      canEdit,
      dragDisabled,
      scrollGesture,
      activeIndex,
      dragTy,
      targetIndex,
      orderIds,
      heights,
      notifyDrag,
      commitOrder,
    ],
  );

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={animatedStyle}
        collapsable={false}
        onLayout={(e) => onMeasure(item.id, e.nativeEvent.layout.height)}
      >
        {renderRow(item)}
      </Animated.View>
    </GestureDetector>
  );
}

type Props = {
  items: Item[];
  canEdit: boolean;
  dragDisabled?: boolean;
  /** 包裹外层竖向 ScrollView 的原生手势；传入后行内拖拽会与它协调（blocksExternalGesture） */
  scrollGesture?: NativeGesture;
  renderRow: (item: Item) => React.ReactElement;
  onOrderChange: (orderedIds: string[]) => void;
  onDragStateChange?: (dragging: boolean) => void;
};

/**
 * 当天行程的可排序列表：长按任意行后上下拖动调整顺序。
 * 拖动过程中不发请求，松手(onFinalize)后统一回调 onOrderChange 触发重新规划。
 */
export function SortableDayList({
  items,
  canEdit,
  dragDisabled = false,
  scrollGesture,
  renderRow,
  onOrderChange,
  onDragStateChange,
}: Props) {
  const [order, setOrder] = useState<Item[]>(items);
  const activeIndex = useSharedValue(-1);
  const dragTy = useSharedValue(0);
  const targetIndex = useSharedValue(-1);
  const orderIds = useSharedValue<OrderIds>(items.map((it) => it.id));
  const heights = useSharedValue<Record<string, number>>({});

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

  const commitOrder = useCallback(
    (ids: OrderIds) => {
      // 同一 JS 任务内先归零全部拖拽变换、再更新顺序数据，
      // 让布局切换与变换清零在同批 UI 更新中生效，避免闪跳。
      activeIndex.value = -1;
      targetIndex.value = -1;
      dragTy.value = 0;
      const map = new Map<string, Item>();
      order.forEach((it) => map.set(it.id, it));
      const next = ids
        .map((id) => map.get(id))
        .filter((it): it is Item => it != null);
      setOrder(next);
      orderIds.value = ids;
      onOrderChangeRef.current?.(ids);
    },
    [order, orderIds, activeIndex, targetIndex, dragTy],
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
          dragTy={dragTy}
          targetIndex={targetIndex}
          orderIds={orderIds}
          heights={heights}
          onMeasure={onMeasure}
          notifyDrag={notifyDrag}
          commitOrder={commitOrder}
        />
      ))}
    </View>
  );
}

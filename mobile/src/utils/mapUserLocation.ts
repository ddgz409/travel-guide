import { peekCachedAccuracy } from "./location";

export type UserLocOnMapOpts = {
  /** 移动地图中心到用户位置 */
  center?: boolean;
  zoom?: number;
  accuracy?: number;
  /** 清除 POI 倒水滴 marker（探索页等仅显示定位点时） */
  clearMarkers?: boolean;
};

/** 生成注入 WebView 的 JS：官方 CircleMarker + 精度圈 */
export function buildMapUserLocationJs(
  lng: number,
  lat: number,
  opts: UserLocOnMapOpts = {},
): string {
  const acc = opts.accuracy ?? peekCachedAccuracy() ?? 65;
  const zoom = opts.zoom ?? 15;
  const lines = [
    "(function(){",
    "if(!window.__map)return;",
  ];
  if (opts.clearMarkers) {
    lines.push(
      "if(window.updateMapData)window.updateMapData([],[],false,false,0);",
    );
  }
  lines.push(
    `if(window.setUserLocation)window.setUserLocation(${lng},${lat},false,${acc});`,
  );
  if (opts.center) {
    lines.push(`window.__map.setZoomAndCenter(${zoom},[${lng},${lat}]);`);
  }
  lines.push("})();true;");
  return lines.join("");
}

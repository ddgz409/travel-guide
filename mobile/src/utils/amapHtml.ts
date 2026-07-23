/** 生成高德 JS API 地图 HTML（日行程 / 全屏 / 单段路线共用） */

export type MapMarker = { lng: number; lat: number; name: string };

export function buildAmapHtml(opts: {
  key: string;
  markers: MapMarker[];
  polyline?: number[][];
  /** 预览关闭拖拽/缩放，避免与页面滚动冲突 */
  interactive?: boolean;
  /** 用户定位点 */
  userLocation?: { lng: number; lat: number } | null;
}): string {
  const {
    key,
    markers,
    polyline = [],
    interactive = true,
    userLocation = null,
  } = opts;
  const payload = JSON.stringify({
    markers,
    polyline,
    interactive: !!interactive,
    userLocation,
  });
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <style>
    html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#f3f4f6;overflow:hidden}
    .pin{
      width:28px;height:28px;border-radius:50%;
      background:#ff6d00;color:#fff;
      font:700 13px/28px -apple-system,BlinkMacSystemFont,sans-serif;
      text-align:center;
      border:2.5px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,.28);
    }
    .user-dot{
      width:16px;height:16px;border-radius:50%;
      background:#1a66ff;border:3px solid #fff;
      box-shadow:0 0 0 6px rgba(26,102,255,.22),0 2px 6px rgba(0,0,0,.2);
    }
  </style>
  <script src="https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}"></script>
</head>
<body>
  <div id="map"></div>
  <script>
    (function () {
      var data = ${payload};
      var markers = data.markers || [];
      var polyline = data.polyline || [];
      var interactive = !!data.interactive;
      window.__map = null;
      window.__userMarker = null;

      function post(type, payload) {
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload || null }));
          }
        } catch (e) {}
      }

      function boot() {
        if (!window.AMap) {
          document.body.innerHTML = '<div style="padding:16px;font:14px sans-serif;color:#666">高德地图脚本加载失败，请检查 JS Key 或网络</div>';
          return;
        }
        var map = new AMap.Map('map', {
          zoom: 12,
          viewMode: '2D',
          dragEnable: interactive,
          zoomEnable: interactive,
          doubleClickZoom: interactive,
          scrollWheel: interactive,
          touchZoom: interactive,
          keyboardEnable: false
        });
        window.__map = map;
        var points = [];
        markers.forEach(function (m, i) {
          var pos = [m.lng, m.lat];
          points.push(pos);
          new AMap.Marker({
            map: map,
            position: pos,
            title: m.name,
            offset: new AMap.Pixel(-14, -14),
            content: '<div class="pin">' + String(i + 1) + '</div>'
          });
        });
        if (polyline.length > 1) {
          new AMap.Polyline({
            map: map,
            path: polyline.map(function (p) { return [p[0], p[1]]; }),
            strokeColor: '#1a66ff',
            strokeWeight: 5,
            strokeOpacity: 0.9
          });
        } else if (points.length > 1) {
          new AMap.Polyline({
            map: map,
            path: points,
            strokeColor: '#1a66ff',
            strokeWeight: 4,
            strokeOpacity: 0.75,
            strokeStyle: 'dashed'
          });
        }
        if (data.userLocation && data.userLocation.lng != null) {
          window.setUserLocation(data.userLocation.lng, data.userLocation.lat, false);
        }
        if (points.length) map.setFitView(null, false, [40, 40, 40, 40]);
        post('ready');
      }

      window.zoomIn = function () {
        if (window.__map) window.__map.zoomIn();
      };
      window.zoomOut = function () {
        if (window.__map) window.__map.zoomOut();
      };
      window.setUserLocation = function (lng, lat, center) {
        if (!window.__map || !window.AMap) return;
        var pos = [lng, lat];
        if (window.__userMarker) {
          window.__userMarker.setPosition(pos);
        } else {
          window.__userMarker = new AMap.Marker({
            map: window.__map,
            position: pos,
            offset: new AMap.Pixel(-8, -8),
            content: '<div class="user-dot"></div>',
            zIndex: 120
          });
        }
        if (center) window.__map.setZoomAndCenter(15, pos);
      };

      if (window.AMap) boot();
      else setTimeout(boot, 500);
    })();
  </script>
</body>
</html>`;
}

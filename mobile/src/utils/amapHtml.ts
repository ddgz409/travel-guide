/** 生成高德 JS API 地图 HTML（日行程 / 全屏 / 单段路线共用） */

export type MapMarker = {
  lng: number;
  lat: number;
  name: string;
  /** 行程条目 id，点击跳转详情 */
  itemId?: string;
  /** 自定义 pin 背景色 */
  color?: string;
  /** pin 内显示的 emoji 或单字符 */
  icon?: string;
};

export function buildAmapHtml(opts: {
  key: string;
  markers: MapMarker[];
  polyline?: number[][];
  /** 预览关闭拖拽/缩放，避免与页面滚动冲突 */
  interactive?: boolean;
  /** 用户定位点 */
  userLocation?: { lng: number; lat: number } | null;
  /** 多 marker 时是否用虚线串联，默认 true（行程地图）；探索页可关 */
  linkMarkers?: boolean;
  /** 中心聚焦：视口中心附近 marker 高亮，其余变淡 */
  focusCenter?: boolean;
  /** 分类模式下每屏最多渲染数量，0 表示不限制 */
  viewportLimit?: number;
}): string {
  const {
    key,
    markers,
    polyline = [],
    interactive = true,
    userLocation = null,
    linkMarkers = true,
    focusCenter = false,
    viewportLimit = 0,
  } = opts;
  const payload = JSON.stringify({
    markers,
    polyline,
    interactive: !!interactive,
    userLocation,
    linkMarkers: !!linkMarkers,
    focusCenter: !!focusCenter,
    viewportLimit: viewportLimit || 0,
  });
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <style>
    html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#f3f4f6;overflow:hidden}
    .pin{
      width:32px;height:32px;border-radius:50%;
      background:#ff6d00;color:#fff;
      font:700 13px/32px -apple-system,BlinkMacSystemFont,sans-serif;
      text-align:center;
      border:2.5px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,.28);
      display:flex;align-items:center;justify-content:center;
    }
    .pin-emoji{font-size:15px;line-height:1}
    .pin-marker{transition:opacity .25s ease,transform .25s ease,filter .25s ease;cursor:pointer}
    .user-dot{
      width:16px;height:16px;border-radius:50%;
      background:#1a66ff;border:3px solid #fff;
      box-shadow:0 0 0 6px rgba(26,102,255,.22),0 2px 6px rgba(0,0,0,.2);
    }
    .amap-logo,
    .amap-copyright,
    .amap-mcode {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
    .amap-logo img {
      display: none !important;
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
      window.__allMarkers = markers.slice();
      window.__polyline = polyline.slice();

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
        window.__overlays = window.__overlays || [];
        window.__markerEls = [];

        function applyMarkerFocus() {
          if (!data.focusCenter || !window.__map || !window.__markerEls.length) return;
          var size = window.__map.getSize();
          if (!size || !size.width) return;
          var cx = size.width / 2;
          var cy = size.height / 2;
          var ranked = window.__markerEls.map(function (entry, i) {
            var px = window.__map.lngLatToContainer(entry.pos);
            var dx = px.x - cx;
            var dy = px.y - cy;
            return { i: i, d: Math.sqrt(dx * dx + dy * dy) };
          }).sort(function (a, b) { return a.d - b.d; });
          var n = window.__markerEls.length;
          var focusCount = Math.min(5, Math.max(3, Math.ceil(n * 0.35)));
          var focusRadius = Math.min(size.width, size.height) * 0.24;
          var focusSet = {};
          ranked.forEach(function (r, idx) {
            if (idx < focusCount && r.d <= focusRadius * 1.85) focusSet[r.i] = true;
          });
          if (Object.keys(focusSet).length === 0) {
            for (var j = 0; j < Math.min(3, ranked.length); j++) focusSet[ranked[j].i] = true;
          }
          window.__markerEls.forEach(function (entry, i) {
            var focused = !!focusSet[i];
            entry.el.style.opacity = focused ? '1' : '0.38';
            entry.el.style.transform = focused ? 'scale(1.08)' : 'scale(0.88)';
            entry.el.style.filter = focused ? 'none' : 'grayscale(45%)';
            entry.el.style.zIndex = focused ? '30' : '8';
          });
        }
        window.__applyMarkerFocus = applyMarkerFocus;
        window.__viewportMode = !!(data.focusCenter && data.viewportLimit);
        window.__viewportLimit = data.viewportLimit || 20;

        function getDynamicLimit() {
          if (!window.__viewportMode) return 0;
          var z = window.__map ? window.__map.getZoom() : 12;
          var cap = window.__allMarkers ? window.__allMarkers.length : 0;
          if (z >= 16) return Math.min(cap, 40);
          if (z >= 14) return Math.min(cap, 28);
          return Math.min(cap, window.__viewportLimit || 20);
        }

        /** 按屏幕像素：只取当前视野内的点，放大/拖动后换一批 */
        function pickViewportMarkers(all) {
          var limit = getDynamicLimit();
          if (!limit || !all.length || all.length <= limit) return all;
          var map = window.__map;
          if (!map) return all.slice(0, limit);
          var size = map.getSize();
          if (!size || !size.width) return all.slice(0, limit);
          var cx = size.width / 2;
          var cy = size.height / 2;
          var margin = 24;
          var ranked = [];
          all.forEach(function (m) {
            var px = map.lngLatToContainer([m.lng, m.lat]);
            if (!px) return;
            if (px.x < -margin || px.y < -margin ||
                px.x > size.width + margin || px.y > size.height + margin) {
              return;
            }
            var d = Math.sqrt(Math.pow(px.x - cx, 2) + Math.pow(px.y - cy, 2));
            ranked.push({ m: m, d: d });
          });
          if (!ranked.length) {
            var center = map.getCenter();
            all.forEach(function (m) {
              var d = Math.pow(m.lng - center.lng, 2) + Math.pow(m.lat - center.lat, 2);
              ranked.push({ m: m, d: d });
            });
          }
          ranked.sort(function (a, b) { return a.d - b.d; });
          return ranked.slice(0, limit).map(function (r) { return r.m; });
        }

        window.__onMapIdle = function () {
          if (window.__viewportMode && window.__redraw) {
            window.__redraw();
          } else if (window.__applyMarkerFocus) {
            window.__applyMarkerFocus();
          }
        };

        function clearOverlays() {
          (window.__overlays || []).forEach(function (o) {
            try { o.setMap(null); } catch (e) {}
          });
          window.__overlays = [];
          window.__markerEls = [];
        }

        function drawMarkersAndRoute() {
          clearOverlays();
          points = [];
          var source = window.__allMarkers || [];
          markers = window.__viewportMode ? pickViewportMarkers(source) : source;
          if (window.__viewportMode && source.length) {
            post('viewportStats', { visible: markers.length, total: source.length });
          }
          markers.forEach(function (m, i) {
            var pos = [m.lng, m.lat];
            points.push(pos);
            var bg = m.color || '#ff6d00';
            var inner = m.icon
              ? '<span class="pin-emoji">' + m.icon + '</span>'
              : String(i + 1);
            var div = document.createElement('div');
            div.className = 'pin' + (data.focusCenter ? ' pin-marker' : '');
            div.style.background = bg;
            div.innerHTML = inner;
            if (!data.focusCenter) div.style.opacity = '1';
            var lastMarkerTap = 0;
            function emitMarkerTap(m) {
              var now = Date.now();
              if (now - lastMarkerTap < 350) return;
              lastMarkerTap = now;
              post('markerTap', {
                name: m.name,
                lng: m.lng,
                lat: m.lat,
                itemId: m.itemId || null
              });
            }
            var mk = new AMap.Marker({
              map: map,
              position: pos,
              title: m.name,
              offset: new AMap.Pixel(-16, -16),
              content: div,
              zIndex: data.focusCenter ? 10 : 100 + i
            });
            mk.on('click', function () {
              emitMarkerTap(m);
            });
            div.addEventListener('click', function (e) {
              e.stopPropagation();
              emitMarkerTap(m);
            });
            window.__overlays.push(mk);
            if (data.focusCenter) window.__markerEls.push({ pos: pos, el: div });
          });
          var routeLine = window.__polyline || polyline;
          if (routeLine.length > 1) {
            var pl = new AMap.Polyline({
              map: map,
              path: routeLine.map(function (p) { return [p[0], p[1]]; }),
              strokeColor: '#1a66ff',
              strokeWeight: 5,
              strokeOpacity: data.focusCenter ? 0.25 : 0.9
            });
            window.__overlays.push(pl);
          } else if (points.length > 1 && data.linkMarkers && !data.focusCenter) {
            var dl = new AMap.Polyline({
              map: map,
              path: points,
              strokeColor: '#1a66ff',
              strokeWeight: 4,
              strokeOpacity: 0.75,
              strokeStyle: 'dashed'
            });
            window.__overlays.push(dl);
          }
          if (points.length) {
            if (data.focusCenter) {
              if (source.length > 1 && !window.__didCenterCategory) {
                window.__didCenterCategory = true;
                var sumLng = 0, sumLat = 0;
                source.forEach(function (m) { sumLng += m.lng; sumLat += m.lat; });
                var z = source.length > 40 ? 12 : source.length > 15 ? 13 : 14;
                map.setZoomAndCenter(z, [sumLng / source.length, sumLat / source.length]);
              }
              setTimeout(applyMarkerFocus, 150);
            } else {
              window.__didCenterCategory = false;
              map.setFitView(null, false, [48, 48, 48, 48]);
            }
          }
        }

        drawMarkersAndRoute();
        window.__redraw = drawMarkersAndRoute;
        if (!window.__focusBound) {
          window.__focusBound = true;
          map.on('moveend', function () { window.__onMapIdle(); });
          map.on('zoomend', function () { window.__onMapIdle(); });
          map.on('zoomchange', function () {
            if (!window.__viewportMode) return;
            clearTimeout(window.__viewportTimer);
            window.__viewportTimer = setTimeout(function () {
              window.__onMapIdle();
            }, 150);
          });
        }
        if (data.userLocation && data.userLocation.lng != null) {
          window.setUserLocation(data.userLocation.lng, data.userLocation.lat, false);
        }
        if (interactive) {
          var mapTouching = false;
          function setMapTouching(active) {
            if (mapTouching === active) return;
            mapTouching = active;
            post('mapGesture', { active: active });
          }
          map.on('touchstart', function () { setMapTouching(true); });
          map.on('touchend', function () { setMapTouching(false); });
          map.on('touchcancel', function () { setMapTouching(false); });
          map.on('dragstart', function () { setMapTouching(true); });
          map.on('dragend', function () { setMapTouching(false); });
        }
        post('ready');
      }

      window.zoomIn = function () {
        if (!window.__map) return;
        window.__map.zoomIn();
        setTimeout(function () {
          if (window.__onMapIdle) window.__onMapIdle();
        }, 220);
      };
      window.zoomOut = function () {
        if (!window.__map) return;
        window.__map.zoomOut();
        setTimeout(function () {
          if (window.__onMapIdle) window.__onMapIdle();
        }, 220);
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

      window.updateMapData = function (nextMarkers, nextPolyline, linkMarkers, focusCenter, viewportLimit) {
        if (!window.__map || !window.AMap || !window.__redraw) return;
        window.__allMarkers = (nextMarkers || []).slice();
        window.__polyline = (nextPolyline || []).slice();
        polyline = window.__polyline;
        data.linkMarkers = linkMarkers !== false;
        if (typeof focusCenter === 'boolean') data.focusCenter = focusCenter;
        if (typeof viewportLimit === 'number') data.viewportLimit = viewportLimit;
        window.__viewportLimit = viewportLimit || 20;
        window.__viewportMode = !!(focusCenter && viewportLimit > 0);
        window.__didCenterCategory = false;
        window.__redraw();
      };

      if (window.AMap) boot();
      else setTimeout(boot, 500);
    })();
  </script>
</body>
</html>`;
}

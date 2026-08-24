/** 生成高德 JS API 地图 HTML（日行程 / 全屏 / 单段路线共用） */

export type MapMarker = {
  lng: number;
  lat: number;
  name: string;
  /** 行程条目 id，点击跳转详情 */
  itemId?: string;
  /** 自定义 pin 背景色 */
  color?: string;
  /** pin 内显示：emoji，或 1–2 位序号（行程路线） */
  icon?: string;
  /** 与 icon 相同，纯倒水滴时可省略 */
  label?: string;
};

export function buildAmapHtml(opts: {
  key: string;
  markers: MapMarker[];
  polyline?: number[][];
  /** 多段折线：无路线数据的段之间断开（优先于 polyline） */
  polylines?: number[][][];
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
  /** 地图选点模式：点击地图回调 mapClick（新增地点用） */
  pickMode?: boolean;
}): string {
  const {
    key,
    markers,
    polyline = [],
    polylines = [],
    interactive = true,
    userLocation = null,
    linkMarkers = true,
    focusCenter = false,
    viewportLimit = 0,
    pickMode = false,
  } = opts;
  const payload = JSON.stringify({
    markers,
    polyline,
    polylines,
    interactive: !!interactive,
    userLocation,
    linkMarkers: !!linkMarkers,
    focusCenter: !!focusCenter,
    viewportLimit: viewportLimit || 0,
    pickMode: !!pickMode,
  });
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <style>
    html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#f3f4f6;overflow:hidden}
    .pin-drop{
      position:relative;
      width:32px;
      height:42px;
    }
    .pin-drop-shape{
      position:absolute;
      top:5px;
      left:3px;
      width:26px;
      height:26px;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      background:var(--pin,#1a66ff);
      border:2.5px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,.28);
      display:flex;
      align-items:center;
      justify-content:center;
    }
    .pin-drop-label{
      transform:rotate(45deg);
      color:#fff;
      font:700 11px/1 -apple-system,BlinkMacSystemFont,sans-serif;
      font-variant-numeric:tabular-nums;
      letter-spacing:-0.02em;
      margin-top:-2px;
      margin-left:1px;
      pointer-events:none;
    }
    .pin-drop-label-wide{
      font-size:9px;
      letter-spacing:-0.04em;
    }
    .pin-emoji{
      position:absolute;
      top:5px;
      left:3px;
      width:26px;
      height:26px;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:13px;
      line-height:1;
      z-index:1;
      pointer-events:none;
    }
    .pin-marker{transition:opacity .25s ease,transform .25s ease,filter .25s ease;cursor:pointer}
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
  <script src="https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.Geolocation"></script>
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
      window.__userLocDot = null;
      window.__userLocAcc = null;
      window.__userLocPos = null;
      window.__allMarkers = markers.slice();
      window.__polyline = polyline.slice();
      // 多段折线优先；否则由单条折线退化而来
      window.__polylines =
        data.polylines && data.polylines.length
          ? data.polylines.filter(function (g) { return g && g.length > 1; })
          : window.__polyline.length
            ? [window.__polyline]
            : [];

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

        // ---- 地图选点模式（新增地点）：点击地图回调 mapClick ----
        window.__pickMode = !!data.pickMode;
        window.__pickMarker = null;
        window.__pickHandler = null;

        function ensurePickMarker() {
          if (window.__pickMarker) return;
          var div = document.createElement('div');
          div.style.position = 'relative';
          div.style.width = '38px';
          div.style.height = '38px';
          div.innerHTML = '<div style="position:absolute;left:4px;top:4px;width:30px;height:30px;border-radius:50%;background:#e8453c;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.35)"></div>';
          window.__pickMarker = new AMap.Marker({
            position: [0, 0],
            anchor: 'center',
            content: div,
            zIndex: 500
          });
          window.__pickMarker.setMap(map);
          window.__pickMarker.hide();
        }

        function onPickClick(e) {
          if (!window.__pickMode || !e.lnglat) return;
          var pos = [e.lnglat.getLng(), e.lnglat.getLat()];
          ensurePickMarker();
          window.__pickMarker.setPosition(pos);
          window.__pickMarker.show();
          map.setZoomAndCenter(16, pos);
          post('mapClick', { lng: pos[0], lat: pos[1] });
        }

        window.setPickMode = function (on) {
          window.__pickMode = !!on;
          if (on) {
            if (!window.__pickHandler) {
              window.__pickHandler = onPickClick;
              map.on('click', window.__pickHandler);
            }
          } else {
            if (window.__pickHandler) {
              map.off('click', window.__pickHandler);
              window.__pickHandler = null;
            }
            if (window.__pickMarker) window.__pickMarker.hide();
          }
        };
        if (data.pickMode) window.setPickMode(true);

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
            var bg = m.color || '#1a66ff';
            var label = m.icon ? String(m.icon) : (m.label ? String(m.label) : '');
            var isEmoji = label && !/^[0-9]{1,2}$/.test(label);
            var div = document.createElement('div');
            div.className = 'pin-drop' + (data.focusCenter ? ' pin-marker' : '');
            div.style.setProperty('--pin', bg);
            if (label && isEmoji) {
              div.innerHTML =
                '<div class="pin-drop-shape"></div><span class="pin-emoji">' +
                label +
                '</span>';
            } else if (label) {
              var wide = label.length > 1 ? ' pin-drop-label-wide' : '';
              div.innerHTML =
                '<div class="pin-drop-shape"><span class="pin-drop-label' +
                wide +
                '">' +
                label +
                '</span></div>';
            } else {
              div.innerHTML = '<div class="pin-drop-shape"></div>';
            }
            if (!data.focusCenter) div.style.opacity = '1';
            var lastMarkerTap = 0;
            function emitMarkerTap(m) {
              var now = Date.now();
              if (window.__pickMode) return; // 选点模式下点击 marker 不打开详情
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
              anchor: 'bottom-center',
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
          // 多段折线：无真实路线数据的段之间保持断开，不画直线
          var routeLines = (window.__polylines && window.__polylines.length)
            ? window.__polylines
            : (window.__polyline && window.__polyline.length > 1 ? [window.__polyline] : []);
          routeLines.forEach(function (routeLine) {
            if (!routeLine || routeLine.length < 2) return;
            var pl = new AMap.Polyline({
              map: map,
              path: routeLine.map(function (p) { return [p[0], p[1]]; }),
              strokeColor: '#1a66ff',
              strokeWeight: 5,
              strokeOpacity: data.focusCenter ? 0.25 : 0.9
            });
            window.__overlays.push(pl);
          });
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
          map.on('zoomend', function () {
            window.__onMapIdle();
            if (window.__ensureUserLocVisible) window.__ensureUserLocVisible();
          });
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
        setTimeout(function () {
          if (window.__mapResize) window.__mapResize();
        }, 120);
      }

      window.__mapResize = function () {
        if (!window.__map) return;
        try { window.__map.resize(); } catch (e) {}
      };

      var bootAttempts = 0;
      function tryBoot() {
        if (!window.AMap) {
          bootAttempts += 1;
          if (bootAttempts < 20) {
            setTimeout(tryBoot, 400);
            return;
          }
          post('error', { reason: 'amap_script' });
          document.body.innerHTML = '<div style="padding:16px;font:14px sans-serif;color:#666">高德地图脚本加载失败，请检查网络后重试</div>';
          return;
        }
        boot();
      }

      if (window.AMap) tryBoot();
      else tryBoot();

      window.zoomIn = function () {
        if (!window.__map) return;
        window.__map.zoomIn();
        setTimeout(function () {
          if (window.__onMapIdle) window.__onMapIdle();
          if (window.__ensureUserLocVisible) window.__ensureUserLocVisible();
        }, 220);
      };
      window.zoomOut = function () {
        if (!window.__map) return;
        window.__map.zoomOut();
        setTimeout(function () {
          if (window.__onMapIdle) window.__onMapIdle();
          if (window.__ensureUserLocVisible) window.__ensureUserLocVisible();
        }, 220);
      };
      window.setUserLocation = function (lng, lat, center, accuracy) {
        if (!window.__map || !window.AMap) return;
        var pos = [lng, lat];
        window.__userLocPos = pos;
        var acc = typeof accuracy === 'number' && accuracy > 0 ? accuracy : 65;
        if (!window.__userLocDot) {
          window.__userLocDot = new AMap.CircleMarker({
            center: pos,
            radius: 9,
            strokeColor: '#ffffff',
            strokeWeight: 3,
            strokeOpacity: 1,
            fillColor: '#1a66ff',
            fillOpacity: 1,
            zIndex: 200,
            bubble: true,
          });
          window.__userLocAcc = new AMap.Circle({
            center: pos,
            radius: acc,
            strokeColor: '#0093FF',
            strokeOpacity: 0.45,
            strokeWeight: 1,
            fillColor: '#02B0FF',
            fillOpacity: 0.22,
            zIndex: 199,
            bubble: true,
          });
          window.__map.add(window.__userLocAcc);
          window.__map.add(window.__userLocDot);
        } else {
          window.__userLocDot.setCenter(pos);
          window.__userLocAcc.setCenter(pos);
          window.__userLocAcc.setRadius(Math.max(15, Math.min(acc, 250)));
          if (!window.__userLocDot.getMap()) {
            window.__map.add(window.__userLocAcc);
            window.__map.add(window.__userLocDot);
          }
        }
        if (center) window.__map.setZoomAndCenter(15, pos);
      };
      window.__ensureUserLocVisible = function () {
        if (!window.__userLocPos || !window.__map || !window.AMap) return;
        var p = window.__userLocPos;
        if (!window.__userLocDot || !window.__userLocDot.getMap()) {
          window.setUserLocation(p[0], p[1], false);
          return;
        }
        window.__userLocDot.setCenter(p);
        if (window.__userLocAcc) window.__userLocAcc.setCenter(p);
      };
      window.clearUserLocation = function () {
        window.__userLocPos = null;
        if (window.__userLocDot) {
          try { window.__userLocDot.setMap(null); } catch (e) {}
        }
        if (window.__userLocAcc) {
          try { window.__userLocAcc.setMap(null); } catch (e) {}
        }
      };

      window.updateMapData = function (nextMarkers, nextPolyline, linkMarkers, focusCenter, viewportLimit) {
        if (!window.__map || !window.AMap || !window.__redraw) return;
        window.__allMarkers = (nextMarkers || []).slice();
        // 兼容两种入参：number[][]（单条折线，旧版）或 number[][][]（多条折线，
        // 用于无路线数据的段之间断开、不画直线）
        var np = nextPolyline || [];
        if (np.length && np[0] && typeof np[0][0] === 'number') {
          window.__polyline = np.slice();
          window.__polylines = window.__polyline.length ? [window.__polyline] : [];
        } else {
          window.__polylines = np.filter(function (g) { return g && g.length > 1; });
          window.__polyline = window.__polylines[0] || [];
        }
        polyline = window.__polyline;
        data.linkMarkers = linkMarkers !== false;
        if (typeof focusCenter === 'boolean') data.focusCenter = focusCenter;
        if (typeof viewportLimit === 'number') data.viewportLimit = viewportLimit;
        window.__viewportLimit = viewportLimit || 20;
        window.__viewportMode = !!(focusCenter && viewportLimit > 0);
        window.__didCenterCategory = false;
        window.__redraw();
      };
    })();
  </script>
</body>
</html>`;
}

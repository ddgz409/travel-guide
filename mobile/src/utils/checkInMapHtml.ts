/** 旅行地图 HTML — 白底贴纸中国地图（Albers 比例 + 粗紫描边 + 白省界） */

import { TRAVEL_MAP_VIEW } from "../assets/chinaProvincePaths";
import { getProvinceRegions } from "./provinceMap";

const PAGE_BG = "#FFFFFF";
const PROVINCE_FILL = "#D2C2EA";
const STICKER = "#C4B3E4";
const STROKE = "#FFFFFF";
const LABEL_FILL = "#FFFFFF";

const MAX_SCALE = 24;
const MIN_SCALE = 0.5;

export type ProvincePhotoData = Record<string, string>;

export type CheckInMapHtmlOptions = {
  interactive?: boolean;
  provincePhotos?: ProvincePhotoData;
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPhotoCover(
  provinceKey: string,
  photoHref: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): string {
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0 || !photoHref) return "";
  return (
    `<g clip-path="url(#clip-${provinceKey})">` +
    `<image href="${photoHref}" x="${minX.toFixed(2)}" y="${minY.toFixed(2)}" ` +
    `width="${w.toFixed(2)}" height="${h.toFixed(2)}" preserveAspectRatio="xMidYMid slice"/>` +
    `</g>`
  );
}

function labelSize(bw: number, bh: number, label: string): number {
  const base = Math.min(bw, bh) * 0.22;
  const byLen = (Math.min(bw, bh) * 0.72) / Math.max(label.length, 1);
  return Math.min(22, Math.max(7, Math.min(base, byLen)));
}

export function buildCheckInMapHtml(
  _checkedPrefectureIds: string[],
  options: CheckInMapHtmlOptions = {},
): string {
  const regions = getProvinceRegions();
  const photos = options.provincePhotos ?? {};
  const interactive = options.interactive ?? false;
  const { w: VW, h: VH } = TRAVEL_MAP_VIEW;

  const defs: string[] = [];
  const stickerLayer: string[] = [];
  const fillLayer: string[] = [];
  const photoLayer: string[] = [];
  const borderLayer: string[] = [];
  const labels: string[] = [];
  const hitLayers: string[] = [];

  for (const region of regions) {
    const hasPhoto = Boolean(photos[region.key]);
    const d = region.path;

    defs.push(`<clipPath id="clip-${region.key}"><path d="${d}"/></clipPath>`);

    stickerLayer.push(
      `<path d="${d}" fill="${PROVINCE_FILL}" stroke="${STICKER}" stroke-width="42" ` +
        `stroke-linejoin="round" stroke-linecap="round"/>`,
    );

    fillLayer.push(
      `<path d="${d}" fill="${hasPhoto ? "#FFFFFF" : PROVINCE_FILL}" stroke="none"/>`,
    );

    if (hasPhoto) {
      photoLayer.push(
        buildPhotoCover(
          region.key,
          photos[region.key],
          region.minX,
          region.minY,
          region.maxX,
          region.maxY,
        ),
      );
    }

    borderLayer.push(
      `<path d="${d}" fill="none" stroke="${STROKE}" stroke-width="2.4" ` +
        `stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>`,
    );

    const bw = region.maxX - region.minX;
    const bh = region.maxY - region.minY;
    if (bw >= 14 && bh >= 10) {
      const fs = labelSize(bw, bh, region.label);
      labels.push(
        `<text x="${region.cx.toFixed(1)}" y="${region.cy.toFixed(1)}" ` +
          `fill="${LABEL_FILL}" font-size="${fs.toFixed(1)}" font-weight="400" ` +
          `font-family="Ma Shan Zheng, KaiTi, STKaiti, cursive, sans-serif" ` +
          `text-anchor="middle" dominant-baseline="central" pointer-events="none">` +
          `${escapeXml(region.label)}</text>`,
      );
    }

    if (interactive) {
      hitLayers.push(
        `<path d="${d}" fill="transparent" stroke="none" ` +
          `data-prov="${region.key}" data-label="${escapeXml(region.label)}" ` +
          `class="prov-hit" style="cursor:pointer"/>`,
      );
    }
  }

  const touchScript = interactive
    ? `
<script>
(function () {
  var svg = document.querySelector('svg');
  var g = document.getElementById('map');
  var scale = 1, tx = 0, ty = 0;
  var lastDist = 0, lastPt = null, mode = '';
  var MAX_SCALE = ${MAX_SCALE};
  var MIN_SCALE = ${MIN_SCALE};
  var dragSq = 0;

  function post(obj) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    }
  }

  function clientToSvg(x, y) {
    var pt = svg.createSVGPoint();
    pt.x = x; pt.y = y;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function apply() {
    g.setAttribute('transform', 'translate(' + tx + ',' + ty + ') scale(' + scale + ')');
  }

  function touchMid(t0, t1) {
    return clientToSvg((t0.clientX + t1.clientX) / 2, (t0.clientY + t1.clientY) / 2);
  }

  function touchDist(t0, t1) {
    var a = clientToSvg(t0.clientX, t0.clientY);
    var b = clientToSvg(t1.clientX, t1.clientY);
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  document.querySelectorAll('.prov-hit').forEach(function (el) {
    el.addEventListener('click', function () {
      if (dragSq > 64) return;
      post({ type: 'province', key: el.getAttribute('data-prov'), label: el.getAttribute('data-label') });
    });
  });

  document.body.addEventListener('touchstart', function (e) {
    dragSq = 0;
    if (e.touches.length === 1) {
      mode = 'pan';
      lastPt = clientToSvg(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      mode = 'pinch';
      lastDist = touchDist(e.touches[0], e.touches[1]);
    }
  }, { passive: false });

  document.body.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (mode === 'pan' && e.touches.length === 1) {
      var p = clientToSvg(e.touches[0].clientX, e.touches[0].clientY);
      var dx = p.x - lastPt.x;
      var dy = p.y - lastPt.y;
      dragSq += dx * dx + dy * dy;
      tx += dx;
      ty += dy;
      lastPt = p;
      apply();
    } else if (mode === 'pinch' && e.touches.length === 2) {
      var mid = touchMid(e.touches[0], e.touches[1]);
      var d = touchDist(e.touches[0], e.touches[1]);
      var newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * (d / lastDist)));
      var ratio = newScale / scale;
      tx = mid.x - ratio * (mid.x - tx);
      ty = mid.y - ratio * (mid.y - ty);
      scale = newScale;
      lastDist = d;
      apply();
    }
  }, { passive: false });

  document.body.addEventListener('touchend', function (e) {
    if (e.touches.length === 0) mode = '';
    else if (e.touches.length === 1 && mode === 'pinch') {
      mode = 'pan';
      lastPt = clientToSvg(e.touches[0].clientX, e.touches[0].clientY);
    }
  });
})();
</script>`
    : "";

  const scalable = interactive ? "yes" : "no";
  const viewportMaxScale = interactive ? String(MAX_SCALE) : "1";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=${viewportMaxScale}, user-scalable=${scalable}"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=swap"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; background: ${PAGE_BG}; overflow: hidden; touch-action: none; }
  svg { width: 100%; height: 100%; display: block; }
</style>
</head>
<body>
  <svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <defs>${defs.join("")}</defs>
    <rect width="${VW}" height="${VH}" fill="${PAGE_BG}"/>
    <g id="map" transform="translate(0,0) scale(1)">
      <g id="sticker">${stickerLayer.join("\n")}</g>
      <g id="fills">${fillLayer.join("\n")}</g>
      <g id="photos">${photoLayer.join("\n")}</g>
      <g id="borders">${borderLayer.join("\n")}</g>
      <g id="labels">${labels.join("\n")}</g>
      ${hitLayers.join("\n")}
    </g>
  </svg>
  ${touchScript}
</body>
</html>`;
}

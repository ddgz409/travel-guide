/** 离线打卡地图 HTML（地级市填色 + 灰色虚线边界，可选缩放） */

import { CHINA_PREFECTURE_PATHS } from "../assets/chinaPrefecturePaths";

const FILL_DEFAULT = "#FFFFFF";
const FILL_CHECKED = "#D7EAF8";
const STROKE = "#B8B8B8";

const MAX_SCALE = 24;
const MIN_SCALE = 0.5;
const LABEL_SHOW_SCALE = 1.5;

/** 屏幕中心全亮半径 / 渐隐外圈（viewBox 单位） */
const CENTER_INNER_R = 95;
const CENTER_OUTER_R = 185;
const FADE_MIN_OPACITY = 0.1;

export type CheckInMapHtmlOptions = {
  interactive?: boolean;
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildLabelText(
  p: (typeof CHINA_PREFECTURE_PATHS)[number],
  isChecked: boolean,
): string {
  const fill = isChecked ? "#0277BD" : "#1a1a1a";
  const weight = isChecked ? "700" : "600";
  return (
    `<text x="${p.cx}" y="${p.cy}" visibility="hidden" opacity="0" ` +
    `data-w="${p.w}" data-h="${p.h}" data-label="${escapeXml(p.label)}" ` +
    `fill="${fill}" stroke="#ffffff" stroke-width="0.22" ` +
    `paint-order="stroke fill" font-size="4" font-weight="${weight}" ` +
    `font-family="PingFang SC, -apple-system, BlinkMacSystemFont, sans-serif" ` +
    `text-anchor="middle" dominant-baseline="central" ` +
    `vector-effect="non-scaling-stroke">` +
    `${escapeXml(p.label)}</text>`
  );
}

export function buildCheckInMapHtml(
  checkedPrefectureIds: string[],
  options: CheckInMapHtmlOptions = {},
): string {
  const checked = new Set(checkedPrefectureIds);
  const paths = CHINA_PREFECTURE_PATHS.map((p) => {
    const fill = checked.has(p.id) ? FILL_CHECKED : FILL_DEFAULT;
    return `<path d="${p.path}" fill="${fill}" stroke="${STROKE}" stroke-width="0.55" stroke-dasharray="3,2" vector-effect="non-scaling-stroke"/>`;
  }).join("\n");

  const labels = CHINA_PREFECTURE_PATHS.map((p) =>
    buildLabelText(p, checked.has(p.id)),
  ).join("\n");

  const checkedCityCount = checked.size;
  const scalable = options.interactive ? "yes" : "no";
  const viewportMaxScale = options.interactive ? String(MAX_SCALE) : "1";

  const touchScript = options.interactive
    ? `
<script>
(function () {
  var svg = document.querySelector('svg');
  var g = document.getElementById('map');
  var labelNodes = document.querySelectorAll('#labels text');
  var scale = 1, tx = 0, ty = 0;
  var lastDist = 0, lastPt = null, mode = '';
  var MAX_SCALE = ${MAX_SCALE};
  var MIN_SCALE = ${MIN_SCALE};
  var LABEL_SCALE = ${LABEL_SHOW_SCALE};
  var INNER_R = ${CENTER_INNER_R};
  var OUTER_R = ${CENTER_OUTER_R};
  var FADE_MIN = ${FADE_MIN_OPACITY};

  function clientToSvg(x, y) {
    var pt = svg.createSVGPoint();
    pt.x = x;
    pt.y = y;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function viewCenter() {
    var rect = svg.getBoundingClientRect();
    return clientToSvg(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function labelFontSize(bw, bh, name) {
    var base = Math.min(bw, bh) * 0.19;
    base = clamp(base, 2.8, 11);
    var needW = Math.max(6, name.length * base * 0.58);
    if (needW > bw * 0.82) {
      base = (bw * 0.82) / Math.max(1, name.length * 0.58);
    }
    return clamp(base, 2.5, 11);
  }

  function centerOpacity(px, py, cx0, cy0) {
    var dist = Math.hypot(px - cx0, py - cy0);
    if (dist <= INNER_R) return 1;
    if (dist >= OUTER_R) return FADE_MIN;
    var t = (dist - INNER_R) / (OUTER_R - INNER_R);
    return 1 - t * (1 - FADE_MIN);
  }

  function updateLabels() {
    var labels = document.getElementById('labels');
    if (!labels) return;
    if (scale < LABEL_SCALE) {
      labels.style.display = 'none';
      return;
    }
    labels.style.display = 'block';
    var cen = viewCenter();

    for (var i = 0; i < labelNodes.length; i++) {
      var el = labelNodes[i];
      var lx = parseFloat(el.getAttribute('x'));
      var ly = parseFloat(el.getAttribute('y'));
      var bw = parseFloat(el.getAttribute('data-w'));
      var bh = parseFloat(el.getAttribute('data-h'));
      var name = el.getAttribute('data-label') || el.textContent || '';

      var px = tx + scale * lx;
      var py = ty + scale * ly;
      var sw = bw * scale;
      var sh = bh * scale;

      if (sw < 8 || sh < 5) {
        el.setAttribute('visibility', 'hidden');
        continue;
      }

      var fs = labelFontSize(bw, bh, name);
      var op = centerOpacity(px, py, cen.x, cen.y);

      el.setAttribute('font-size', String(fs));
      el.setAttribute('opacity', String(op));
      el.setAttribute('visibility', op < 0.06 ? 'hidden' : 'visible');
    }
  }

  function apply() {
    g.setAttribute('transform', 'translate(' + tx + ',' + ty + ') scale(' + scale + ')');
    updateLabels();
  }

  function touchMid(t0, t1) {
    return clientToSvg(
      (t0.clientX + t1.clientX) / 2,
      (t0.clientY + t1.clientY) / 2
    );
  }

  function touchDist(t0, t1) {
    var a = clientToSvg(t0.clientX, t0.clientY);
    var b = clientToSvg(t1.clientX, t1.clientY);
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  document.body.addEventListener('touchstart', function (e) {
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
      tx += p.x - lastPt.x;
      ty += p.y - lastPt.y;
      lastPt = p;
      apply();
    } else if (mode === 'pinch' && e.touches.length === 2) {
      var mid = touchMid(e.touches[0], e.touches[1]);
      var d = touchDist(e.touches[0], e.touches[1]);
      var newScale = clamp(scale * (d / lastDist), MIN_SCALE, MAX_SCALE);
      var ratio = newScale / scale;
      tx = mid.x - ratio * (mid.x - tx);
      ty = mid.y - ratio * (mid.y - ty);
      scale = newScale;
      lastDist = d;
      apply();
    }
  }, { passive: false });

  document.body.addEventListener('touchend', function (e) {
    if (e.touches.length === 0) {
      mode = '';
    } else if (e.touches.length === 1 && mode === 'pinch') {
      mode = 'pan';
      lastPt = clientToSvg(e.touches[0].clientX, e.touches[0].clientY);
    }
  });

  updateLabels();
})();
</script>`
    : "";

  const labelsLayer = options.interactive
    ? `<g id="labels">${labels}</g>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=${viewportMaxScale}, user-scalable=${scalable}"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; background: #fafafa; overflow: hidden; touch-action: none; }
  svg { width: 100%; height: 100%; display: block; }
  .badge {
    position: absolute; left: 10px; bottom: 8px;
    font: 600 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
    color: #757575; background: rgba(255,255,255,0.92);
    padding: 4px 10px; border-radius: 10px;
    pointer-events: none;
  }
  .hint {
    position: absolute; right: 10px; bottom: 8px;
    font: 500 10px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
    color: #9e9e9e; pointer-events: none;
  }
</style>
</head>
<body>
  <svg viewBox="0 0 800 640" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <rect width="800" height="640" fill="#FAFAFA"/>
    <g id="map" transform="translate(0,0) scale(1)">
      ${paths}
      ${labelsLayer}
    </g>
  </svg>
  <div class="badge">已打卡 ${checkedCityCount} 个地级市</div>
  ${options.interactive ? '<div class="hint">双指缩放 · 中心区域显示城市名</div>' : ""}
  ${touchScript}
</body>
</html>`;
}

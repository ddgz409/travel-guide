package com.travelguide.app.data.util

import com.travelguide.app.data.model.ChinaProvincePath
import com.travelguide.app.data.model.MapViewSize
import com.travelguide.app.data.model.ProvinceMapData

/** 旅行地图 HTML — 白底贴纸中国地图（对齐 RN utils/checkInMapHtml.ts） */

private const val PAGE_BG = "#FFFFFF"
private const val PROVINCE_FILL = "#D2C2EA"
private const val HIGHLIGHT_FILL = "#6E4EC4"
private const val STICKER = "#C4B3E4"
private const val STROKE = "#FFFFFF"
private const val LABEL_FILL = "#FFFFFF"

private const val MAX_SCALE = 24
private const val MIN_SCALE = 0.5

data class CheckInMapHtmlOptions(
    val interactive: Boolean = false,
    val provincePhotos: Map<String, String> = emptyMap(),
    val highlightChecked: Boolean = false,
)

private fun escapeXml(text: String): String = text
    .replace("&", "&amp;")
    .replace("<", "&lt;")
    .replace(">", "&gt;")
    .replace("\"", "&quot;")

private fun buildPhotoCover(
    provinceKey: String,
    photoHref: String,
    minX: Double,
    minY: Double,
    maxX: Double,
    maxY: Double,
): String {
    val w = maxX - minX
    val h = maxY - minY
    if (w <= 0 || h <= 0 || photoHref.isBlank()) return ""
    return (
        """<g clip-path="url(#clip-$provinceKey)">""" +
            """<image href="$photoHref" x="${"%.2f".format(minX)}" y="${"%.2f".format(minY)}" """ +
            """width="${"%.2f".format(w)}" height="${"%.2f".format(h)}" preserveAspectRatio="xMidYMid slice"/>""" +
            """</g>"""
        )
}

private fun labelSize(bw: Double, bh: Double, label: String): Double {
    val base = minOf(bw, bh) * 0.22
    val byLen = (minOf(bw, bh) * 0.72) / maxOf(label.length, 1)
    return minOf(22.0, maxOf(7.0, minOf(base, byLen)))
}

fun buildCheckInMapHtml(
    checkedPrefectureIds: List<String>,
    regions: List<ChinaProvincePath>,
    view: MapViewSize = ProvinceMapData.TRAVEL_MAP_VIEW,
    options: CheckInMapHtmlOptions = CheckInMapHtmlOptions(),
): String {
    val photos = if (options.highlightChecked) emptyMap() else options.provincePhotos
    val highlightKeys = if (options.highlightChecked) {
        checkedPrefectureIds.map { it.take(2) }.toSet()
    } else emptySet()
    val interactive = options.interactive
    val offline = options.highlightChecked
    val vw = view.w
    val vh = view.h

    val defs = StringBuilder()
    val stickerLayer = StringBuilder()
    val fillLayer = StringBuilder()
    val photoLayer = StringBuilder()
    val borderLayer = StringBuilder()
    val labels = StringBuilder()
    val hitLayers = StringBuilder()
    val slim = offline

    for (region in regions) {
        val hasPhoto = photos.containsKey(region.key)
        val highlighted = highlightKeys.contains(region.key)
        val d = region.path

        if (!slim) {
            defs.append("""<clipPath id="clip-${region.key}"><path d="$d"/></clipPath>""")
            stickerLayer.append(
                """<path d="$d" fill="$PROVINCE_FILL" stroke="$STICKER" stroke-width="42" """ +
                    """stroke-linejoin="round" stroke-linecap="round"/>""",
            )
        }

        fillLayer.append(
            """<path d="$d" fill="${if (hasPhoto) "#FFFFFF" else if (highlighted) HIGHLIGHT_FILL else PROVINCE_FILL}" """ +
                """stroke="${if (slim) STICKER else "none"}" stroke-width="${if (slim) "3" else "0"}" """ +
                """stroke-linejoin="round"/>""",
        )

        if (hasPhoto) {
            photoLayer.append(
                buildPhotoCover(region.key, photos[region.key].orEmpty(), region.minX, region.minY, region.maxX, region.maxY),
            )
        }

        borderLayer.append(
            """<path d="$d" fill="none" stroke="$STROKE" stroke-width="2.4" """ +
                """stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>""",
        )

        val bw = region.maxX - region.minX
        val bh = region.maxY - region.minY
        if (bw >= 14 && bh >= 10) {
            val fs = labelSize(bw, bh, region.label)
            labels.append(
                """<text x="${"%.1f".format(region.cx)}" y="${"%.1f".format(region.cy)}" """ +
                    """fill="$LABEL_FILL" font-size="${"%.1f".format(fs)}" font-weight="400" """ +
                    """font-family="${if (offline) "KaiTi, STKaiti, sans-serif" else "Ma Shan Zheng, KaiTi, STKaiti, cursive, sans-serif"}" """ +
                    """text-anchor="middle" dominant-baseline="central" pointer-events="none">""" +
                    escapeXml(region.label) +
                    """</text>""",
            )
        }

        if (interactive && !slim) {
            hitLayers.append(
                """<path d="$d" fill="transparent" stroke="none" """ +
                    """data-prov="${region.key}" data-label="${escapeXml(region.label)}" """ +
                    """class="prov-hit" style="cursor:pointer"/>""",
            )
        }
    }

    val touchScript = if (interactive) """
<script>
(function () {
  var svg = document.querySelector('svg');
  var g = document.getElementById('map');
  var scale = 1, tx = 0, ty = 0;
  var lastDist = 0, lastPt = null, mode = '';
  var MAX_SCALE = $MAX_SCALE;
  var MIN_SCALE = $MIN_SCALE;
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
    var tap = null;
    el.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      tap = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (!tap || dragSq > 64) { tap = null; return; }
      var t = e.changedTouches[0];
      var dx = t.clientX - tap.x, dy = t.clientY - tap.y;
      if (dx * dx + dy * dy < 400) {
        post({ type: 'province', key: el.getAttribute('data-prov'), label: el.getAttribute('data-label') });
      }
      tap = null;
    });
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
</script>""" else ""

    val scalable = if (interactive) "yes" else "no"
    val viewportMaxScale = if (interactive) MAX_SCALE.toString() else "1"

    return """
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=$viewportMaxScale, user-scalable=$scalable"/>
${if (offline) "" else """<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=swap"/>"""}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; background: ${if (offline) "#EFE8F8" else PAGE_BG}; overflow: hidden; touch-action: none; }
  svg { width: 100%; height: ${if (offline) "58%" else "100%"}; display: block; }
</style>
</head>
<body>
  <svg viewBox="0 0 $vw $vh" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <defs>${defs}</defs>
    <rect width="$vw" height="$vh" fill="${if (offline) "#EFE8F8" else PAGE_BG}"/>
    <g id="map" transform="translate(0,0) scale(1)">
      <g id="sticker">${stickerLayer}</g>
      <g id="fills">${fillLayer}</g>
      <g id="photos">${photoLayer}</g>
      <g id="borders">${borderLayer}</g>
      <g id="labels">${labels}</g>
      ${hitLayers}
    </g>
  </svg>
  $touchScript
</body>
</html>""".trimIndent()
}

package com.travelguide.app.ui.components

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.travelguide.app.data.api.AppJson
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun CheckInMapWebView(
    html: String,
    interactive: Boolean,
    modifier: Modifier = Modifier,
    onProvinceClick: ((key: String, label: String) -> Unit)? = null,
) {
    val context = LocalContext.current
    val onClickState by rememberUpdatedState(onProvinceClick)
    var webView by remember { mutableStateOf<WebView?>(null) }
    var loadedHtml by remember { mutableStateOf<String?>(null) }

    DisposableEffect(Unit) {
        onDispose {
            webView?.apply {
                stopLoading()
                destroy()
            }
            webView = null
            loadedHtml = null
        }
    }

    LaunchedEffect(html, interactive) {
        val view = webView ?: return@LaunchedEffect
        if (loadedHtml == html) return@LaunchedEffect
        loadedHtml = html
        // 大图 HTML 走 file://，避免 loadData 体积上限导致白屏
        val cache = File(context.cacheDir, "checkin_map_${html.hashCode()}.html")
        cache.writeText(html)
        view.loadUrl("file://${cache.absolutePath}")
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            WebView(ctx).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
                setBackgroundColor(Color.WHITE)
                settings.apply {
                    javaScriptEnabled = interactive
                    domStorageEnabled = false
                    allowFileAccess = true
                    allowContentAccess = true
                    useWideViewPort = true
                    loadWithOverviewMode = true
                }
                isVerticalScrollBarEnabled = false
                isHorizontalScrollBarEnabled = false
                webViewClient = WebViewClient()
                if (interactive && onClickState != null) {
                    addJavascriptInterface(
                        object {
                            @JavascriptInterface
                            fun postMessage(msg: String) {
                                Handler(Looper.getMainLooper()).post {
                                    runCatching {
                                        val obj = AppJson.parseToJsonElement(msg).jsonObject
                                        if (obj["type"]?.jsonPrimitive?.contentOrNull == "province") {
                                            val key = obj["key"]?.jsonPrimitive?.contentOrNull ?: return@post
                                            val label = obj["label"]?.jsonPrimitive?.contentOrNull.orEmpty()
                                            onClickState?.invoke(key, label)
                                        }
                                    }
                                }
                            }
                        },
                        "ReactNativeWebView",
                    )
                } else {
                    // 预览卡：对齐 RN pointerEvents="none"，不拦截父级点击
                    isClickable = false
                    isFocusable = false
                    isFocusableInTouchMode = false
                    setOnTouchListener { _, event ->
                        when (event.action) {
                            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> true
                            else -> false
                        }
                    }
                }
                webView = this
            }
        },
        update = { view ->
            webView = view
            if (loadedHtml != html) {
                loadedHtml = html
                val cache = File(context.cacheDir, "checkin_map_${html.hashCode()}.html")
                cache.writeText(html)
                view.loadUrl("file://${cache.absolutePath}")
            }
        },
    )
}

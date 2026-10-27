package com.travelguide.app.data.util

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast

/** 分享链接 payload（对齐 RN ShareChoicePayload） */
data class ShareChoicePayload(
    val url: String,
    val title: String? = null,
    val message: String? = null,
)

/** 分享方式 id（对齐 RN ShareAppId） */
enum class ShareAppId { Weixin, Qq, Copy, More }

private fun copyAndOpen(context: Context, url: String, scheme: String, appName: String) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    cm.setPrimaryClip(ClipData.newPlainText("share", url))
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(scheme)))
        Toast.makeText(context, "链接已复制，已打开$appName", Toast.LENGTH_SHORT).show()
    } catch (_: Exception) {
        Toast.makeText(context, "链接已复制，可手动打开$appName 后粘贴", Toast.LENGTH_LONG).show()
    }
}

/** 按选定方式分享（对齐 RN shareViaApp） */
fun shareViaApp(context: Context, id: ShareAppId, opts: ShareChoicePayload) {
    val url = opts.url.trim()
    if (url.isEmpty()) return
    val title = opts.title ?: "分享"
    val message = opts.message ?: "$title\n$url"
    when (id) {
        ShareAppId.Weixin -> copyAndOpen(context, url, "weixin://", "微信")
        ShareAppId.Qq -> copyAndOpen(context, url, "mqqwpa://", "QQ")
        ShareAppId.Copy -> {
            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("share", url))
            Toast.makeText(context, "已复制链接", Toast.LENGTH_SHORT).show()
        }
        ShareAppId.More -> {
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, message)
            }
            context.startActivity(Intent.createChooser(send, title))
        }
    }
}

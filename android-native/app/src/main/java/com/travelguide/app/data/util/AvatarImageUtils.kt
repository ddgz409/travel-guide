package com.travelguide.app.data.util

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import kotlin.math.min
import kotlin.math.roundToInt

/** 裁切区域（对齐 RN AvatarCropRect） */
data class AvatarCropRect(
    val originX: Int,
    val originY: Int,
    val size: Int,
)

object AvatarConfig {
    const val MAX_EDGE = 512
    const val JPEG_QUALITY = 72 // 0.72 * 100
}

/** 按选区裁成正方形并压缩；无选区则居中裁切（对齐 RN prepareSquareAvatar） */
fun prepareSquareAvatar(context: android.content.Context, source: File, crop: AvatarCropRect? = null): File {
    val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(source.absolutePath, opts)
    val width = opts.outWidth
    val height = opts.outHeight
    require(width > 0 && height > 0) { "无法读取图片尺寸" }

    val originX: Int
    val originY: Int
    val size: Int
    if (crop != null) {
        size = min(crop.size, min(width, height))
        originX = crop.originX.coerceIn(0, width - size)
        originY = crop.originY.coerceIn(0, height - size)
    } else {
        size = min(width, height)
        originX = ((width - size) / 2f).roundToInt()
        originY = ((height - size) / 2f).roundToInt()
    }

    val decoded = BitmapFactory.decodeFile(source.absolutePath)
        ?: error("无法解码图片")
    val cropped = Bitmap.createBitmap(decoded, originX, originY, size, size)
    val scaled = Bitmap.createScaledBitmap(cropped, AvatarConfig.MAX_EDGE, AvatarConfig.MAX_EDGE, true)
    val out = File(context.cacheDir, "avatar_cropped_${System.currentTimeMillis()}.jpg")
    FileOutputStream(out).use { fos ->
        scaled.compress(Bitmap.CompressFormat.JPEG, AvatarConfig.JPEG_QUALITY, fos)
    }
    if (scaled !== cropped) scaled.recycle()
    if (cropped !== decoded) cropped.recycle()
    decoded.recycle()
    return out
}

fun readImageSize(context: android.content.Context, uri: Uri): Pair<Int, Int>? {
    return context.contentResolver.openInputStream(uri)?.use { stream ->
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeStream(stream, null, opts)
        if (opts.outWidth > 0 && opts.outHeight > 0) opts.outWidth to opts.outHeight else null
    }
}

fun decodeImageBitmap(source: File, maxEdge: Int = 2048): Bitmap? {
    val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(source.absolutePath, opts)
    val w = opts.outWidth
    val h = opts.outHeight
    if (w <= 0 || h <= 0) return null
    val sample = maxOf(1, maxOf(w, h) / maxEdge)
    return BitmapFactory.decodeFile(
        source.absolutePath,
        BitmapFactory.Options().apply { inSampleSize = sample },
    )
}

package com.travelguide.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.ui.Modifier
import com.travelguide.app.ui.navigation.AppNavHost
import com.travelguide.app.ui.theme.ZhijingTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ZhijingTheme {
                // edge-to-edge 下系统栏/键盘 insets 需 Compose 侧消费：
                // 根节点统一加 systemBarsPadding + imePadding，
                // 保证所有带输入框的屏幕不被键盘遮挡
                Box(
                    Modifier
                        .fillMaxSize()
                        .systemBarsPadding()
                        .imePadding(),
                ) {
                    AppNavHost()
                }
            }
        }
    }
}

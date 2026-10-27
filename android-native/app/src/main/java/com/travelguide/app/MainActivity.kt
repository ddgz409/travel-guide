package com.travelguide.app



import android.content.Intent

import android.net.Uri

import android.os.Bundle

import androidx.activity.ComponentActivity

import androidx.activity.compose.setContent

import androidx.activity.enableEdgeToEdge

import androidx.compose.foundation.layout.Box

import androidx.compose.foundation.layout.fillMaxSize

import androidx.compose.foundation.layout.imePadding

import androidx.compose.foundation.layout.systemBarsPadding

import androidx.compose.runtime.getValue

import androidx.compose.runtime.mutableStateOf

import androidx.compose.runtime.setValue

import androidx.compose.ui.Modifier

import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen

import com.travelguide.app.ui.components.SplashOverlay

import com.travelguide.app.ui.navigation.AppNavHost

import com.travelguide.app.ui.theme.ZhijingTheme



class MainActivity : ComponentActivity() {

    private var shareToken by mutableStateOf<String?>(null)

    private var showSplash by mutableStateOf(true)



    override fun onCreate(savedInstanceState: Bundle?) {

        installSplashScreen()

        super.onCreate(savedInstanceState)

        shareToken = parseShareToken(intent)

        enableEdgeToEdge()

        setContent {

            ZhijingTheme {

                Box(Modifier.fillMaxSize()) {

                    Box(

                        Modifier

                            .fillMaxSize()

                            .systemBarsPadding()

                            .imePadding(),

                    ) {

                        AppNavHost(initialShareToken = shareToken)

                    }

                    if (showSplash) {

                        SplashOverlay(

                            ready = true,

                            onFinished = { showSplash = false },

                        )

                    }

                }

            }

        }

    }



    override fun onNewIntent(intent: Intent) {

        super.onNewIntent(intent)

        setIntent(intent)

        shareToken = parseShareToken(intent)

    }



    /** 解析 zhijing://share/{token} 或 http(s)://.../share/{token} */

    private fun parseShareToken(intent: Intent?): String? {

        val data: Uri = intent?.data ?: return null

        val segments = data.pathSegments

        if (segments.size >= 2 && segments[0] == "share") return segments[1]

        if (segments.size == 1 && data.host == "share") return segments[0]

        return null

    }

}


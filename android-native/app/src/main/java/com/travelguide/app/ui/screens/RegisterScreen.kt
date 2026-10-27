package com.travelguide.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.local.GuestStore
import com.travelguide.app.data.local.LlmStore
import com.travelguide.app.data.local.TokenStore
import com.travelguide.app.data.model.AuthPayload
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.launch
import retrofit2.HttpException

/** 注册页（对齐 RN RegisterScreen） */
@Composable
fun RegisterScreen(
    onRegistered: () -> Unit,
    onBack: () -> Unit,
) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun submit() {
        if (username.isBlank() || password.length < 6) {
            error = "用户名必填，密码至少 6 位"
            return
        }
        busy = true
        error = null
        scope.launch {
            try {
                val token = ApiClient.auth.register(AuthPayload(username.trim(), password))
                TokenStore.set(token.accessToken)
                GuestStore.exitGuestMode()
                LlmStore.syncFromCloudIfLoggedIn()
                onRegistered()
            } catch (e: HttpException) {
                error = when (e.code()) {
                    400 -> "用户名已存在或格式不正确"
                    else -> "注册失败 (${e.code()})"
                }
            } catch (_: Exception) {
                error = "无法连接服务器，请稍后重试"
            } finally {
                busy = false
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("创建账号", fontSize = 32.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.BrandHot)
        Text("注册后即可生成并保存攻略", style = MaterialTheme.typography.bodyMedium, color = ZhijingColors.Muted)
        Spacer(Modifier.height(36.dp))

        OutlinedTextField(
            value = username,
            onValueChange = { username = it; error = null },
            label = { Text("用户名") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it; error = null },
            label = { Text("密码") },
            placeholder = { Text("至少 6 位") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
        )

        error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = ZhijingColors.Danger, style = MaterialTheme.typography.bodyMedium)
        }

        Spacer(Modifier.height(24.dp))
        Button(
            onClick = ::submit,
            enabled = !busy,
            modifier = Modifier.fillMaxWidth().height(50.dp),
        ) {
            if (busy) CircularProgressIndicator(Modifier.height(22.dp), strokeWidth = 2.dp)
            else Text("注册", fontSize = 16.sp)
        }
        Spacer(Modifier.height(16.dp))
        TextButton(onClick = onBack) {
            Text("已有账号？去登录", color = ZhijingColors.BrandHot)
        }
    }
}

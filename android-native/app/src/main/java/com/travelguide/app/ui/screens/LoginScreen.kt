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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.travelguide.app.ui.theme.ZhijingColors

@Composable
fun LoginScreen(
    onLoggedIn: () -> Unit,
    vm: LoginViewModel = viewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()

    LaunchedEffect(state.success) {
        if (state.success) onLoggedIn()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "知径",
            fontSize = 40.sp,
            fontWeight = FontWeight.Bold,
            color = ZhijingColors.BrandHot,
        )
        Text(
            text = "AI 旅行规划 · 原生版",
            style = MaterialTheme.typography.bodyMedium,
            color = ZhijingColors.Muted,
        )
        Spacer(Modifier.height(40.dp))

        OutlinedTextField(
            value = state.username,
            onValueChange = vm::onUsernameChange,
            label = { Text("用户名") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = state.password,
            onValueChange = vm::onPasswordChange,
            label = { Text("密码") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
        )

        state.error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = ZhijingColors.Danger, style = MaterialTheme.typography.bodyMedium)
        }

        Spacer(Modifier.height(24.dp))
        Button(
            onClick = { vm.submit(register = false) },
            enabled = !state.loading,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
        ) {
            if (state.loading) CircularProgressIndicator(Modifier.height(22.dp), strokeWidth = 2.dp)
            else Text("登录", fontSize = 16.sp)
        }
        Spacer(Modifier.height(10.dp))
        OutlinedButton(
            onClick = { vm.submit(register = true) },
            enabled = !state.loading,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
        ) {
            Text("注册新账号", fontSize = 16.sp)
        }
    }
}

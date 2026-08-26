package com.travelguide.app.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.local.TokenStore
import com.travelguide.app.data.model.AuthPayload
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException

data class LoginUiState(
    val username: String = "",
    val password: String = "",
    val loading: Boolean = false,
    val error: String? = null,
    val success: Boolean = false,
)

class LoginViewModel : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    fun onUsernameChange(v: String) = _state.value.let { _state.value = it.copy(username = v, error = null) }
    fun onPasswordChange(v: String) = _state.value.let { _state.value = it.copy(password = v, error = null) }

    fun submit(register: Boolean) {
        val s = _state.value
        if (s.loading) return
        if (s.username.isBlank() || s.password.isBlank()) {
            _state.value = s.copy(error = "请输入用户名和密码")
            return
        }
        _state.value = s.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                val payload = AuthPayload(s.username.trim(), s.password)
                val token = if (register) ApiClient.auth.register(payload) else ApiClient.auth.login(payload)
                TokenStore.set(token.accessToken)
                _state.value = _state.value.copy(loading = false, success = true)
            } catch (e: HttpException) {
                _state.value = _state.value.copy(
                    loading = false,
                    error = if (e.code() == 401 || e.code() == 400) "用户名或密码不正确" else "请求失败 (${e.code()})",
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = "无法连接服务器，请稍后重试")
            }
        }
    }
}

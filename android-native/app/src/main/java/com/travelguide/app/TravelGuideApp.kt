package com.travelguide.app

import android.app.Application
import com.amap.api.maps.MapsInitializer
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.local.LlmStore
import com.travelguide.app.data.local.TokenStore

class TravelGuideApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // 高德隐私合规接口（8.1+ 强制）：必须在任何地图/定位能力使用前调用，
        // 否则鉴权与联网被静默禁用，表现为地图纯灰底（PoC 阶段先直接同意，正式版接入隐私弹窗流程）
        MapsInitializer.updatePrivacyShow(this, true, true)
        MapsInitializer.updatePrivacyAgree(this, true)

        TokenStore.init(this)
        LlmStore.init(this)
        ApiClient.init()
    }
}

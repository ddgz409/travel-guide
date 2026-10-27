package com.travelguide.app.data.api

import com.travelguide.app.data.model.AuthPayload
import com.travelguide.app.data.model.Day
import com.travelguide.app.data.model.ItemCreate
import com.travelguide.app.data.model.PoiSearchResult
import com.travelguide.app.data.model.ReorderPayload
import com.travelguide.app.data.model.Token
import com.travelguide.app.data.model.TransportToNext
import com.travelguide.app.data.model.Trip
import com.travelguide.app.data.model.TripListItem
import com.travelguide.app.data.model.User
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import okhttp3.MultipartBody
import retrofit2.http.Streaming
import retrofit2.http.Body
import retrofit2.http.Multipart
import retrofit2.http.Part
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** 后端 FastAPI 错误体 */
@Serializable
data class ErrorBody(val detail: String? = null)

// ---------- /auth ----------

interface AuthApi {
    @POST("auth/register")
    suspend fun register(@Body payload: AuthPayload): Token

    @POST("auth/login")
    suspend fun login(@Body payload: AuthPayload): Token

    @GET("auth/me")
    suspend fun me(): User

    @GET("auth/me/llm")
    suspend fun getLlmSettings(): LlmSettingsOut

    @PUT("auth/me/llm")
    suspend fun updateLlmSettings(@Body payload: LlmSettingsUpdate): LlmSettingsOut
}

// ---------- /trips ----------

interface TripApi {
    @GET("trips")
    suspend fun list(): List<TripListItem>

    @GET("trips/{id}")
    suspend fun get(@Path("id") id: String): Trip

    @PUT("trips/{id}")
    suspend fun update(@Path("id") id: String, @Body data: TripUpdatePayload): Trip

    @PUT("trips/{tripId}/items/{itemId}")
    suspend fun updateItem(
        @Path("tripId") tripId: String,
        @Path("itemId") itemId: String,
        @Body data: ItemUpdatePayload,
    ): Trip

    @PUT("trips/{tripId}/days/{dayId}/reorder")
    suspend fun reorderItems(
        @Path("tripId") tripId: String,
        @Path("dayId") dayId: String,
        @Body payload: ReorderPayload,
    ): Trip

    @POST("trips/{tripId}/days/{dayId}/items")
    suspend fun addItem(
        @Path("tripId") tripId: String,
        @Path("dayId") dayId: String,
        @Body payload: ItemCreate,
    ): Trip

    @DELETE("trips/{tripId}/items/{itemId}")
    suspend fun deleteItem(
        @Path("tripId") tripId: String,
        @Path("itemId") itemId: String,
    ): Trip

    // 换一个：与备选条目互换（对齐 RN api.trips.swapItem）
    @POST("trips/{tripId}/items/{itemId}/swap")
    suspend fun swapItem(
        @Path("tripId") tripId: String,
        @Path("itemId") itemId: String,
        @Query("alt_index") altIndex: Int = 0,
    ): Trip

    @PUT("trips/{tripId}/items/{itemId}")
    suspend fun toggleItem(
        @Path("tripId") tripId: String,
        @Path("itemId") itemId: String,
        @Body payload: ItemTogglePayload,
    ): Trip

    @POST("trips/{tripId}/days/{dayId}/replan")
    suspend fun replanDay(
        @Path("tripId") tripId: String,
        @Path("dayId") dayId: String,
    ): Trip

    @POST("trips/{tripId}/regenerate-day/{dayIndex}")
    suspend fun regenerateDay(
        @Path("tripId") tripId: String,
        @Path("dayIndex") dayIndex: Int,
    ): Trip

    @POST("trips/{tripId}/select-route/{routeId}")
    suspend fun selectRoute(
        @Path("tripId") tripId: String,
        @Path("routeId") routeId: String,
    ): Trip

    // 城市管理（多城市行程）
    @POST("trips/{tripId}/cities")
    suspend fun addCity(
        @Path("tripId") tripId: String,
        @Body payload: CityAddPayload,
    ): Trip

    @DELETE("trips/{tripId}/cities/{city}")
    suspend fun deleteCity(
        @Path("tripId") tripId: String,
        @Path("city") city: String,
    ): Trip

    // 生成进度（SSE 流 + 降级轮询）
    @Streaming
    @GET("trips/{tripId}/generate-stream")
    fun generateStream(@Path("tripId") tripId: String): retrofit2.Call<okhttp3.ResponseBody>

    @GET("trips/{tripId}/progress")
    suspend fun generateProgress(@Path("tripId") tripId: String): GenerateProgressEvent

    @DELETE("trips/{id}")
    suspend fun remove(@Path("id") id: String)

    // POI 搜索（带坐标时后端逆地理定位城市，避免多城路线名当 city 导致零结果）
    @GET("trips/pois/search")
    suspend fun searchPois(
        @Query("q") q: String,
        @Query("city") city: String,
        @Query("limit") limit: Int = 8,
        @Query("broad") broad: Boolean = false,
        @Query("lng") lng: Double? = null,
        @Query("lat") lat: Double? = null,
    ): List<PoiSearchResult>

    @GET("trips/pois/nearby")
    suspend fun nearbyPois(
        @Query("lng") lng: Double,
        @Query("lat") lat: Double,
        @Query("type") type: String = "attraction",
        @Query("limit") limit: Int = 10,
    ): List<PoiSearchResult>

    // 生成攻略（Chat 规划卡片 / 生成屏共用）
    @POST("trips/generate")
    suspend fun generate(@Body payload: GeneratePayload): Trip

    @POST("trips/validate-destination")
    suspend fun validateDestination(@Body payload: ValidateDestinationPayload): ValidateDestinationResult

    // 分享
    @POST("trips/{tripId}/share")
    suspend fun createShare(
        @Path("tripId") tripId: String,
        @Body payload: SharePayload,
    ): Trip

    @GET("trips/share/{token}")
    suspend fun getShared(@Path("token") token: String): Trip

    @POST("trips/share/{token}/join")
    suspend fun joinShare(@Path("token") token: String): Trip

    @POST("trips/quick-recommend")
    suspend fun quickRecommend(@Body payload: QuickRecommendPayload): QuickRecommendResponse

    @POST("trips/guest-generate")
    suspend fun guestGenerate(@Body payload: GeneratePayload): Trip

    @GET("trips/pois/suggest")
    suspend fun suggestLandmarks(
        @Query("destination") destination: String,
        @Query("limit") limit: Int = 8,
    ): List<PoiSearchResult>

    @GET("trips/{tripId}/map-routes/{dayId}")
    suspend fun getDayRoutes(
        @Path("tripId") tripId: String,
        @Path("dayId") dayId: String,
        @Query("mode") mode: String = "transit",
    ): DayRoutesResult

    @GET("trips/{tripId}/items/{itemId}/route")
    suspend fun getItemRoute(
        @Path("tripId") tripId: String,
        @Path("itemId") itemId: String,
        @Query("mode") mode: String? = null,
    ): TransportToNext

    @POST("trips/{tripId}/items/{itemId}/route")
    suspend fun updateItemRoute(
        @Path("tripId") tripId: String,
        @Path("itemId") itemId: String,
        @Body payload: ItemRouteUpdatePayload,
    ): TransportToNext

    @Streaming
    @GET("trips/{id}/export")
    suspend fun exportPdf(@Path("id") id: String): okhttp3.ResponseBody

    // AA 分账
    @GET("trips/{tripId}/split/members")
    suspend fun splitMembers(@Path("tripId") tripId: String): List<TripMemberDto>

    @POST("trips/{tripId}/split/members")
    suspend fun addSplitMember(
        @Path("tripId") tripId: String,
        @Body payload: MemberNamePayload,
    ): TripMemberDto

    @retrofit2.http.PATCH("trips/{tripId}/split/members/{memberId}")
    suspend fun renameSplitMember(
        @Path("tripId") tripId: String,
        @Path("memberId") memberId: String,
        @Body payload: MemberNamePayload,
    ): TripMemberDto

    @DELETE("trips/{tripId}/split/members/{memberId}")
    suspend fun removeSplitMember(
        @Path("tripId") tripId: String,
        @Path("memberId") memberId: String,
    )

    @GET("trips/{tripId}/split/expenses")
    suspend fun splitExpenses(@Path("tripId") tripId: String): List<ExpenseDto>

    @POST("trips/{tripId}/split/expenses")
    suspend fun addSplitExpense(
        @Path("tripId") tripId: String,
        @Body payload: ExpenseInputDto,
    ): ExpenseDto

    @PUT("trips/{tripId}/split/expenses/{expenseId}")
    suspend fun updateSplitExpense(
        @Path("tripId") tripId: String,
        @Path("expenseId") expenseId: String,
        @Body payload: ExpenseInputDto,
    ): ExpenseDto

    @DELETE("trips/{tripId}/split/expenses/{expenseId}")
    suspend fun removeSplitExpense(
        @Path("tripId") tripId: String,
        @Path("expenseId") expenseId: String,
    )

    @GET("trips/{tripId}/split/settlement")
    suspend fun splitSettlement(@Path("tripId") tripId: String): SettlementDataDto
}

@Serializable
data class TripUpdatePayload(
    val title: String? = null,
)

@Serializable
data class ItemUpdatePayload(
    val selected: Boolean? = null,
    val name: String? = null,
    val description: String? = null,
)

@Serializable
data class SharePayload(val mode: String = "read")

@Serializable
data class CityAddPayload(
    val city: String,
    val position: Int,
)

@Serializable
data class GenerateProgressEvent(
    val phase: String? = null,
    val message: String? = null,
    val readable: String? = null,
    val status: String? = null,
    val done: Boolean = false,
)

@Serializable
data class GeneratePayload(
    val destination: String,
    val route: List<String>? = null,
    @SerialName("start_date") val startDate: String,
    @SerialName("end_date") val endDate: String,
    val travelers: Int = 2,
    val preferences: GenPreferences = GenPreferences(),
    val llm: LlmOverride? = null,
)

/** 本次请求使用的 LLM 覆盖（游客自带 Key；无 Key 时仍可传 provider/model 偏好） */
@Serializable
data class LlmOverride(
    val provider: String,
    val model: String,
    @SerialName("api_key") val apiKey: String? = null,
    @SerialName("base_url") val baseUrl: String? = null,
)

@Serializable
data class GenPreferences(
    val interests: List<String> = listOf("文化", "美食"),
    @SerialName("budget_level") val budgetLevel: String = "中等",
    val transport: String = "公共交通",
    @SerialName("chat_hint") val chatHint: String? = null,
)

@Serializable
data class ValidateDestinationPayload(val destination: String)

@Serializable
data class ValidateDestinationResult(
    val valid: Boolean = false,
    val message: String = "",
    @SerialName("resolved_name") val resolvedName: String? = null,
    val suggestions: List<String> = emptyList(),
)

// ---------- /chat ----------

interface ChatApi {
    /** SSE 流式聊天：返回原始字节流，调用方逐行读 `data:` 事件 */
    @Streaming
    @POST("chat/stream")
    fun stream(@Body body: ChatStreamRequest): retrofit2.Call<okhttp3.ResponseBody>

    @POST("chat/optimize-plan-query")
    suspend fun optimizePlanQuery(@Body body: OptimizePlanQueryRequest): OptimizePlanQueryResponse
}

@Serializable
data class OptimizePlanQueryRequest(
    val keywords: String,
    val destination: String,
    val days: Int,
    @SerialName("start_date") val startDate: String,
    @SerialName("end_date") val endDate: String,
    val llm: LlmOverride? = null,
)

@Serializable
data class OptimizePlanQueryResponse(val query: String)

@Serializable
data class ChatStreamRequest(
    val messages: List<ChatMessageDto>,
    val llm: LlmOverride? = null,
    @SerialName("trip_id") val tripId: String? = null,
)

@Serializable
data class ChatMessageDto(val role: String, val content: String)

// ---------- /auth DTOs ----------

@Serializable
data class LlmSettingsOut(
    val provider: String = "",
    val model: String = "",
    @SerialName("base_url") val baseUrl: String? = null,
    @SerialName("has_api_key") val hasApiKey: Boolean = false,
    @SerialName("api_key_hint") val apiKeyHint: String? = null,
    @SerialName("using_server_default") val usingServerDefault: Boolean = false,
)

@Serializable
data class LlmSettingsUpdate(
    val provider: String? = null,
    val model: String? = null,
    @SerialName("api_key") val apiKey: String? = null,
    @SerialName("base_url") val baseUrl: String? = null,
)

// ---------- /destinations ----------

interface DestinationApi {
    @GET("destinations/regeo")
    suspend fun regeo(@Query("lng") lng: Double, @Query("lat") lat: Double): RegeoResult

    // 城市真实信息（美食/景点/人文，对齐 RN api.destinations.info）
    @GET("destinations/info")
    suspend fun info(@Query("city") city: String): CityInfo

    // 地点真实图片（高德/缓存源，对齐 RN PlaceImage 组件）
    @GET("destinations/place-images")
    suspend fun placeImages(
        @Query("city") city: String,
        @Query("name") name: String,
        @Query("kind") kind: String = "",
        @Query("limit") limit: Int = 3,
        @Query("poi_id") poiId: String? = null,
    ): PlaceImagesResult

    /** 批量城市封面（热门目的地可用） */
    @POST("destinations/city-covers")
    suspend fun cityCovers(@Body pairs: List<CityCoverPair>): CityCoversResult
}

@Serializable
data class CityCoverPair(
    val city: String,
    val landmark: String,
)

@Serializable
data class CityCoversResult(
    val covers: Map<String, String?> = emptyMap(),
)

@Serializable
data class PlaceImagesResult(
    val city: String = "",
    val name: String = "",
    val kind: String = "",
    val image: String? = null,
    val images: List<String> = emptyList(),
)

/** 城市概览条目（景点/美食/人文同构，对齐 shared CitySpot） */
@Serializable
data class CitySpotDto(
    val name: String = "",
    val desc: String = "",
    val image: String? = null,
    val images: List<String> = emptyList(),
    @SerialName("poi_id") val poiId: String? = null,
    val lng: Double? = null,
    val lat: Double? = null,
    val address: String? = null,
)

@Serializable
data class CityInfo(
    val city: String = "",
    val foods: List<CitySpotDto> = emptyList(),
    val spots: List<CitySpotDto> = emptyList(),
    val humanities: List<CitySpotDto> = emptyList(),
)

@Serializable
data class RegeoResult(
    val city: String = "",
    val province: String = "",
    val adcode: String = "",
)

// ---------- /collections（探索页共享收藏夹） ----------

interface CollectionApi {
    @GET("collections")
    suspend fun list(
        @Query("limit") limit: Int = 20,
        @Query("offset") offset: Int = 0,
        @Query("author") author: String? = null,
    ): CollectionListResponse

    @GET("collections/subscribed")
    suspend fun subscribed(): CollectionListResponse

    @GET("collections/mine")
    suspend fun mine(): CollectionListResponse

    @GET("collections/{id}")
    suspend fun detail(@Path("id") id: String): CollectionDetail

    @DELETE("collections/{id}")
    suspend fun remove(@Path("id") id: String)

    @POST("collections/{id}/subscribe")
    suspend fun subscribe(@Path("id") id: String)

    @DELETE("collections/{id}/subscribe")
    suspend fun unsubscribe(@Path("id") id: String)

    @POST("collections/{id}/like")
    suspend fun like(@Path("id") id: String)

    @DELETE("collections/{id}/like")
    suspend fun unlike(@Path("id") id: String)

    @GET("collections/{id}/comments")
    suspend fun comments(
        @Path("id") id: String,
        @Query("limit") limit: Int = 50,
    ): CommentListResponse

    @POST("collections/{id}/comments")
    suspend fun addComment(@Path("id") id: String, @Body payload: CommentCreate): CommentOut

    @DELETE("collections/{id}/comments/{commentId}")
    suspend fun deleteComment(
        @Path("id") id: String,
        @Path("commentId") commentId: String,
    )

    @POST("collections")
    suspend fun create(@Body payload: CollectionCreatePayload): CollectionDetail

    @PUT("collections/{id}")
    suspend fun update(
        @Path("id") id: String,
        @Body payload: CollectionCreatePayload,
    ): CollectionDetail
}

@Serializable
data class CollectionPlace(
    val name: String = "",
    val city: String? = null,
    val address: String? = null,
    @SerialName("poi_id") val poiId: String? = null,
    val lng: Double? = null,
    val lat: Double? = null,
    val note: String? = null,
)

@Serializable
data class CollectionSummary(
    val id: String = "",
    val title: String = "",
    val summary: String? = null,
    val emoji: String = "📁",
    val city: String? = null,
    @SerialName("author_display") val authorDisplay: String = "旅人",
    @SerialName("author_id") val authorId: String? = null,
    @SerialName("place_count") val placeCount: Int = 0,
    @SerialName("subscriber_count") val subscriberCount: Int = 0,
    val subscribed: Boolean = false,
    @SerialName("is_owner") val isOwner: Boolean = false,
    @SerialName("author_avatar") val authorAvatar: String? = null,
    @SerialName("like_count") val likeCount: Int = 0,
    val liked: Boolean = false,
    @SerialName("comment_count") val commentCount: Int = 0,
    @SerialName("cover_places") val coverPlaces: List<CollectionPlace> = emptyList(),
)

@Serializable
data class CollectionListResponse(
    val items: List<CollectionSummary> = emptyList(),
    val total: Int = 0,
)

@Serializable
data class CollectionDetail(
    val id: String = "",
    val title: String = "",
    val summary: String? = null,
    val emoji: String = "📁",
    val city: String? = null,
    @SerialName("author_display") val authorDisplay: String = "旅人",
    @SerialName("author_id") val authorId: String? = null,
    @SerialName("place_count") val placeCount: Int = 0,
    @SerialName("subscriber_count") val subscriberCount: Int = 0,
    val subscribed: Boolean = false,
    @SerialName("is_owner") val isOwner: Boolean = false,
    @SerialName("author_avatar") val authorAvatar: String? = null,
    @SerialName("like_count") val likeCount: Int = 0,
    val liked: Boolean = false,
    @SerialName("comment_count") val commentCount: Int = 0,
    @SerialName("cover_places") val coverPlaces: List<CollectionPlace> = emptyList(),
    val places: List<CollectionPlace> = emptyList(),
)

@Serializable
data class CommentOut(
    val id: String = "",
    @SerialName("user_id") val userId: String? = null,
    val username: String = "旅人",
    val avatar: String? = null,
    val content: String = "",
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class CommentListResponse(
    val items: List<CommentOut> = emptyList(),
    val total: Int = 0,
)

@Serializable
data class CommentCreate(val content: String)

// ---------- /users（用户主页与关注关系） ----------

interface UserApi {
    @GET("users/{id}/profile")
    suspend fun profile(@Path("id") id: String): UserProfileInfo

    @POST("users/{id}/follow")
    suspend fun follow(@Path("id") id: String)

    @DELETE("users/{id}/follow")
    suspend fun unfollow(@Path("id") id: String)

    @GET("users/{id}/followers")
    suspend fun followers(@Path("id") id: String): FollowListResponse

    @GET("users/{id}/following")
    suspend fun following(@Path("id") id: String): FollowListResponse

    @Multipart
    @PUT("users/me/avatar")
    suspend fun uploadAvatar(@Part file: MultipartBody.Part): AvatarOut

    @DELETE("users/me/avatar")
    suspend fun removeAvatar()
}

@Serializable
data class AvatarOut(val avatar: String? = null)

@Serializable
data class UserProfileInfo(
    val id: String = "",
    val username: String = "",
    val avatar: String? = null,
    @SerialName("follower_count") val followerCount: Int = 0,
    @SerialName("following_count") val followingCount: Int = 0,
    @SerialName("post_count") val postCount: Int = 0,
    @SerialName("is_following") val isFollowing: Boolean = false,
    @SerialName("is_self") val isSelf: Boolean = false,
)

@Serializable
data class UserBrief(
    val id: String = "",
    val username: String = "",
    val avatar: String? = null,
)

@Serializable
data class FollowListResponse(
    val items: List<UserBrief> = emptyList(),
    val total: Int = 0,
)

// ---------- /vision ----------

interface VisionApi {
    @POST("vision/recognize-base64")
    suspend fun recognizeBase64(@Body payload: VisionBase64Payload): VisionRecognizeResponse
}

@Serializable
data class VisionBase64Payload(val image: String)

@Serializable
data class VisionRecognizeResponse(
    val kind: String = "other",
    val title: String = "",
    val description: String = "",
    val highlights: List<String> = emptyList(),
    val tips: List<String> = emptyList(),
    val raw: String? = null,
)

// ---------- /app ----------

interface AppApi {
    @GET("app/android-update")
    suspend fun androidUpdate(): AndroidUpdateInfo
}

@Serializable
data class AndroidUpdateInfo(
    @SerialName("version_code") val versionCode: Int = 0,
    @SerialName("version_name") val versionName: String = "",
    @SerialName("apk_url") val apkUrl: String = "",
    val notes: String = "",
    val force: Boolean = false,
    @SerialName("apk_available") val apkAvailable: Boolean = false,
)

// ---------- trips extras ----------

@Serializable
data class QuickRecommendPayload(val destination: String)

@Serializable
data class QuickRecommendResponse(
    val destination: String = "",
    val cards: List<com.travelguide.app.data.model.QuickRecommendCard> = emptyList(),
)

@Serializable
data class ItemTogglePayload(val selected: Boolean)

@Serializable
data class DayRouteSegment(
    @SerialName("from_item_id") val fromItemId: String = "",
    @SerialName("to_item_id") val toItemId: String = "",
    @SerialName("from_name") val fromName: String = "",
    @SerialName("to_name") val toName: String = "",
    val mode: String = "",
    @SerialName("distance_m") val distanceM: Int = 0,
    @SerialName("duration_s") val durationS: Int = 0,
    val polyline: List<List<Double>> = emptyList(),
    val fallback: Boolean = false,
)

@Serializable
data class DayRoutesResult(
    val mode: String = "",
    @SerialName("day_id") val dayId: String = "",
    val segments: List<DayRouteSegment> = emptyList(),
    val polyline: List<List<Double>> = emptyList(),
    @SerialName("stop_count") val stopCount: Int = 0,
    @SerialName("segment_count") val segmentCount: Int = 0,
    @SerialName("expected_segments") val expectedSegments: Int = 0,
    @SerialName("total_duration_s") val totalDurationS: Int = 0,
    @SerialName("total_distance_m") val totalDistanceM: Int = 0,
)

@Serializable
data class ItemRouteResult(
    val mode: String = "",
    val schemes: List<TransportSchemeDto> = emptyList(),
    @SerialName("selected_scheme") val selectedScheme: Int = 0,
)

@Serializable
data class TransportSchemeDto(
    val mode: String = "",
    @SerialName("duration_s") val durationS: Int = 0,
    @SerialName("distance_m") val distanceM: Int = 0,
    val detail: List<RouteStepDto> = emptyList(),
)

@Serializable
data class RouteStepDto(
    val type: String = "",
    val instruction: String? = null,
    @SerialName("distance_m") val distanceM: Int? = null,
    @SerialName("line_name") val lineName: String? = null,
)

@Serializable
data class ItemRouteUpdatePayload(
    val mode: String,
    @SerialName("scheme_index") val schemeIndex: Int? = null,
)

// ---------- AA 分账 DTO ----------

@Serializable
data class TripMemberDto(
    val id: String = "",
    @SerialName("user_id") val userId: String? = null,
    val name: String = "",
    val color: String = "",
    @SerialName("is_owner") val isOwner: Boolean = false,
)

@Serializable
data class MemberNamePayload(val name: String)

@Serializable
data class ExpenseSplitDto(
    @SerialName("member_id") val memberId: String = "",
    val amount: Double? = null,
    @SerialName("member_name") val memberName: String = "",
    val color: String = "",
)

@Serializable
data class ExpenseSplitInputDto(
    @SerialName("member_id") val memberId: String,
    val amount: Double? = null,
)

@Serializable
data class ExpenseDto(
    val id: String = "",
    val title: String = "",
    val amount: Double = 0.0,
    @SerialName("paid_by_member_id") val paidByMemberId: String = "",
    @SerialName("paid_at") val paidAt: String? = null,
    @SerialName("paid_by_name") val paidByName: String = "",
    @SerialName("paid_by_color") val paidByColor: String = "",
    val splits: List<ExpenseSplitDto> = emptyList(),
)

@Serializable
data class ExpenseInputDto(
    val title: String,
    val amount: Double,
    @SerialName("paid_by_member_id") val paidByMemberId: String,
    @SerialName("paid_at") val paidAt: String? = null,
    val splits: List<ExpenseSplitInputDto> = emptyList(),
)

@Serializable
data class SettlementBalanceDto(
    @SerialName("member_id") val memberId: String = "",
    val name: String = "",
    val color: String = "",
    val balance: Double = 0.0,
)

@Serializable
data class SettlementFlowDto(
    @SerialName("from_member_id") val fromMemberId: String = "",
    @SerialName("from_name") val fromName: String = "",
    @SerialName("from_color") val fromColor: String = "",
    @SerialName("to_member_id") val toMemberId: String = "",
    @SerialName("to_name") val toName: String = "",
    @SerialName("to_color") val toColor: String = "",
    val amount: Double = 0.0,
)

@Serializable
data class SettlementDataDto(
    val balances: List<SettlementBalanceDto> = emptyList(),
    val flows: List<SettlementFlowDto> = emptyList(),
)

@Serializable
data class CollectionCreatePayload(
    val title: String,
    val summary: String? = null,
    val emoji: String = "📁",
    val city: String? = null,
    val places: List<CollectionPlace> = emptyList(),
)

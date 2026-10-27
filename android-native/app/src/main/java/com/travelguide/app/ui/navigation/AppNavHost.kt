package com.travelguide.app.ui.navigation

import android.net.Uri
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import com.travelguide.app.data.local.AuthReturnHolder
import com.travelguide.app.data.local.GuestStore
import com.travelguide.app.data.local.TokenStore
import com.travelguide.app.data.util.FootprintListKind
import com.travelguide.app.ui.components.UpdateLaunchPrompt
import com.travelguide.app.ui.screens.LoginScreen
import com.travelguide.app.ui.screens.RegisterScreen
import com.travelguide.app.ui.screens.chat.ChatHistoryScreen
import com.travelguide.app.ui.screens.chat.ChatScreen
import com.travelguide.app.ui.screens.city.CityDetailScreen
import com.travelguide.app.ui.screens.city.CityGuideScreen
import com.travelguide.app.ui.screens.explore.CollectionDetailScreen
import com.travelguide.app.ui.screens.explore.FollowListScreen
import com.travelguide.app.ui.screens.explore.PortalSelectScreen
import com.travelguide.app.ui.screens.explore.PublishCollectionScreen
import com.travelguide.app.ui.screens.explore.SharedCollectionsScreen
import com.travelguide.app.ui.screens.explore.TravelSearchScreen
import com.travelguide.app.ui.screens.explore.UserProfileScreen
import com.travelguide.app.ui.screens.generate.GenerateScreen
import com.travelguide.app.ui.screens.main.MainScreen
import com.travelguide.app.ui.screens.map.CheckInMapFullScreen
import com.travelguide.app.ui.screens.map.MapFullScreen
import com.travelguide.app.ui.screens.map.MapMarkerArg
import com.travelguide.app.ui.screens.me.AddFootprintScreen
import com.travelguide.app.ui.screens.me.FavoritesScreen
import com.travelguide.app.ui.screens.me.FootprintListScreen
import com.travelguide.app.ui.screens.me.FootprintOverviewScreen
import com.travelguide.app.ui.screens.me.MySubscriptionsScreen
import com.travelguide.app.ui.screens.photo.PhotoRecognizeScreen
import com.travelguide.app.ui.screens.settlement.SettlementExpensesScreen
import com.travelguide.app.ui.screens.settlement.SettlementFlowsScreen
import com.travelguide.app.ui.screens.settlement.SettlementScreen
import com.travelguide.app.ui.screens.settings.ModelManageScreen
import com.travelguide.app.ui.screens.settings.SettingsScreen
import com.travelguide.app.ui.screens.share.ShareScreen
import com.travelguide.app.ui.screens.trip.TripDetailScreen
import com.travelguide.app.ui.screens.trip.TripItemDetailScreen
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument

/** 路由表（对齐 RN App.tsx 栈；主框架为底部 Tab 的 MAIN） */
object Routes {
    const val LOGIN = "login"
    const val REGISTER = "register"
    const val MAIN = "main"
    const val TRIP_DETAIL = "tripDetail/{tripId}"
    const val TRIP_ITEM_DETAIL = "tripItemDetail/{tripId}/{itemId}"
    const val CHAT = "chat/{tripId}?prefill={prefill}&sessionId={sessionId}"
    const val CHAT_HISTORY = "chatHistory"
    const val GENERATE =
        "generate?dest={dest}&mode={mode}&autoSubmit={autoSubmit}&chatHint={chatHint}&startDate={startDate}&endDate={endDate}&interests={interests}"
    const val SHARE = "share?token={token}"
    const val SETTINGS = "settings"
    const val MODEL_MANAGE = "modelManage"
    const val SHARED_COLLECTIONS = "sharedCollections"
    const val COLLECTION_DETAIL = "collectionDetail/{collectionId}"
    const val PUBLISH_COLLECTION = "publishCollection?collectionId={collectionId}&tripId={tripId}"
    const val USER_PROFILE = "userProfile/{userId}/{username}"
    const val FOLLOW_LIST = "followList/{userId}/{username}/{tab}"
    const val CITY_GUIDE = "cityGuide/{city}"
    const val CITY_DETAIL = "cityDetail/{city}"
    const val TRAVEL_SEARCH = "travelSearch"
    const val PORTAL_SELECT = "portalSelect/{from}/{to}/{mode}"
    const val FAVORITES = "favorites"
    const val MY_SUBSCRIPTIONS = "mySubscriptions"
    const val FOOTPRINT_OVERVIEW = "footprintOverview"
    const val FOOTPRINT_LIST = "footprintList/{kind}"
    const val ADD_FOOTPRINT = "addFootprint"
    const val SETTLEMENT = "settlement/{tripId}"
    const val SETTLEMENT_EXPENSES = "settlementExpenses/{tripId}"
    const val SETTLEMENT_FLOWS = "settlementFlows/{tripId}"
    const val MAP_FULL = "mapFull?title={title}&markers={markers}&polylines={polylines}"
    const val CHECK_IN_MAP_FULL = "checkInMapFull"
    const val PHOTO_RECOGNIZE = "photoRecognize?uri={uri}"

    fun tripDetail(tripId: String) = "tripDetail/$tripId"
    fun tripItemDetail(tripId: String, itemId: String) = "tripItemDetail/$tripId/$itemId"
    fun chat(tripId: String = "none", prefill: String? = null, sessionId: String? = null): String {
        val base = "chat/$tripId"
        val params = buildList {
            if (!prefill.isNullOrBlank()) add("prefill=${Uri.encode(prefill)}")
            if (!sessionId.isNullOrBlank()) add("sessionId=${Uri.encode(sessionId)}")
        }
        return if (params.isEmpty()) base else "$base?${params.joinToString("&")}"
    }
    fun share(token: String? = null) = if (token.isNullOrBlank()) "share" else "share?token=${Uri.encode(token)}"
    fun collectionDetail(id: String) = "collectionDetail/$id"
    fun publishCollection(collectionId: String? = null, tripId: String? = null): String {
        val params = buildList {
            if (!collectionId.isNullOrBlank()) add("collectionId=$collectionId")
            if (!tripId.isNullOrBlank()) add("tripId=$tripId")
        }
        return if (params.isEmpty()) "publishCollection" else "publishCollection?${params.joinToString("&")}"
    }
    fun userProfile(userId: String, username: String) = "userProfile/$userId/${Uri.encode(username)}"
    fun followList(userId: String, username: String, tab: String) =
        "followList/$userId/${Uri.encode(username)}/$tab"
    fun cityGuide(city: String) = "cityGuide/${Uri.encode(city)}"
    fun cityDetail(city: String) = "cityDetail/${Uri.encode(city)}"
    fun portalSelect(from: String, to: String, mode: String) =
        "portalSelect/${Uri.encode(from)}/${Uri.encode(to)}/$mode"
    fun footprintList(kind: FootprintListKind) = "footprintList/${kind.name}"
    fun settlement(tripId: String, title: String? = null) = "settlement/$tripId"
    fun settlementExpenses(tripId: String) = "settlementExpenses/$tripId"
    fun settlementFlows(tripId: String) = "settlementFlows/$tripId"
    fun mapFull(title: String?, markersJson: String, polylinesJson: String = "[]") =
        "mapFull?title=${Uri.encode(title.orEmpty())}&markers=${Uri.encode(markersJson)}&polylines=${Uri.encode(polylinesJson)}"
    fun photoRecognize(uri: String? = null) =
        if (uri.isNullOrBlank()) "photoRecognize" else "photoRecognize?uri=${Uri.encode(uri)}"
}

@Composable
fun AppNavHost(initialShareToken: String? = null) {
    val navController = rememberNavController()
    val start = when {
        initialShareToken != null -> Routes.share(initialShareToken)
        TokenStore.getSync() != null -> Routes.MAIN
        GuestStore.isGuestSync() -> Routes.MAIN
        else -> Routes.LOGIN
    }

    Box {
        NavHost(navController = navController, startDestination = start) {
        composable(Routes.LOGIN) {
            LoginScreen(
                onLoggedIn = {
                    val returnToken = AuthReturnHolder.shareToken
                    AuthReturnHolder.shareToken = null
                    if (returnToken != null) {
                        navController.navigate(Routes.share(returnToken)) {
                            popUpTo(Routes.LOGIN) { inclusive = true }
                        }
                    } else {
                        navController.navigate(Routes.MAIN) {
                            popUpTo(Routes.LOGIN) { inclusive = true }
                        }
                    }
                },
                onGuestEnter = {
                    navController.navigate(Routes.MAIN) {
                        popUpTo(Routes.LOGIN) { inclusive = true }
                    }
                },
                onBack = {
                    if (navController.previousBackStackEntry != null) {
                        navController.popBackStack()
                    } else {
                        navController.navigate(Routes.MAIN) {
                            popUpTo(Routes.LOGIN) { inclusive = true }
                        }
                    }
                },
                onOpenRegister = { navController.navigate(Routes.REGISTER) },
            )
        }
        composable(Routes.REGISTER) {
            RegisterScreen(
                onRegistered = {
                    val returnToken = AuthReturnHolder.shareToken
                    AuthReturnHolder.shareToken = null
                    if (returnToken != null) {
                        navController.navigate(Routes.share(returnToken)) {
                            popUpTo(0) { inclusive = true }
                        }
                    } else {
                        navController.navigate(Routes.MAIN) {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                },
                onBack = { navController.popBackStack() },
            )
        }
        composable(Routes.MAIN) {
            MainScreen(
                onOpenTrip = { tripId -> navController.navigate(Routes.tripDetail(tripId)) },
                onOpenGenerate = { dest, mode ->
                    navController.navigate(Routes.buildGenerateRoute(GenerateNavArgs(destination = dest, mode = mode)))
                },
                onOpenShare = { navController.navigate(Routes.SHARE) },
                onOpenSettings = { navController.navigate(Routes.SETTINGS) },
                onOpenChat = { navController.navigate(Routes.chat()) },
                onOpenCityGuide = { city -> navController.navigate(Routes.cityGuide(city)) },
                onOpenCityDetail = { city -> navController.navigate(Routes.cityDetail(city)) },
                onOpenSharedCollections = { navController.navigate(Routes.SHARED_COLLECTIONS) },
                onOpenCollectionDetail = { id -> navController.navigate(Routes.collectionDetail(id)) },
                onOpenUserProfile = { uid, name -> navController.navigate(Routes.userProfile(uid, name)) },
                onOpenTravelSearch = { navController.navigate(Routes.TRAVEL_SEARCH) },
                onOpenFavorites = { navController.navigate(Routes.FAVORITES) },
                onOpenSubscriptions = { navController.navigate(Routes.MY_SUBSCRIPTIONS) },
                onOpenFootprints = { navController.navigate(Routes.FOOTPRINT_OVERVIEW) },
                onOpenAddFootprint = { navController.navigate(Routes.ADD_FOOTPRINT) },
                onOpenCheckInMap = { navController.navigate(Routes.CHECK_IN_MAP_FULL) },
                onOpenLogin = { navController.navigate(Routes.LOGIN) },
            )
        }
        composable(
            route = Routes.GENERATE,
            arguments = listOf(
                navArgument("dest") { type = NavType.StringType; nullable = true; defaultValue = null },
                navArgument("mode") { type = NavType.StringType; nullable = true; defaultValue = null },
                navArgument("autoSubmit") { type = NavType.BoolType; defaultValue = false },
                navArgument("chatHint") { type = NavType.StringType; nullable = true; defaultValue = null },
                navArgument("startDate") { type = NavType.StringType; nullable = true; defaultValue = null },
                navArgument("endDate") { type = NavType.StringType; nullable = true; defaultValue = null },
                navArgument("interests") { type = NavType.StringType; nullable = true; defaultValue = null },
            ),
        ) { entry ->
            val args = entry.arguments!!
            GenerateScreen(
                initialDestination = args.getString("dest"),
                mode = args.getString("mode"),
                autoSubmit = args.getBoolean("autoSubmit"),
                chatHint = args.getString("chatHint"),
                startDateParam = args.getString("startDate"),
                endDateParam = args.getString("endDate"),
                initialInterests = args.getString("interests")?.split(",")?.filter { it.isNotBlank() },
                onBack = { navController.popBackStack() },
                onOpenSettings = { navController.navigate(Routes.MODEL_MANAGE) },
                onGenerated = { tripId ->
                    navController.navigate(Routes.tripDetail(tripId)) {
                        popUpTo(Routes.MAIN)
                    }
                },
            )
        }
        composable(
            route = Routes.TRIP_DETAIL,
            arguments = listOf(navArgument("tripId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString("tripId").orEmpty()
            TripDetailScreen(
                tripId = tripId,
                onBack = { navController.popBackStack() },
                onOpenChat = { msg -> navController.navigate(Routes.chat(tripId, msg)) },
                onOpenSettlement = { navController.navigate(Routes.settlement(tripId)) },
                onOpenPublish = { navController.navigate(Routes.publishCollection(tripId = tripId)) },
                onOpenItemDetail = { itemId -> navController.navigate(Routes.tripItemDetail(tripId, itemId)) },
                onOpenMapFull = { title, markers, polylines ->
                    val mJson = com.travelguide.app.data.api.AppJson.encodeToString(
                        ListSerializer(MapMarkerNav.serializer()), markers,
                    )
                    val lineSeg = ListSerializer(Double.serializer())
                    val pJson = com.travelguide.app.data.api.AppJson.encodeToString(
                        ListSerializer(ListSerializer(lineSeg)),
                        polylines,
                    )
                    navController.navigate(Routes.mapFull(title, mJson, pJson))
                },
            )
        }
        composable(
            route = Routes.TRIP_ITEM_DETAIL,
            arguments = listOf(
                navArgument("tripId") { type = NavType.StringType },
                navArgument("itemId") { type = NavType.StringType },
            ),
        ) { entry ->
            TripItemDetailScreen(
                tripId = entry.arguments?.getString("tripId").orEmpty(),
                itemId = entry.arguments?.getString("itemId").orEmpty(),
                onBack = { navController.popBackStack() },
            )
        }
        composable(
            route = Routes.CHAT,
            arguments = listOf(
                navArgument("tripId") { type = NavType.StringType },
                navArgument("prefill") { type = NavType.StringType; nullable = true; defaultValue = null },
                navArgument("sessionId") { type = NavType.StringType; nullable = true; defaultValue = null },
            ),
        ) { backStackEntry ->
            val chatTripId = backStackEntry.arguments?.getString("tripId")
            ChatScreen(
                tripId = chatTripId?.takeIf { it != "none" },
                sessionId = backStackEntry.arguments?.getString("sessionId"),
                onBack = { navController.popBackStack() },
                onOpenTrip = { id -> navController.navigate(Routes.tripDetail(id)) },
                onOpenHistory = { navController.navigate(Routes.CHAT_HISTORY) },
                onOpenPhoto = { navController.navigate(Routes.photoRecognize()) },
                prefill = backStackEntry.arguments?.getString("prefill"),
                onOpenShare = { token ->
                    navController.navigate(Routes.share(token)) {
                        popUpTo(Routes.MAIN)
                    }
                },
                onOpenCollectionEditor = {
                    navController.navigate(Routes.publishCollection()) {
                        popUpTo(Routes.MAIN)
                    }
                },
                onOpenModelManage = { navController.navigate(Routes.MODEL_MANAGE) },
            )
        }
        composable(Routes.CHAT_HISTORY) {
            ChatHistoryScreen(
                onBack = { navController.popBackStack() },
                onOpenSession = { id -> navController.navigate(Routes.chat(sessionId = id)) },
            )
        }
        composable(
            route = Routes.SHARE,
            arguments = listOf(navArgument("token") { type = NavType.StringType; nullable = true; defaultValue = null }),
        ) { entry ->
            ShareScreen(
                initialToken = entry.arguments?.getString("token"),
                onBack = { navController.popBackStack() },
                onOpenTrip = { id ->
                    navController.navigate(Routes.tripDetail(id)) {
                        popUpTo(Routes.MAIN)
                    }
                },
                onNeedLogin = {
                    navController.navigate(Routes.LOGIN)
                },
                onOpenMapFull = { title, markers, polylines ->
                    val mJson = com.travelguide.app.data.api.AppJson.encodeToString(
                        ListSerializer(MapMarkerNav.serializer()), markers,
                    )
                    val lineSeg = ListSerializer(Double.serializer())
                    val pJson = com.travelguide.app.data.api.AppJson.encodeToString(
                        ListSerializer(ListSerializer(lineSeg)),
                        polylines,
                    )
                    navController.navigate(Routes.mapFull(title, mJson, pJson))
                },
            )
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(
                onBack = { navController.popBackStack() },
                onOpenModelManage = { navController.navigate(Routes.MODEL_MANAGE) },
                onLoggedOut = {
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }
        composable(Routes.MODEL_MANAGE) {
            ModelManageScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.SHARED_COLLECTIONS) {
            SharedCollectionsScreen(
                onBack = { navController.popBackStack() },
                onOpenDetail = { id -> navController.navigate(Routes.collectionDetail(id)) },
                onOpenAuthor = { uid, name -> navController.navigate(Routes.userProfile(uid, name)) },
                onPublish = { navController.navigate(Routes.publishCollection()) },
            )
        }
        composable(
            route = Routes.COLLECTION_DETAIL,
            arguments = listOf(navArgument("collectionId") { type = NavType.StringType }),
        ) { entry ->
            CollectionDetailScreen(
                collectionId = entry.arguments?.getString("collectionId").orEmpty(),
                onBack = { navController.popBackStack() },
                onOpenAuthor = { uid, name -> navController.navigate(Routes.userProfile(uid, name)) },
                onEdit = { id -> navController.navigate(Routes.publishCollection(collectionId = id)) },
            )
        }
        composable(
            route = Routes.PUBLISH_COLLECTION,
            arguments = listOf(
                navArgument("collectionId") { type = NavType.StringType; nullable = true; defaultValue = null },
                navArgument("tripId") { type = NavType.StringType; nullable = true; defaultValue = null },
            ),
        ) { entry ->
            PublishCollectionScreen(
                collectionId = entry.arguments?.getString("collectionId"),
                tripId = entry.arguments?.getString("tripId"),
                onBack = { navController.popBackStack() },
                onPublished = { id ->
                    navController.navigate(Routes.collectionDetail(id)) {
                        popUpTo(Routes.MAIN)
                    }
                },
            )
        }
        composable(
            route = Routes.USER_PROFILE,
            arguments = listOf(
                navArgument("userId") { type = NavType.StringType },
                navArgument("username") { type = NavType.StringType },
            ),
        ) { entry ->
            UserProfileScreen(
                userId = entry.arguments?.getString("userId").orEmpty(),
                username = entry.arguments?.getString("username").orEmpty(),
                onBack = { navController.popBackStack() },
                onOpenDetail = { id -> navController.navigate(Routes.collectionDetail(id)) },
                onOpenFollowList = { uid, name, tab ->
                    navController.navigate(Routes.followList(uid, name, tab))
                },
            )
        }
        composable(
            route = Routes.FOLLOW_LIST,
            arguments = listOf(
                navArgument("userId") { type = NavType.StringType },
                navArgument("username") { type = NavType.StringType },
                navArgument("tab") { type = NavType.StringType },
            ),
        ) { entry ->
            FollowListScreen(
                userId = entry.arguments?.getString("userId").orEmpty(),
                username = entry.arguments?.getString("username").orEmpty(),
                initialTab = entry.arguments?.getString("tab").orEmpty(),
                onBack = { navController.popBackStack() },
                onOpenProfile = { uid, name -> navController.navigate(Routes.userProfile(uid, name)) },
            )
        }
        composable(
            route = Routes.CITY_GUIDE,
            arguments = listOf(navArgument("city") { type = NavType.StringType }),
        ) { entry ->
            CityGuideScreen(
                city = entry.arguments?.getString("city").orEmpty(),
                onBack = { navController.popBackStack() },
                onOpenGenerate = { dest ->
                    navController.navigate(Routes.buildGenerateRoute(GenerateNavArgs(destination = dest)))
                },
                onOpenChat = { msg -> navController.navigate(Routes.chat(prefill = msg)) },
            )
        }
        composable(
            route = Routes.CITY_DETAIL,
            arguments = listOf(navArgument("city") { type = NavType.StringType }),
        ) { entry ->
            CityDetailScreen(
                city = entry.arguments?.getString("city").orEmpty(),
                onBack = { navController.popBackStack() },
                onOpenGenerate = { dest, interests, hint ->
                    navController.navigate(
                        Routes.buildGenerateRoute(
                            GenerateNavArgs(
                                destination = dest,
                                mode = "custom",
                                interests = interests,
                                chatHint = hint,
                            ),
                        ),
                    )
                },
                onOpenChat = { msg -> navController.navigate(Routes.chat(prefill = msg)) },
            )
        }
        composable(Routes.TRAVEL_SEARCH) {
            TravelSearchScreen(
                onBack = { navController.popBackStack() },
                onOpenPortalSelect = { from, to, mode ->
                    navController.navigate(Routes.portalSelect(from, to, mode))
                },
            )
        }
        composable(
            route = Routes.PORTAL_SELECT,
            arguments = listOf(
                navArgument("from") { type = NavType.StringType },
                navArgument("to") { type = NavType.StringType },
                navArgument("mode") { type = NavType.StringType },
            ),
        ) { entry ->
            PortalSelectScreen(
                from = entry.arguments?.getString("from").orEmpty(),
                to = entry.arguments?.getString("to").orEmpty(),
                mode = entry.arguments?.getString("mode").orEmpty(),
                onBack = { navController.popBackStack() },
            )
        }
        composable(Routes.FAVORITES) {
            FavoritesScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.MY_SUBSCRIPTIONS) {
            MySubscriptionsScreen(
                onBack = { navController.popBackStack() },
                onOpenDetail = { id -> navController.navigate(Routes.collectionDetail(id)) },
            )
        }
        composable(Routes.FOOTPRINT_OVERVIEW) {
            FootprintOverviewScreen(
                onBack = { navController.popBackStack() },
                onOpenList = { kind -> navController.navigate(Routes.footprintList(kind)) },
                onOpenCheckInMap = { navController.navigate(Routes.CHECK_IN_MAP_FULL) },
            )
        }
        composable(
            route = Routes.FOOTPRINT_LIST,
            arguments = listOf(navArgument("kind") { type = NavType.StringType }),
        ) { entry ->
            val kind = runCatching {
                FootprintListKind.valueOf(entry.arguments?.getString("kind").orEmpty())
            }.getOrDefault(FootprintListKind.PLACE)
            FootprintListScreen(kind = kind, onBack = { navController.popBackStack() })
        }
        composable(Routes.ADD_FOOTPRINT) {
            AddFootprintScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.CHECK_IN_MAP_FULL) {
            CheckInMapFullScreen(onBack = { navController.popBackStack() })
        }
        composable(
            route = Routes.SETTLEMENT,
            arguments = listOf(navArgument("tripId") { type = NavType.StringType }),
        ) { entry ->
            SettlementScreen(
                tripId = entry.arguments?.getString("tripId").orEmpty(),
                title = null,
                onBack = { navController.popBackStack() },
                onOpenExpenses = {
                    navController.navigate(Routes.settlementExpenses(entry.arguments?.getString("tripId").orEmpty()))
                },
                onOpenFlows = {
                    navController.navigate(Routes.settlementFlows(entry.arguments?.getString("tripId").orEmpty()))
                },
            )
        }
        composable(
            route = Routes.SETTLEMENT_EXPENSES,
            arguments = listOf(navArgument("tripId") { type = NavType.StringType }),
        ) { entry ->
            SettlementExpensesScreen(
                tripId = entry.arguments?.getString("tripId").orEmpty(),
                onBack = { navController.popBackStack() },
            )
        }
        composable(
            route = Routes.SETTLEMENT_FLOWS,
            arguments = listOf(navArgument("tripId") { type = NavType.StringType }),
        ) { entry ->
            SettlementFlowsScreen(
                tripId = entry.arguments?.getString("tripId").orEmpty(),
                onBack = { navController.popBackStack() },
            )
        }
        composable(
            route = Routes.MAP_FULL,
            arguments = listOf(
                navArgument("title") { type = NavType.StringType; nullable = true; defaultValue = "" },
                navArgument("markers") { type = NavType.StringType; defaultValue = "[]" },
                navArgument("polylines") { type = NavType.StringType; defaultValue = "[]" },
            ),
        ) { entry ->
            val markers = runCatching {
                com.travelguide.app.data.api.AppJson.decodeFromString(
                    ListSerializer(MapMarkerNav.serializer()),
                    entry.arguments?.getString("markers").orEmpty(),
                )
            }.getOrDefault(emptyList())
            val lineSeg = ListSerializer(Double.serializer())
            val polylines = runCatching {
                com.travelguide.app.data.api.AppJson.decodeFromString(
                    ListSerializer(ListSerializer(lineSeg)),
                    entry.arguments?.getString("polylines").orEmpty(),
                )
            }.getOrDefault(emptyList())
            MapFullScreen(
                title = entry.arguments?.getString("title"),
                markers = markers.map { MapMarkerArg(it.lng, it.lat, it.name) },
                polylines = polylines,
                onBack = { navController.popBackStack() },
            )
        }
        composable(
            route = Routes.PHOTO_RECOGNIZE,
            arguments = listOf(navArgument("uri") { type = NavType.StringType; nullable = true; defaultValue = null }),
        ) { entry ->
            PhotoRecognizeScreen(
                initialUri = entry.arguments?.getString("uri"),
                onBack = { navController.popBackStack() },
                onOpenChat = { msg -> navController.navigate(Routes.chat(prefill = msg)) },
            )
        }
    }
        UpdateLaunchPrompt()
    }
}

@kotlinx.serialization.Serializable
data class MapMarkerNav(val lng: Double, val lat: Double, val name: String)

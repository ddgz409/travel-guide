import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CollectionComment, CollectionDetail } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { PlaceImage } from "../../components/PlaceImage";
import { UserAvatar } from "../../components/UserAvatar";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { formatCollectionMeta } from "../../utils/collectionFormat";
import { styles } from "./collectionDetailStyles";

type Props = NativeStackScreenProps<AppStackParamList, "CollectionDetail">;

export function CollectionDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { collectionId } = route.params;
  const [detail, setDetail] = useState<CollectionDetail | null>(null);
  const [comments, setComments] = useState<CollectionComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, cl] = await Promise.all([
        api.collections.get(collectionId),
        api.collections.comments(collectionId),
      ]);
      setDetail(d);
      setComments(cl.items);
    } catch (e) {
      Alert.alert("加载失败", e instanceof ApiError ? e.message : "请稍后重试");
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [collectionId, navigation]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function toggleSubscribe() {
    if (!user) {
      Alert.alert("需要登录", "登录后即可订阅收藏夹", [
        { text: "取消", style: "cancel" },
        { text: "去登录", onPress: () => navigation.navigate("Login") },
      ]);
      return;
    }
    if (!detail || busy) return;
    setBusy(true);
    try {
      if (detail.subscribed) {
        await api.collections.unsubscribe(detail.id);
        setDetail({
          ...detail,
          subscribed: false,
          subscriber_count: Math.max(0, detail.subscriber_count - 1),
        });
      } else {
        await api.collections.subscribe(detail.id);
        setDetail({
          ...detail,
          subscribed: true,
          subscriber_count: detail.subscriber_count + 1,
        });
      }
    } catch (e) {
      Alert.alert("操作失败", e instanceof ApiError ? e.message : "请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  function requireLogin(): boolean {
    if (user) return true;
    Alert.alert("需要登录", "登录后才能点赞和评论", [
      { text: "取消", style: "cancel" },
      { text: "去登录", onPress: () => navigation.navigate("Login") },
    ]);
    return false;
  }

  async function toggleLike() {
    if (!detail || busy) return;
    if (!requireLogin()) return;
    setBusy(true);
    try {
      if (detail.liked) {
        await api.collections.unlike(detail.id);
        setDetail({
          ...detail,
          liked: false,
          like_count: Math.max(0, detail.like_count - 1),
        });
      } else {
        await api.collections.like(detail.id);
        setDetail({ ...detail, liked: true, like_count: detail.like_count + 1 });
      }
    } catch (e) {
      Alert.alert("操作失败", e instanceof ApiError ? e.message : "请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  async function submitComment() {
    const content = commentText.trim();
    if (!content || !detail || commentBusy) return;
    if (!requireLogin()) return;
    setCommentBusy(true);
    try {
      const c = await api.collections.addComment(detail.id, content);
      setComments((prev) => [c, ...prev]);
      setCommentText("");
      setDetail({ ...detail, comment_count: detail.comment_count + 1 });
    } catch (e) {
      Alert.alert("评论失败", e instanceof ApiError ? e.message : "请稍后重试");
    } finally {
      setCommentBusy(false);
    }
  }

  function canDeleteComment(c: CollectionComment): boolean {
    if (!user) return false;
    return (c.user_id != null && c.user_id === user.id) || (detail?.is_owner ?? false);
  }

  function removeComment(c: CollectionComment) {
    if (!detail) return;
    Alert.alert("删除评论", "确定删除这条评论吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          try {
            await api.collections.deleteComment(detail.id, c.id);
            setComments((prev) => prev.filter((x) => x.id !== c.id));
            setDetail({
              ...detail,
              comment_count: Math.max(0, detail.comment_count - 1),
            });
          } catch (e) {
            Alert.alert(
              "删除失败",
              e instanceof ApiError ? e.message : "请稍后重试",
            );
          }
        },
      },
    ]);
  }

  function fmtTime(ts: string): string {
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    if (sameDay) return `今天 ${hh}:${mm}`;
    return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
  }

  function confirmDelete() {
    if (!detail || busy) return;
    Alert.alert("删除发布", `确定删除「${detail.title}」吗？\n此操作不可恢复。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await api.collections.remove(detail.id);
            navigation.goBack();
          } catch (e) {
            Alert.alert(
              "删除失败",
              e instanceof ApiError ? e.message : "请稍后重试",
            );
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  if (loading || !detail) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        {detail.is_owner ? (
          <View style={styles.ownerActions}>
            <Pressable
              style={styles.deleteBtn}
              onPress={() => void confirmDelete()}
              disabled={busy}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="删除这条发布"
            >
              <Text style={styles.deleteBtnText}>
                {busy ? "…" : "删除"}
              </Text>
            </Pressable>
            <Pressable
              style={styles.editBtn}
              onPress={() =>
                navigation.navigate("PublishCollection", { collectionId: detail.id })
              }
            >
              <Text style={styles.editBtnIcon}>✎</Text>
              <Text style={styles.editBtnText}>编辑</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ width: 72 }} />
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
        <Text style={styles.emoji}>{detail.emoji}</Text>
        <Text style={styles.title}>{detail.title}</Text>
        <View style={styles.authorRow}>
          <UserAvatar name={detail.author_display} size={22} />
          {detail.author_id ? (
            <Pressable
              onPress={() =>
                navigation.navigate("UserProfile", {
                  userId: detail.author_id as string,
                  username: detail.author_display,
                })
              }
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`查看作者 ${detail.author_display} 的主页`}
            >
              <Text style={[styles.author, styles.authorLink]}>
                by {detail.author_display} ›
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.author}>by {detail.author_display}</Text>
          )}
        </View>
        {detail.summary ? <Text style={styles.summary}>{detail.summary}</Text> : null}
        <Text style={styles.meta}>
          {formatCollectionMeta(
            detail.place_count,
            detail.subscriber_count,
            detail.like_count,
          )}
        </Text>

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.likeBtn, detail.liked && styles.likeBtnOn]}
            onPress={() => void toggleLike()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={detail.liked ? "取消点赞" : "点赞"}
          >
            <Text style={[styles.likeIcon, detail.liked && styles.likeIconOn]}>
              {detail.liked ? "♥" : "♡"}
            </Text>
            <Text style={[styles.likeText, detail.liked && styles.likeTextOn]}>
              {detail.like_count}
            </Text>
          </Pressable>
          {!detail.is_owner ? (
            <Pressable
              style={[
                styles.subBtn,
                styles.subBtnFlex,
                detail.subscribed && styles.subBtnOn,
              ]}
              onPress={() => void toggleSubscribe()}
              disabled={busy}
            >
              <Text
                style={[styles.subBtnText, detail.subscribed && styles.subBtnTextOn]}
              >
                {busy ? "…" : detail.subscribed ? "已订阅" : "订阅收藏夹"}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>地点清单</Text>
        {detail.places.map((p, i) => (
          <View key={`${p.name}-${i}`} style={styles.placeRow}>
            <View style={styles.placeThumb}>
              <PlaceImage
                city={p.city}
                name={p.name}
                category="spots"
                poiId={p.poi_id || undefined}
                style={styles.placeThumbImg}
              />
            </View>
            <View style={styles.placeBody}>
              <Text style={styles.placeName}>{p.name}</Text>
              {p.note ? <Text style={styles.placeNote}>{p.note}</Text> : null}
              <Text style={styles.placeSub} numberOfLines={2}>
                {[p.city, p.address].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>评论 ({detail.comment_count})</Text>
        {comments.length === 0 ? (
          <Text style={styles.commentEmpty}>还没有评论，来说两句吧</Text>
        ) : (
          comments.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <UserAvatar name={c.username} size={26} />
              <View style={styles.commentBody}>
                <Text style={styles.commentName}>{c.username}</Text>
                <Text style={styles.commentContent}>{c.content}</Text>
                <Text style={styles.commentTime}>{fmtTime(c.created_at)}</Text>
              </View>
              {canDeleteComment(c) ? (
                <Pressable onPress={() => removeComment(c)} hitSlop={8}>
                  <Text style={styles.commentDel}>删除</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.commentFooter}>
        <TextInput
          style={styles.commentInput}
          value={commentText}
          onChangeText={setCommentText}
          placeholder="写下你的评论…"
          placeholderTextColor={colors.muted}
          multiline
        />
        <Pressable
          style={styles.commentSend}
          onPress={() => void submitComment()}
          disabled={commentBusy || !commentText.trim()}
        >
          <Text style={styles.commentSendText}>
            {commentBusy ? "…" : "发送"}
          </Text>
        </Pressable>
      </View>
      </KeyboardAvoidingView>
    </View>
  );
}

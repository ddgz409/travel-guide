import React, { memo, useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Collaborator } from "@travel-guide/shared";
import { UserAvatar } from "../../components/UserAvatar";
import { getAvatarUri, subscribeAvatars } from "../../utils/avatarStore";
import { absAvatar } from "../../api/client";
import { styles } from "./styles";

export const CollaboratorsRow = memo(function CollaboratorsRow({
  collaborators,
}: {
  collaborators: Collaborator[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [avatarUris, setAvatarUris] = useState<Record<string, string>>({});

  const refreshAvatars = useCallback(async () => {
    // 优先服务器头像（跨设备），无则回退本机
    const next: Record<string, string> = {};
    for (const c of collaborators) {
      const server = absAvatar(c.avatar);
      if (server) {
        next[c.user_id] = server;
      } else {
        const uri = await getAvatarUri(c.user_id);
        if (uri) next[c.user_id] = uri;
      }
    }
    setAvatarUris(next);
  }, [collaborators]);

  useEffect(() => {
    void refreshAvatars();
  }, [refreshAvatars]);

  useEffect(() => subscribeAvatars(() => { void refreshAvatars(); }), [refreshAvatars]);

  if (!collaborators.length) return null;

  return (
    <View style={styles.collabSectionBottom}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View
          style={[
            styles.collabShell,
            expanded ? styles.collabShellExpanded : styles.collabShellCollapsed,
          ]}
        >
          {expanded ? (
            <>
              <Text style={styles.collabHeader}>协作者</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.collabScroll}
              >
                {collaborators.map((c) => (
                  <View key={c.user_id} style={styles.collabChip}>
                    <UserAvatar
                      name={c.username}
                      size={34}
                      variant="circle"
                      imageUri={avatarUris[c.user_id]}
                    />
                    <View style={styles.collabTextWrap}>
                      <Text style={styles.collabName} numberOfLines={1}>
                        {c.username}
                      </Text>
                      {c.role === "owner" ? (
                        <Text style={styles.collabRole} numberOfLines={1}>
                          创建者
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : (
            <View style={styles.collabPeekRow}>
              {collaborators.slice(0, 5).map((c, i) => (
                <View
                  key={c.user_id}
                  style={[styles.collabPeekAvatar, i > 0 && styles.collabPeekOverlap]}
                >
                  <UserAvatar
                    name={c.username}
                    size={28}
                    variant="circle"
                    imageUri={avatarUris[c.user_id]}
                  />
                </View>
              ))}
              <Text style={styles.collabPeekLabel}>
                协作者 · {collaborators.length}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
    </View>
  );
});

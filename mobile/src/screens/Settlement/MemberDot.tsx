import { Text, View } from "react-native";

/** 同行人首字头像圆点 */
export function MemberDot({
  color,
  name,
  size = 28,
}: {
  color?: string | null;
  name: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color || "#B0BEC5",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontSize: size * 0.42, fontWeight: "800" }}>
        {name.slice(0, 1)}
      </Text>
    </View>
  );
}

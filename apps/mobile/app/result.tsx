import { ScrollView, View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ScoreCard } from "@/components/score-card";
import { resultStore } from "@/lib/result-store";

// Result screen (default export required by expo-router).
export default function ResultScreen() {
  const router = useRouter();
  const result = resultStore.get();

  if (!result) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 16, color: "#334155" }}>Gösterilecek bir sonuç yok.</Text>
        <Pressable
          onPress={() => router.replace("/")}
          style={{ backgroundColor: "#0d9488", borderRadius: 12, borderCurve: "continuous", paddingVertical: 14, alignItems: "center" }}
        >
          <Text style={{ color: "#ffffff", fontWeight: "600" }}>Yeni fotoğraf</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 16 }}>
      <ScoreCard result={result} />

      {result.limitations && result.limitations.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155" }}>Sınırlamalar</Text>
          {result.limitations.map((l, i) => (
            <Text key={i} selectable style={{ fontSize: 12, color: "#64748b", lineHeight: 18 }}>
              • {l}
            </Text>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={() => router.replace("/")}
        style={({ pressed }) => ({
          backgroundColor: "#0f172a",
          borderRadius: 14,
          borderCurve: "continuous",
          paddingVertical: 16,
          alignItems: "center",
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "700" }}>Yeni fotoğraf çek</Text>
      </Pressable>
    </ScrollView>
  );
}

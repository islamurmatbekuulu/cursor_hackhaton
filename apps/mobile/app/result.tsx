import { ScrollView, View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ScoreCard } from "@/components/score-card";
import { resultStore } from "@/lib/result-store";

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

      {result.report ? (
        <View
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 16,
            borderCurve: "continuous",
            padding: 16,
            gap: 8,
            shadowColor: "#0f172a",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.08,
            shadowRadius: 16,
            elevation: 3,
          }}
        >
          <Text style={{ fontSize: 12, color: "#0d9488", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Değerlendirme
          </Text>
          <Text selectable style={{ fontSize: 15, color: "#1e293b", lineHeight: 22 }}>
            {result.report}
          </Text>
        </View>
      ) : null}

      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155" }}>Kayıt durumu</Text>
        <Text style={{ fontSize: 14, color: result.persisted ? "#0d9488" : "#b45309" }}>
          {result.persisted
            ? "Belediye haritasına eklendi."
            : "Haritaya eklenmedi (konum yok veya sunucu kaydı başarısız)."}
        </Text>
        {result.street_label ? (
          <Text selectable style={{ fontSize: 13, color: "#64748b" }}>
            Sokak: {result.street_label}
          </Text>
        ) : null}
        {result.submission_id ? (
          <Text selectable style={{ fontSize: 12, color: "#94a3b8" }}>
            Kayıt: {result.submission_id}
          </Text>
        ) : null}
      </View>

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

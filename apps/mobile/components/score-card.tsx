import { View, Text } from "react-native";
import type { ScoreResponse } from "@kaldirim/shared-types";
import { CLASS_LABELS_TR, GRADE_COLORS } from "@/lib/labels";

// Named export (reusable component). Mirrors the web ScoreCard shape.
export function ScoreCard({ result }: { result: ScoreResponse }) {
  const gradeColor = GRADE_COLORS[result.grade] ?? "#475569";

  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 20,
        borderCurve: "continuous",
        padding: 20,
        gap: 16,
        boxShadow: "0 10px 30px rgba(15,23,42,0.10)",
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Kaldırım Skoru
          </Text>
          <Text selectable numberOfLines={1} style={{ fontSize: 18, fontWeight: "700", color: "#0f172a" }}>
            {result.query}
          </Text>
        </View>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            borderCurve: "continuous",
            backgroundColor: gradeColor,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 30, fontWeight: "800", color: "#ffffff" }}>{result.grade}</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Metric label="Skor" value={result.score.toFixed(1)} />
        <Metric label="Kirlilik" value={result.pollution_raw.toFixed(2)} />
        <Metric label="Nokta" value={String(result.points_sampled)} />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#334155" }}>Tespit edilen sınıflar</Text>
        {result.counts.length === 0 ? (
          <Text selectable style={{ fontSize: 14, color: "#64748b" }}>
            Bu konumda tespit bulunamadı.
          </Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {result.counts.map((c) => (
              <View
                key={c.class}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: "#f8fafc",
                  borderColor: "#e2e8f0",
                  borderWidth: 1,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#1e293b" }}>
                  {CLASS_LABELS_TR[c.class] ?? c.class}
                </Text>
                <Text style={{ fontSize: 13, color: "#64748b", fontVariant: ["tabular-nums"] }}>×{c.count}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#f8fafc",
        borderColor: "#e2e8f0",
        borderWidth: 1,
        borderRadius: 12,
        borderCurve: "continuous",
        paddingVertical: 12,
        alignItems: "center",
        gap: 2,
      }}
    >
      <Text style={{ fontSize: 20, fontWeight: "700", color: "#0f172a", fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
      <Text style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
    </View>
  );
}

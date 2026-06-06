import { useState } from "react";
import { ScrollView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { scorePhoto } from "@/lib/api";
import { resultStore } from "@/lib/result-store";

// Capture screen (default export required by expo-router).
export default function CaptureScreen() {
  const router = useRouter();
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError("Kamera izni verilmedi.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!res.canceled) setUri(res.assets[0].uri);
  }

  async function pickFromLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!res.canceled) setUri(res.assets[0].uri);
  }

  async function submit() {
    if (!uri) return;
    setLoading(true);
    setError(null);
    try {
      if (process.env.EXPO_OS === "ios") {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const result = await scorePhoto(uri);
      resultStore.set(result);
      router.push("/result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 20, gap: 16 }}
    >
      <Text style={{ fontSize: 15, color: "#475569", lineHeight: 22 }}>
        Bir kaldırım fotoğrafı çekin veya seçin. Yüz ve plakalar analiz öncesinde
        sunucuda geri dönülemez biçimde bulanıklaştırılır; ham görüntü saklanmaz.
      </Text>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <ActionButton label="Fotoğraf Çek" onPress={pickFromCamera} primary />
        <ActionButton label="Galeriden Seç" onPress={pickFromLibrary} />
      </View>

      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 16, borderCurve: "continuous", backgroundColor: "#e2e8f0" }}
          contentFit="cover"
        />
      ) : (
        <View
          style={{
            width: "100%",
            aspectRatio: 4 / 3,
            borderRadius: 16,
            borderCurve: "continuous",
            borderWidth: 1,
            borderColor: "#cbd5e1",
            borderStyle: "dashed",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#94a3b8" }}>Henüz fotoğraf seçilmedi</Text>
        </View>
      )}

      {error ? (
        <Text selectable style={{ color: "#b91c1c", fontSize: 14 }}>
          {error}
        </Text>
      ) : null}

      <Pressable
        onPress={submit}
        disabled={!uri || loading}
        style={({ pressed }) => ({
          backgroundColor: !uri || loading ? "#94a3b8" : "#0d9488",
          borderRadius: 14,
          borderCurve: "continuous",
          paddingVertical: 16,
          alignItems: "center",
          opacity: pressed ? 0.9 : 1,
        })}
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "700" }}>Skorla</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function ActionButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: primary ? "#0f172a" : "#ffffff",
        borderColor: "#cbd5e1",
        borderWidth: primary ? 0 : 1,
        borderRadius: 14,
        borderCurve: "continuous",
        paddingVertical: 14,
        alignItems: "center",
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: primary ? "#ffffff" : "#0f172a", fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

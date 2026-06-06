import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

// Route layout (default export required by expo-router).
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerLargeTitle: true,
          headerTransparent: false,
        }}
      >
        <Stack.Screen name="index" options={{ title: "Kaldırım Skoru" }} />
        <Stack.Screen name="result" options={{ title: "Skor" }} />
      </Stack>
    </SafeAreaProvider>
  );
}

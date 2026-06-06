import Constants from "expo-constants";

// API base resolves from app.json `extra.apiBase`, overridable via env at build.
const extra = (Constants.expoConfig?.extra ?? {}) as { apiBase?: string };

export const API_BASE: string =
  process.env.EXPO_PUBLIC_API_BASE ?? extra.apiBase ?? "http://localhost:8080";

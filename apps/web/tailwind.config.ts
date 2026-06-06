import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        // Single restrained accent (teal). No purple/neon per design-taste rules.
        accent: {
          DEFAULT: "#0d9488",
          fg: "#ffffff",
          soft: "#ccfbf1",
        },
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      boxShadow: {
        // Diffusion shadow tinted to the neutral background.
        diffuse: "0 20px 40px -18px rgba(15, 23, 42, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;

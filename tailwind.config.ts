import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Pulled directly from creatorskins.com's computed styles (2026-07-15).
        ink: "#0E0A1A",
        surface: "#1A1228",
        surface2: "#221832",
        accent: "#A855F7",
        "accent-light": "#C084FC",
        positive: "#4ADE80",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "sans-serif"],
        sans: ["var(--font-inter)", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0px",
      },
    },
  },
  plugins: [],
};

export default config;

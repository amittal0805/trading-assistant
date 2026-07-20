import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0f",
        surface: "#12121a",
        card: "#16161f",
        border: "#23232f",
        muted: "#8b8b9e",
        accent: "#3b82f6",
        gain: "#22c55e",
        loss: "#ef4444",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Inter", "Segoe UI", "sans-serif"],
        mono: ["SF Mono", "ui-monospace", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;

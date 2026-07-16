import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Ledger palette — ink on paper, with a warm "in" and cool "out".
        ink:    "#16130F",   // near-black warm ink
        paper:  "#FBFAF7",   // soft off-white
        panel:  "#FFFFFF",
        line:   "#E7E3DA",   // hairline rules
        muted:  "#8A8478",
        // money temperature
        income: "#1F7A5A",   // deep green — money in
        outflow:"#B4472F",   // terracotta-brick — money out (not the AI accent)
        accent: "#3D5AFE",   // electric indigo — interactive
        warn:   "#C99A2E",   // overdue amber
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { xl: "14px", "2xl": "18px" },
      boxShadow: { card: "0 1px 2px rgba(22,19,15,.04), 0 8px 24px rgba(22,19,15,.05)" },
    },
  },
  plugins: [],
};
export default config;

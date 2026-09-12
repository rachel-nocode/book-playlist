import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        "foreground-90": "rgba(244, 234, 217, 0.9)",
        paper: "var(--paper)",
        ink: "var(--ink-muted)",
        gold: "var(--gold)",
        "gold-50": "rgba(228, 195, 122, 0.5)",
        rule: "var(--rule)",
        "rule-80": "rgba(61, 52, 43, 0.8)",
      },
      fontFamily: {
        serif: [
          "ui-serif",
          "Georgia",
          "Iowan Old Style",
          "Palatino Linotype",
          "Times New Roman",
          "serif",
        ],
      },
      boxShadow: {
        cover: "0 10px 24px -8px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 236, 200, 0.08)",
      },
    },
  },
  plugins: [],
};
export default config;

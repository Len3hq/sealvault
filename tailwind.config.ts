import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sv: {
          bg:           "rgb(var(--sv-bg) / <alpha-value>)",
          surface:      "rgb(var(--sv-surface) / <alpha-value>)",
          card:         "rgb(var(--sv-card) / <alpha-value>)",
          "card-blue":  "#1e3ab8",
          border:       "rgb(var(--sv-border) / <alpha-value>)",
          "border-hi":  "rgb(var(--sv-border-hi) / <alpha-value>)",
          text:         "rgb(var(--sv-text) / <alpha-value>)",
          muted:        "rgb(var(--sv-muted) / <alpha-value>)",
          dim:          "rgb(var(--sv-dim) / <alpha-value>)",
          blue:         "rgb(var(--sv-blue) / <alpha-value>)",
          "blue-li":    "rgb(var(--sv-blue-li) / <alpha-value>)",
          "blue-dim":   "rgb(var(--sv-blue-dim) / <alpha-value>)",
          "blue-muted": "rgb(var(--sv-blue-muted) / <alpha-value>)",
          orange:       "rgb(var(--sv-orange) / <alpha-value>)",
          "orange-li":  "rgb(var(--sv-orange-li) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["IBM Plex Mono", "var(--font-ibm-plex-mono)", "Courier New", "monospace"],
        mono: ["IBM Plex Mono", "var(--font-ibm-plex-mono)", "Courier New", "monospace"],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          from: { opacity: "0", transform: "translateY(-6px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to:   { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in":    "fade-in 0.25s ease-out both",
        "slide-up":   "slide-up 0.3s ease-out both",
        "slide-down": "slide-down 0.2s ease-out both",
        "scale-in":   "scale-in 0.2s ease-out both",
      },
    },
  },
  plugins: [],
}

export default config

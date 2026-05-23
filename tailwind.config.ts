import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sv: {
          bg:           "#ffffff",
          surface:      "#f9f9f8",
          card:         "#f0eeeb",
          "card-blue":  "#1e3ab8",
          border:       "#d8d5d0",
          "border-hi":  "#a09890",
          text:         "#0d0d0b",
          muted:        "#5a5651",
          dim:          "#9a9590",
          blue:         "#1e3ab8",
          "blue-li":    "#2a4fd0",
          "blue-dim":   "#152d9a",
          "blue-muted": "#eef0fb",
          orange:       "#e8590c",
          "orange-li":  "#fff4ee",
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

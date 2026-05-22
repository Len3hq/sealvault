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
        vault: {
          navy: "#0f172a",
          dark: "#1e293b",
          card: "#1e2d3d",
          border: "#2d3f55",
          gold: "#f59e0b",
          "gold-light": "#fcd34d",
        },
      },
    },
  },
  plugins: [],
}

export default config

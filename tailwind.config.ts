import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary palette — deep pitch green + gold accents
        pitch: {
          50: "#f0faf4",
          100: "#d9f2e3",
          200: "#b5e5c9",
          300: "#82d2a6",
          400: "#4db87e",
          500: "#2a9d61",
          600: "#1e7d4d",
          700: "#1a6440",
          800: "#185035",
          900: "#15422d",
          950: "#0a2519",
        },
        // Accent gold — for highlights, points, rankings
        gold: {
          50: "#fffbeb",
          100: "#fff3c6",
          200: "#ffe588",
          300: "#ffd24a",
          400: "#ffc020",
          500: "#f9a007",
          600: "#dd7802",
          700: "#b75406",
          800: "#94400c",
          900: "#7a350d",
          950: "#461a02",
        },
        // Result colors
        correct: "#16a34a",    // green-600
        incorrect: "#dc2626",  // red-600
        pending: "#9ca3af",    // gray-400
      },
      fontFamily: {
        display: ['"DM Sans"', "system-ui", "sans-serif"],
        body: ['"DM Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;

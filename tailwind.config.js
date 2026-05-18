/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        qs: {
          bg: "#1e1e2e",
          surface: "#282840",
          surface2: "#313152",
          accent: "#7c6ff7",
          accentHover: "#6b5ce7",
          text: "#e4e4ef",
          textMuted: "#9898b0",
          border: "#3d3d5c",
          success: "#4ade80",
          warning: "#fbbf24",
          danger: "#f87171",
        },
      },
      animation: {
        "fade-in": "fadeIn 0.15s ease-out",
        "slide-up": "slideUp 0.15s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        parchment: {
          50: "#fcfaf5",
          100: "#f6f1e8",
          200: "#ebe1d1",
          300: "#dcccba",
        },
        ink: {
          950: "#171411",
          900: "#231d18",
          700: "#5d5348",
          500: "#8b7d6d",
        },
      },
      boxShadow: {
        card: "0 10px 30px rgba(35, 29, 24, 0.06)",
        "card-lg": "0 20px 50px rgba(35, 29, 24, 0.09)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.6)",
      },
    },
  },
  plugins: [],
};

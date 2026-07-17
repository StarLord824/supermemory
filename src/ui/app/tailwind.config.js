/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tokens read off the reference screenshots of the hosted console.
        canvas: "#09090b",
        surface: "#101012",
        elevated: "#161618",
        hairline: "rgba(255,255,255,0.10)",
        ink: { DEFAULT: "#fafafa", muted: "#a1a1aa", faint: "#71717a" },
        accent: { blue: "#3b82f6", green: "#22c55e", red: "#ef4444" },
      },
      fontFamily: {
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Space Grotesk"', '"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

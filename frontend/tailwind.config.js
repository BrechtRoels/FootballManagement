/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // KSV Jabbeke brand accents (on a white background):
        // brand = red (swans / crest border), steel = shield grey, ink = black.
        brand: {
          50: "#fef2f2",
          100: "#fde3e1",
          200: "#fbcbc7",
          300: "#f5a39c",
          400: "#ee6f64",
          500: "#e34234",
          600: "#d8241b",
          700: "#b41c15",
          800: "#951a15",
          900: "#7c1a17",
          950: "#430a08",
        },
        steel: {
          50: "#f6f6f7",
          100: "#e9eaea",
          200: "#d3d4d5",
          300: "#b1b3b5",
          400: "#87898d",
          500: "#696b6f",
          600: "#585a5c",
          700: "#494a4c",
          800: "#3f4041",
          900: "#252628",
        },
        ink: {
          50: "#f3f3f4",
          100: "#e3e3e5",
          200: "#c7c8ca",
          300: "#a0a1a4",
          400: "#6e7074",
          500: "#46484c",
          600: "#303236",
          700: "#232427",
          800: "#1a1b1e",
          900: "#111214",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
      },
    },
  },
  plugins: [],
};

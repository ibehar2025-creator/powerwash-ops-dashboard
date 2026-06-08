/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#15212f",
        mist: "#eef6f8",
        lagoon: "#087f8c",
        marine: "#2457a6",
        coral: "#f2674a",
        fern: "#2f855a"
      },
      boxShadow: {
        soft: "0 18px 40px rgba(21, 33, 47, 0.08)"
      }
    },
  },
  plugins: [],
};

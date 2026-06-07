import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#fffdf7",
        ink: "#1f2933",
        sea: "#0f766e",
        sky: "#2563eb",
        sun: "#f59e0b"
      }
    }
  },
  plugins: []
};

export default config;

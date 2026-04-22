import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#102033",
        mist: "#edf4fa",
        tide: "#c1d8eb",
        signal: "#1768ff",
        mint: "#d5f4ea",
        shell: "#f8fbfd"
      },
      boxShadow: {
        panel: "0 18px 48px rgba(16, 32, 51, 0.08)",
        glow: "0 20px 90px rgba(23, 104, 255, 0.14)"
      }
    }
  },
  plugins: []
};

export default config;

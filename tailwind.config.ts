import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4fb",
          100: "#dce6f1",
          500: "#2e74b5",
          600: "#215a8f",
          700: "#1f3864",
          900: "#132342",
        },
      },
    },
  },
  plugins: [],
};

export default config;

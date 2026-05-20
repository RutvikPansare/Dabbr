import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Plus Jakarta Sans — injected via CSS variable from next/font
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        accent:     "var(--accent)",
      },
      boxShadow: {
        // Design-token shadows — all very subtle, no harsh elevation
        card:        "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)",
        "card-md":   "0 4px 12px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.03)",
        float:       "0 4px 24px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.04)",
        nav:         "0 -2px 20px rgba(0,0,0,0.05), 0 -1px 4px rgba(0,0,0,0.02)",
        "accent-sm": "0 2px 8px rgba(244,98,42,0.30)",
        "accent-md": "0 4px 16px rgba(244,98,42,0.28)",
      },
    },
  },
  plugins: [],
};
export default config;

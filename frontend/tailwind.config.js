/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#080c14',
          card: '#0f172a',
          border: '#1e293b',
          text: '#f8fafc',
          textMuted: '#94a3b8'
        },
        brand: {
          primary: '#3b82f6', // Blue
          secondary: '#8b5cf6', // Violet
          accent: '#10b981', // Emerald
          warning: '#f59e0b', // Amber
          danger: '#ef4444' // Red
        }
      }
    },
  },
  plugins: [],
}

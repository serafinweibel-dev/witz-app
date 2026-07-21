/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#F7F5F0',
        ink: '#161513',
        accent: '#D8232A',
        accentdim: '#F0C9CA',
      },
    },
  },
  plugins: [],
};

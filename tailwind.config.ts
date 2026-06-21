import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#e11d2a',
          dark: '#b3141f',
          black: '#0a0a0a',
        },
      },
    },
  },
  plugins: [],
};

export default config;

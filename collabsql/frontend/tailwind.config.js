/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        black: {
          DEFAULT: '#000000',
          light: '#0D0D0D',
          card: '#1F1F1F',
          border: '#2A2A2A',
        },
        orange: {
          DEFAULT: '#FF6A00',
          hover: '#FF8C32',
          glow: '#FFA94D',
        },
        text: {
          primary: '#EAEAEA',
          secondary: '#CFCFCF',
          muted: '#9A9A9A',
        },
        accent: '#00C2FF',
      },
      fontFamily: {
        heading: ['Space Grotesk', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'blob': 'blob 20s infinite',
        'blob-slow': 'blob 25s infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        blob: {
          '0%, 100%': {
            transform: 'translate(0px, 0px) scale(1)',
          },
          '33%': {
            transform: 'translate(30px, -50px) scale(1.1)',
          },
          '66%': {
            transform: 'translate(-20px, 20px) scale(0.9)',
          },
        },
        float: {
          '0%, 100%': {
            transform: 'translateY(0px)',
          },
          '50%': {
            transform: 'translateY(-20px)',
          },
        },
      },
    },
  },
  plugins: [],
};

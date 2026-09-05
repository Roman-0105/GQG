/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--kern-bg)',
        surface: 'var(--kern-surface)',
        'surface-2': 'var(--kern-surface-2)',
        ink: 'var(--kern-ink)',
        'ink-muted': 'var(--kern-ink-muted)',
        line: 'var(--kern-line)',
        accent: 'var(--kern-accent)',
        'accent-2': 'var(--kern-accent-2)',
        good: 'var(--kern-good)',
        warn: 'var(--kern-warn)',
        crit: 'var(--kern-crit)',
      },
    },
  },
  plugins: [],
};

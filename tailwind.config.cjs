/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme');

/**
 * mvpfy's palette: a near-monochrome workspace in the manner of an agent IDE,
 * dark by default and light on request. Colour is kept for meaning — green is
 * running and done, amber is working or needs a look, red is failed — and
 * everything else is a step on one neutral ramp. The strongest ink is the
 * emphasis: the primary action, the selected item, the focus ring.
 *
 * The values live in src/index.css as CSS variables, one set per theme, so a
 * theme switch is a single attribute on <html> and every class follows it.
 * What each token is FOR is written there.
 */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sunken: v('sunken'),
        paper: v('paper'),
        chrome: v('chrome'),
        surface: v('surface'),
        raised: v('raised'),
        hoverfill: v('hoverfill'),
        line: v('line'),
        'line-subtle': v('line-subtle'),
        'line-strong': v('line-strong'),
        ink: { DEFAULT: v('ink'), hover: v('ink-hover') },
        onink: v('onink'),
        body: v('body'),
        muted: v('muted'),
        faint: v('faint'),
        'dot-idle': v('dot-idle'),
        go: {
          DEFAULT: v('go'),
          hover: v('go-hover'),
          bg: v('go-bg'),
          bgalt: v('go-bgalt'),
          border: v('go-border'),
        },
        work: { DEFAULT: v('work'), bg: v('work-bg'), border: v('work-border') },
        warn: { bg: v('work-bg'), border: v('work-border'), text: v('work') },
        danger: {
          DEFAULT: v('danger'),
          hover: v('danger-hover'),
          bg: v('danger-bg'),
          border: v('danger-border'),
        },
        // "You are here" is marked by brightness, not a hue: brand is ink.
        brand: {
          DEFAULT: v('ink'),
          light: v('ink-hover'),
          hover: v('ink-hover'),
          dark: v('surface'),
        },
      },
      fontFamily: {
        sans: ['"Geist Variable"', ...defaultTheme.fontFamily.sans],
        mono: ['"Geist Mono Variable"', ...defaultTheme.fontFamily.mono],
      },
      letterSpacing: {
        // Display type is set tight, as in the reference; body stays at 0.
        display: '-0.035em',
        heading: '-0.02em',
      },
      borderRadius: {
        pane: '14px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
    },
  },
  plugins: [],
};

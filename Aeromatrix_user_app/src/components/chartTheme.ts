/** Shared recharts styling so every chart reads the same on cream and dark surfaces. */
export const CHART = {
  grid: '#ffffff14',
  gridOnCream: 'rgba(0,0,0,0.08)',
  text: 'var(--color-sand-300)',
  textStrong: 'var(--color-sand-100)',
  axisFontSize: 11,
  tooltip: {
    contentStyle: {
      background: 'var(--color-ink-900)',
      border: '1px solid color-mix(in srgb, var(--color-sand-400) 30%, transparent)',
      borderRadius: 10,
      fontSize: 12,
      color: 'var(--color-sand-100)',
    },
    labelStyle: { color: 'var(--color-sand-200)', fontWeight: 700 },
    itemStyle: { color: 'var(--color-sand-100)' },
  },
  cursor: { fill: 'rgba(163,38,63,0.08)' },
  tick: { fontSize: 11, fill: 'var(--color-sand-300)' },
} as const;

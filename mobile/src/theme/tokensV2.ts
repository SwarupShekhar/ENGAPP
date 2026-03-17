export const tokensV2 = {
  colors: {
    background: '#0A0A14',
    surfaceGlass: 'rgba(255,255,255,0.05)',
    surfaceBorder: 'rgba(255,255,255,0.08)',
    primaryViolet: '#6C63FF',
    accentAmber: '#FFB347',
    accentMint: '#00E5A0',
    accentCyan: '#00D2FF',
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.55)',
    textMuted: 'rgba(255,255,255,0.30)',
  },
  gradients: {
    speedometer: ['#6C63FF', '#FFB347'],
    callButton: ['#6C63FF', '#FFB347'],
    practiceButton: ['#FFB347', '#FF8C00'],
    ebitesButton: ['#00E5A0', '#00B4D8'],
    progressBar: ['#6C63FF', '#00E5A0'],
    auroraTop: ['rgba(108,99,255,0.15)', 'transparent'],
  },
  spacing: { xs: 4, s: 8, m: 16, l: 24, xl: 32 },
  borderRadius: { s: 8, m: 12, l: 16, xl: 24, pill: 40 },
  shadows: {
    violet: { shadowColor: '#6C63FF', shadowOffset: {width:0,height:4}, shadowOpacity:0.4, shadowRadius:12, elevation:8 },
    amber: { shadowColor: '#FFB347', shadowOffset: {width:0,height:4}, shadowOpacity:0.4, shadowRadius:12, elevation:8 },
    mint: { shadowColor: '#00E5A0', shadowOffset: {width:0,height:4}, shadowOpacity:0.4, shadowRadius:12, elevation:8 },
  },
} as const;
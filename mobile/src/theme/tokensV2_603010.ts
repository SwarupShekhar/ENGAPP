export const tokensV2_603010 = {
  // Keep the same token *shape* as `tokensV2` so existing V2 screens
  // can swap imports without refactors.
  colors: {
    // 60–30–10 palette (V2-only)
    background: "#0B0B0D", // 60%
    // 30% surface: #1E1128
    // glass versions use the same RGB(30,17,40)
    // Slightly higher opacity to preserve contrast under blur
    surfaceGlass: "rgba(30,17,40,0.82)",
    surfaceBorder: "rgba(255,255,255,0.10)",

    // Aliases (some screens may use these)
    surface: "#1E1128",
    accent: "#C5E84D",

    // Accent (10%) — map to all accent slots used by existing V2 UI
    primaryViolet: "#C5E84D",
    accentAmber: "#C5E84D",
    accentMint: "#C5E84D",
    accentCyan: "#C5E84D",

    textPrimary: "#FFFFFF",
    // Contrast boost for V2 (glass backgrounds degrade perceived contrast)
    textSecondary: "rgba(255,255,255,0.72)",
    textMuted: "rgba(255,255,255,0.48)",
  },
  gradients: {
    speedometer: ["#C5E84D", "rgba(197,232,77,0.35)"],
    callButton: ["#C5E84D", "rgba(197,232,77,0.35)"],
    practiceButton: ["#C5E84D", "rgba(197,232,77,0.35)"],
    ebitesButton: ["#C5E84D", "rgba(197,232,77,0.35)"],
    progressBar: ["#C5E84D", "rgba(197,232,77,0.35)"],
    auroraTop: ["rgba(197,232,77,0.18)", "transparent"],
  },
  spacing: { xs: 4, s: 8, m: 16, l: 24, xl: 32 },
  borderRadius: { s: 8, m: 12, l: 16, xl: 24, pill: 40 },
  shadows: {
    violet: {
      shadowColor: "#C5E84D",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 8,
    },
    amber: {
      shadowColor: "#C5E84D",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 8,
    },
    mint: {
      shadowColor: "#C5E84D",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 8,
    },
  },
} as const;


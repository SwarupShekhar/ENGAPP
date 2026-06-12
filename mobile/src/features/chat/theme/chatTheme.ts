export const chatThreadTheme = {
  canvas: "#0A0A0F",
  incomingBubble: "#1C1C24",
  outgoingBubble: "#6D28D9",
  incomingText: "#F4F4F5",
  outgoingText: "#FFFFFF",
  footerMuted: "#71717A",
  dateSeparatorBg: "rgba(255,255,255,0.08)",
  dateSeparatorText: "#A1A1AA",
  bubblePaddingH: 14,
  bubblePaddingV: 10,
  runGap: 4,
  runToRunGap: 12,
  maxBubbleWidth: "78%",
} as const;

export function getBubbleRadii(
  index: number,
  count: number,
  isMine: boolean
): {
  borderTopLeftRadius: number;
  borderTopRightRadius: number;
  borderBottomRightRadius: number;
  borderBottomLeftRadius: number;
} {
  const R = 18;
  const r = 4;

  if (count === 1) {
    return { borderTopLeftRadius: R, borderTopRightRadius: R, borderBottomRightRadius: R, borderBottomLeftRadius: R };
  }

  if (index === 0) {
    return isMine
      ? { borderTopLeftRadius: R, borderTopRightRadius: R, borderBottomRightRadius: r, borderBottomLeftRadius: R }
      : { borderTopLeftRadius: R, borderTopRightRadius: R, borderBottomRightRadius: R, borderBottomLeftRadius: r };
  }

  if (index === count - 1) {
    return isMine
      ? { borderTopLeftRadius: r, borderTopRightRadius: R, borderBottomRightRadius: R, borderBottomLeftRadius: R }
      : { borderTopLeftRadius: R, borderTopRightRadius: r, borderBottomRightRadius: R, borderBottomLeftRadius: R };
  }

  return isMine
    ? { borderTopLeftRadius: r, borderTopRightRadius: R, borderBottomRightRadius: r, borderBottomLeftRadius: R }
    : { borderTopLeftRadius: R, borderTopRightRadius: r, borderBottomRightRadius: R, borderBottomLeftRadius: r };
}

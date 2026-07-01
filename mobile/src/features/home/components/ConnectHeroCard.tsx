import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { homeTheme } from '../theme/homeTheme';

// Graceful no-op when expo-haptics is unavailable (web / stripped builds)
let Haptics: {
  impactAsync: (s: unknown) => Promise<void>;
  ImpactFeedbackStyle: { Medium: string; Light: string };
} = {
  impactAsync: async () => {},
  ImpactFeedbackStyle: { Medium: 'medium', Light: 'light' },
};
try { Haptics = require('expo-haptics'); } catch { /* optional */ }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnectHeroCardProps {
  onlineCount: number;
  avatars: string[];        // up to 4 initials, e.g. ["RA","PK","SM","AN"]
  onFindPartner: () => void;
  onMayaFallback: () => void;
  reduceMotion: boolean;    // when true: render static, NO animations
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Pulsing green live dot */
function LiveDot({ reduceMotion }: { reduceMotion: boolean }) {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    scale.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [reduceMotion, opacity, scale]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[styles.liveDot, dotStyle]} />;
}

/** Single avatar circle — with ambient breathe loop */
function AvatarCircle({
  initials,
  index,
  reduceMotion,
}: {
  initials: string | null;
  index: number;
  reduceMotion: boolean;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    // Stagger each avatar slightly so they don't breathe in lockstep
    const delay = index * 200;
    const timer = setTimeout(() => {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.02, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.98, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    }, delay);
    return () => clearTimeout(timer);
  }, [reduceMotion, index, scale]);

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.avatarCircle,
        index > 0 && styles.avatarOverlap,
        circleStyle,
      ]}
    >
      {initials !== null ? (
        <Text style={styles.avatarInitials}>{initials}</Text>
      ) : (
        <Ionicons name="person" size={18} color={homeTheme.textTitle} />
      )}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Gradient border layer with animated rotation
// ---------------------------------------------------------------------------

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

function AnimatedGradientBorder({
  reduceMotion,
  radius,
}: {
  reduceMotion: boolean;
  radius: number;
}) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    rotation.value = withRepeat(
      withTiming(360, {
        duration: homeTheme.heroRotationMs,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [reduceMotion, rotation]);

  const borderStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  // The gradient is scaled up enough that rotation never reveals the card bg
  // underneath the border. We clip the outer container so the oversize
  // gradient stays contained.
  return (
    <AnimatedLinearGradient
      colors={homeTheme.heroGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFillObject, { borderRadius: radius }, borderStyle]}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ConnectHeroCard({
  onlineCount,
  avatars,
  onFindPartner,
  onMayaFallback,
  reduceMotion,
}: ConnectHeroCardProps) {
  const displayCount = Math.max(0, onlineCount);
  const liveLabel =
    displayCount === 0
      ? 'Be the first — learners join throughout the day'
      : displayCount === 1
        ? '1 learner practicing now'
        : `${displayCount} learners practicing now`;

  // Clamp avatars to max 4
  const clampedAvatars = avatars.slice(0, 4);

  // Avatar list: show real peers only; skip decorative placeholders when alone.
  const avatarItems: Array<string | null> =
    clampedAvatars.length > 0 ? clampedAvatars : [];

  // Button press scale
  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const handleFindPartnerPress = () => {
    btnScale.value = withSequence(
      withTiming(homeTheme.pressScale, { duration: 80 }),
      withTiming(1, { duration: 120 }),
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onFindPartner();
  };

  const handleMayaPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onMayaFallback();
  };

  const RADIUS = homeTheme.cardRadius;
  const BORDER = homeTheme.heroBorderWidth;

  return (
    // Outer container clips the gradient border so it never bleeds outside
    <View style={[styles.outerClip, { borderRadius: RADIUS }]}>
      {/* Animated gradient border layer */}
      <AnimatedGradientBorder reduceMotion={reduceMotion} radius={RADIUS} />

      {/* Inner card surface — inset by border width on all sides */}
      <View
        style={[
          styles.inner,
          {
            margin: BORDER,
            borderRadius: RADIUS - BORDER,
          },
        ]}
      >
        {/* ── Top row: live indicator ── */}
        <View style={styles.liveRow}>
          <LiveDot reduceMotion={reduceMotion} />
          <Text style={styles.liveText}>{liveLabel}</Text>
        </View>

        {/* ── Avatar stack ── */}
        {avatarItems.length > 0 ? (
          <View style={styles.avatarRow}>
            {avatarItems.map((initials, i) => (
              <AvatarCircle
                key={i}
                initials={initials}
                index={i}
                reduceMotion={reduceMotion}
              />
            ))}
          </View>
        ) : null}

        {/* ── Find a Partner CTA ── */}
        <Animated.View style={btnStyle}>
          <Pressable
            style={styles.ctaButton}
            onPress={handleFindPartnerPress}
            accessibilityRole="button"
            accessibilityLabel="Find a Partner"
          >
            <Text style={styles.ctaLabel}>Find a Partner</Text>
          </Pressable>
        </Animated.View>

        {/* ── Maya fallback strip ── */}
        <View style={styles.divider} />
        <Pressable
          style={styles.mayaRow}
          onPress={handleMayaPress}
          accessibilityRole="button"
          accessibilityLabel="No partner around? Chat with Maya"
        >
          <View style={styles.mayaIconCircle}>
            <Ionicons name="chatbubble-ellipses" size={14} color={homeTheme.action} />
          </View>
          <Text style={styles.mayaText}>
            No partner around? Maya's up for a chat
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  outerClip: {
    overflow: 'hidden',
  },

  inner: {
    backgroundColor: homeTheme.cardFill,
    paddingHorizontal: homeTheme.cardPadding,
    paddingVertical: 12,
    gap: 10,
  },

  // Live indicator row
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: homeTheme.live,
  },
  liveText: {
    fontSize: homeTheme.fontMeta,
    color: homeTheme.textBody,
    fontWeight: '500',
    flex: 1,
  },

  // Avatar stack
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(109,40,217,0.18)',
    borderWidth: 1,
    borderColor: homeTheme.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverlap: {
    marginLeft: -10,
  },
  avatarInitials: {
    fontSize: 12,
    fontWeight: '700',
    color: homeTheme.textTitle,
    letterSpacing: 0.2,
  },

  // CTA button
  ctaButton: {
    backgroundColor: homeTheme.action,
    borderRadius: 12,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    color: '#FFFFFF',
    fontSize: homeTheme.fontTitle,
    fontWeight: '700',
  },

  // Maya fallback
  divider: {
    height: 1,
    backgroundColor: homeTheme.cardBorder,
    marginHorizontal: -homeTheme.cardPadding,
  },
  mayaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 0,
  },
  mayaIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(109,40,217,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mayaText: {
    fontSize: homeTheme.fontMeta,
    color: homeTheme.textBody,
    flex: 1,
  },
});

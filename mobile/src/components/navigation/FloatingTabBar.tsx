import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokensV2_603010 as tokensV2 } from '../../theme/tokensV2_603010';

const { width } = Dimensions.get('window');

const TabIcon = ({ name, color, size = 24 }: { name: string; color: string; size?: number }) => {
  return <Ionicons name={name as any} size={size} color={color} />;
};

const ENGLIVO_ACTIVE = '#E8A020';
const ENGLIVO_MUTED = '#8B9AB0';

export default function FloatingTabBar({
  state,
  descriptors,
  navigation,
  englivo,
}: any) {
  const insets = useSafeAreaInsets();
  const orderedRoutes = React.useMemo(() => {
    const orderMap: Record<string, number> = englivo
      ? { Home: 0, Sessions: 1, Progress: 2, Profile: 3 }
      : {
          Home: 0,
          Feedback: 1,
          Call: 2,
          eBites: 3,
          Progress: 4,
        };
    return [...state.routes].sort(
      (a, b) => (orderMap[a.name] ?? 99) - (orderMap[b.name] ?? 99),
    );
  }, [state.routes, englivo]);

  return (
    <View style={[styles.container, { bottom: Math.max(insets.bottom, 10) }]}>
      <BlurView
        intensity={40}
        tint="dark"
        style={[styles.pill, englivo && styles.pillEnglivo]}
      >
        {orderedRoutes.map((route: any) => {
          const { options } = descriptors[route.key];
          // Some navigators expose tabBarLabel as a function/component.
          // Ensure we only render plain text labels inside <Text>.
          const rawLabel =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
              ? options.title
              : route.name;
          const label =
            typeof rawLabel === 'string' || typeof rawLabel === 'number'
              ? String(rawLabel)
              : String(route.name);

          const isFocused = state.routes[state.index]?.key === route.key;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          if (route.name === 'Call' && !englivo) {
            return (
              <TouchableOpacity
                key={route.key}
                onPress={onPress}
                style={styles.callTabContainer}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={tokensV2.gradients.callButton}
                  style={styles.callGradient}
                >
                  <Svg width={28} height={28} viewBox="0 0 24 24">
                    <Path
                      d="M7.2 5.1c.3-.3.7-.4 1.1-.3l2.2.7c.4.1.7.4.8.8l.5 2a1.1 1.1 0 0 1-.3 1l-1.2 1.2a9.6 9.6 0 0 0 4.3 4.3l1.2-1.2c.3-.3.7-.4 1.1-.3l2 .5c.4.1.7.4.8.8l.7 2.2c.1.4 0 .8-.3 1.1-.9.9-2.2 1.4-3.5 1.4-2.4 0-4.8-1-7.1-3.3C7 14.7 6 12.3 6 9.9c0-1.3.5-2.6 1.4-3.5Z"
                      fill="#FFFFFF"
                    />
                  </Svg>
                </LinearGradient>
              </TouchableOpacity>
            );
          }

          let iconName = 'home-outline';
          if (route.name === 'Home') iconName = isFocused ? 'home' : 'home-outline';
          if (route.name === 'Sessions')
            iconName = isFocused ? 'calendar' : 'calendar-outline';
          if (!englivo && route.name === 'Feedback')
            iconName = isFocused ? 'chatbubbles' : 'chatbubbles-outline';
          if (!englivo && route.name === 'eBites')
            iconName = isFocused ? 'play-circle' : 'play-circle-outline';
          if (route.name === 'BookTutor')
            iconName = isFocused ? 'school' : 'school-outline';
          if (route.name === 'Progress')
            iconName = isFocused ? 'stats-chart' : 'stats-chart-outline';
          if (route.name === 'Profile')
            iconName = isFocused ? 'person' : 'person-outline';

          const activeColor = englivo ? ENGLIVO_ACTIVE : tokensV2.colors.primaryViolet;
          const mutedColor = englivo ? ENGLIVO_MUTED : tokensV2.colors.textMuted;

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={styles.tab}
              activeOpacity={0.7}
            >
              <TabIcon
                name={iconName}
                color={isFocused ? activeColor : mutedColor}
              />
              {isFocused && (
                <Text style={[styles.label, englivo && { color: ENGLIVO_ACTIVE }]}>
                  {label}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    marginBottom: 0,
    marginHorizontal: 0,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    height: 64,
    borderRadius: 24,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(30,17,40,0.92)',
    overflow: 'visible', // CRITICAL: to show floating button
    alignItems: 'center',
    justifyContent: 'space-between',
    width: width - 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: {
    color: tokensV2.colors.primaryViolet,
    fontSize: 10,
    fontWeight: '700',
  },
  callTabContainer: {
    marginTop: -40,
    zIndex: 10,
    marginBottom: 10, // Add spacing to prevent bottom cropping
  },
  callGradient: {
    width: 68, // Slightly larger
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: tokensV2.colors.primaryViolet,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 12,
  },
  pillEnglivo: {
    overflow: 'hidden',
    backgroundColor: 'rgba(8,12,20,0.96)',
    borderColor: 'rgba(232,160,32,0.18)',
    shadowColor: '#E8A020',
    shadowOpacity: 0.15,
  },
});

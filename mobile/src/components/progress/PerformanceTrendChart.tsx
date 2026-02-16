import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, Text as SvgText, Line } from 'react-native-svg';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { theme } from '../../theme/theme';

interface PerformanceTrendChartProps {
    data: number[]; // Array of last N scores (e.g. [65, 70, 68, 72...])
    labels?: string[]; // Optional labels
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_HEIGHT = 220;
const CHART_WIDTH = SCREEN_WIDTH - 60; // Padding inside card
const PADDING_TOP = 20;
const PADDING_BOTTOM = 30;

export const PerformanceTrendChart: React.FC<PerformanceTrendChartProps> = ({ data, labels }) => {
    // If no data, show placeholder
    const chartData = data.length > 0 ? data : [0, 0, 0, 0, 0];

    // Scale calculations
    const minScore = 0;
    const maxScore = 100;

    // Create path d string
    const { pathD, areaD, points } = useMemo(() => {
        if (chartData.length < 2) return { pathD: '', areaD: '', points: [] };

        const stepX = CHART_WIDTH / (chartData.length - 1);
        const points = chartData.map((score, index) => {
            const x = index * stepX;
            const y = CHART_HEIGHT - PADDING_BOTTOM - ((score / maxScore) * (CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM));
            return { x, y, score };
        });

        // Simple straight line path for now (could be bezier)
        let d = `M ${points[0].x} ${points[0].y}`;
        points.slice(1).forEach(p => {
            d += ` L ${p.x} ${p.y}`;
        });

        // Area path (close the loop down to bottom)
        const area = `${d} L ${points[points.length - 1].x} ${CHART_HEIGHT - PADDING_BOTTOM} L ${points[0].x} ${CHART_HEIGHT - PADDING_BOTTOM} Z`;

        return { pathD: d, areaD: area, points };
    }, [chartData]);

    const average = Math.round(chartData.reduce((a, b) => a + b, 0) / chartData.length);
    const trend = chartData.length > 1 ? chartData[chartData.length - 1] - chartData[0] : 0;
    const trendText = trend > 0 ? `+${trend}` : `${trend}`;
    const trendColor = trend >= 0 ? theme.colors.success : theme.colors.error;

    return (
        <Animated.View entering={FadeInDown.springify()} style={styles.container}>
            <View style={styles.glassContainer}>
                <BlurView intensity={30} tint="light" style={styles.blur} />
                <View style={styles.content}>
                    <View style={styles.headerRow}>
                        <View>
                            <Text style={styles.title}>Performance Trend</Text>
                            <Text style={styles.subtitle}>Last {chartData.length} sessions</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statValue}>{chartData[chartData.length - 1] || '-'}</Text>
                            <Text style={[styles.statTrend, { color: trendColor }]}>
                                {trendText} vs start
                            </Text>
                        </View>
                    </View>

                    <View style={styles.chartContainer}>
                        <Svg height={CHART_HEIGHT} width={CHART_WIDTH} style={{ overflow: 'visible' }}>
                            <Defs>
                                <LinearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                                    <Stop offset="0" stopColor={theme.colors.primary} stopOpacity="0.3" />
                                    <Stop offset="1" stopColor={theme.colors.primary} stopOpacity="0" />
                                </LinearGradient>
                            </Defs>

                            {/* Horizontal Grid Lines */}
                            {[0, 25, 50, 75, 100].map(val => {
                                const y = CHART_HEIGHT - PADDING_BOTTOM - ((val / 100) * (CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM));
                                return (
                                    <Line
                                        key={val}
                                        x1={0}
                                        y1={y}
                                        x2={CHART_WIDTH}
                                        y2={y}
                                        stroke="rgba(0,0,0,0.05)"
                                        strokeWidth="1"
                                    />
                                );
                            })}

                            {/* Area Fill */}
                            <Path d={areaD} fill="url(#trendGrad)" />

                            {/* Line Stroke */}
                            <Path d={pathD} stroke={theme.colors.primary} strokeWidth="3" strokeLinecap="round" />

                            {/* Data Points */}
                            {points.map((p, i) => (
                                <Circle
                                    key={i}
                                    cx={p.x}
                                    cy={p.y}
                                    r="4"
                                    fill="white"
                                    stroke={theme.colors.primary}
                                    strokeWidth="2"
                                />
                            ))}
                        </Svg>
                    </View>
                </View>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginHorizontal: theme.spacing.m,
        marginBottom: theme.spacing.l,
        borderRadius: 24,
        overflow: 'hidden',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 5,
    },
    glassContainer: {
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        position: 'relative',
    },
    blur: {
        ...StyleSheet.absoluteFillObject,
    },
    content: {
        padding: theme.spacing.l,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: theme.spacing.m,
    },
    title: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
    },
    subtitle: {
        fontSize: theme.typography.sizes.s,
        color: theme.colors.text.secondary,
        marginTop: 2,
    },
    statBox: {
        alignItems: 'flex-end',
    },
    statValue: {
        fontSize: theme.typography.sizes.xl,
        fontWeight: '900',
        color: theme.colors.primary,
    },
    statTrend: {
        fontSize: theme.typography.sizes.s,
        fontWeight: '600',
    },
    chartContainer: {
        marginTop: theme.spacing.s,
    }
});

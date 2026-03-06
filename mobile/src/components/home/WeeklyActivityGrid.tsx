import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useAppTheme } from "../../theme/useAppTheme";

interface Props {
  activity: number[]; // Array of 7 numbers (index 0 is 6 days ago, index 6 is today)
}

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WeeklyActivityGrid({ activity }: Props) {
  const theme = useAppTheme();

  // Create day labels based on today
  const todayDate = new Date();
  const todayDayIndex = todayDate.getDay();

  const days = activity.map((sessions, index) => {
    // index 6 is today. index 0 is 6 days ago.
    const daysAgo = 6 - index;
    let dayIndex = (todayDayIndex - daysAgo) % 7;
    if (dayIndex < 0) dayIndex += 7;

    const dayLabel = DAYS_OF_WEEK[dayIndex];
    let status: "done" | "missed" | "empty" = "empty";

    if (sessions > 0) {
      status = "done";
    } else {
      status = index === 6 ? "empty" : "missed"; // If today is 0, it's empty (still time), if past it's missed
    }

    return {
      day: dayLabel.charAt(0),
      status,
      sessions,
    };
  });

  const totalSessions = activity.reduce((a, b) => a + b, 0);
  const styles = getStyles(theme);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>This Week</Text>

      <View style={styles.grid}>
        {days.map((day, index) => (
          <View key={index} style={styles.dayColumn}>
            <View
              style={[
                styles.dayDot,
                day.status === "done" && styles.dayDone,
                day.status === "missed" && styles.dayMissed,
                day.status === "empty" && styles.dayEmpty,
              ]}
            >
              {day.status === "done" && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.dayLabel}>{day.day}</Text>
          </View>
        ))}
      </View>

      <View style={styles.stats}>
        <Text style={styles.statText}>{totalSessions} sessions</Text>
      </View>
    </View>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      padding: 16,
      marginBottom: 16,
      marginHorizontal: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...theme.shadows.medium,
    },
    title: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.colors.text.primary,
      marginBottom: 12,
    },
    grid: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    dayColumn: {
      alignItems: "center",
    },
    dayDot: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 4,
    },
    dayDone: {
      backgroundColor: theme.colors.success,
    },
    dayMissed: {
      backgroundColor: theme.colors.background,
      borderWidth: 2,
      borderColor: theme.colors.error,
    },
    dayEmpty: {
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    checkmark: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "700",
    },
    dayLabel: {
      fontSize: 11,
      color: theme.colors.text.secondary,
      fontWeight: "600",
    },
    stats: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
    },
    statText: {
      fontSize: 13,
      color: theme.colors.text.secondary,
      fontWeight: "600",
    },
  });

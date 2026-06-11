import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAppTheme } from "../../../theme/useAppTheme";

export type WordOfDayParams = {
  word?: string;
  definition?: string;
  example?: string;
  partOfSpeech?: string | null;
};

type WordOfDayRoute = RouteProp<{ WordOfDay: WordOfDayParams }, "WordOfDay">;

export default function WordOfDayScreen() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation = useNavigation();
  const route = useRoute<WordOfDayRoute>();
  const { word, definition, example, partOfSpeech } = route.params ?? {};

  const displayWord = word?.trim() || "Word of the day";
  const displayDef =
    definition?.trim() || "Open the home tab to see today's vocabulary pick.";
  const displayExample = example?.trim();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={theme.colors.text.primary}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Word of the day</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={theme.colors.gradients.primary as [string, string]}
          style={styles.hero}
        >
          {partOfSpeech ? (
            <Text style={styles.pos}>{partOfSpeech}</Text>
          ) : null}
          <Text style={styles.word}>{displayWord}</Text>
        </LinearGradient>

        <View style={styles.card}>
          <Text style={styles.label}>Definition</Text>
          <Text style={styles.body}>{displayDef}</Text>
        </View>

        {displayExample ? (
          <View style={styles.card}>
            <Text style={styles.label}>Example</Text>
            <Text style={styles.example}>"{displayExample}"</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.homeBtn}
          onPress={() =>
            (navigation as any).navigate("MainTabs", { screen: "Home" })
          }
        >
          <Text style={styles.homeBtnText}>Practice on Home</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function getStyles(theme: ReturnType<typeof useAppTheme>) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${theme.colors.primary}18`,
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      fontSize: 17,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    headerSpacer: { width: 40 },
    content: {
      padding: 20,
      gap: 16,
    },
    hero: {
      borderRadius: theme.borderRadius.xl,
      padding: 28,
      alignItems: "center",
    },
    pos: {
      color: "rgba(255,255,255,0.85)",
      fontSize: 13,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 8,
    },
    word: {
      color: "#fff",
      fontSize: 32,
      fontWeight: "800",
      textAlign: "center",
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.l,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    label: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.colors.text.light,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    body: {
      fontSize: 16,
      lineHeight: 24,
      color: theme.colors.text.primary,
    },
    example: {
      fontSize: 15,
      lineHeight: 22,
      fontStyle: "italic",
      color: theme.colors.text.secondary,
    },
    homeBtn: {
      marginTop: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: theme.colors.primary,
      paddingVertical: 14,
      borderRadius: theme.borderRadius.l,
    },
    homeBtnText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700",
    },
  });
}

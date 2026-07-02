import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAppTheme } from "../../../theme/useAppTheme";
import { useHomePracticeTts } from "../voice/useHomePracticeTts";
import { lookupWord, type WordLookupResult } from "../services/vocabularyApi";

export type WordOfDayParams = {
  word?: string;
  definition?: string;
  example?: string;
  partOfSpeech?: string | null;
  listenAudioUrl?: string;
};

type WordOfDayRoute = RouteProp<{ WordOfDay: WordOfDayParams }, "WordOfDay">;

function buildListenScript(
  word: string,
  definition: string,
  example?: string,
): string {
  const parts = [`Today's word is ${word}.`];
  if (definition) parts.push(`It means ${definition.replace(/\.$/, "")}.`);
  if (example) parts.push(`For example: ${example.replace(/\.$/, "")}.`);
  return parts.join(" ");
}

export default function WordOfDayScreen() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation = useNavigation();
  const route = useRoute<WordOfDayRoute>();
  const { word, definition, example, partOfSpeech, listenAudioUrl } =
    route.params ?? {};

  const displayWord = word?.trim() || "Word of the day";
  const displayDef =
    definition?.trim() || "Open the home tab to see today's vocabulary pick.";
  const displayExample = example?.trim();
  const listenScript = useMemo(
    () => buildListenScript(displayWord, displayDef, displayExample),
    [displayWord, displayDef, displayExample],
  );

  const { speak, playingKey, stop } = useHomePracticeTts();
  const listenKey = "word-of-day-screen:full";
  const listenPlaying = playingKey === listenKey;

  const [searchQuery, setSearchQuery] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<WordLookupResult | null>(
    null,
  );
  const lookupListenKey = "word-of-day-screen:lookup";
  const lookupPlaying = playingKey === lookupListenKey;

  const lookupListenScript = useMemo(() => {
    if (!lookupResult) return "";
    return buildListenScript(
      lookupResult.word,
      lookupResult.definition,
      lookupResult.example,
    );
  }, [lookupResult]);

  const handleLookup = useCallback(async () => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setLookupError("Enter at least 2 letters.");
      return;
    }
    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);
    try {
      const result = await lookupWord(q);
      setLookupResult(result);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Could not find that word. Try another spelling.";
      setLookupError(msg);
    } finally {
      setLookupLoading(false);
    }
  }, [searchQuery]);

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
        keyboardShouldPersistTaps="handled"
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

        <Pressable
          onPress={() => {
            if (listenPlaying) void stop();
            else void speak(listenKey, listenScript, { audioUrl: listenAudioUrl });
          }}
          style={({ pressed }) => [
            styles.listenBtn,
            {
              backgroundColor: listenPlaying
                ? `${theme.colors.primary}22`
                : `${theme.colors.primary}12`,
              borderColor: listenPlaying
                ? theme.colors.primary
                : theme.colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Listen to word pronunciation"
        >
          <Ionicons
            name={listenPlaying ? "stop-circle" : "volume-high"}
            size={18}
            color={theme.colors.primary}
          />
          <Text style={[styles.listenText, { color: theme.colors.primary }]}>
            {listenPlaying ? "Playing… tap to stop" : "Listen"}
          </Text>
        </Pressable>

        <View style={styles.lookupSection}>
          <Text style={styles.lookupTitle}>Look up a word</Text>
          <Text style={styles.lookupHint}>
            Don't know a word? Search for a simple definition and example.
          </Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="e.g. overwhelmed"
              placeholderTextColor={theme.colors.text.light}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => void handleLookup()}
            />
            <TouchableOpacity
              style={styles.searchBtn}
              onPress={() => void handleLookup()}
              disabled={lookupLoading}
            >
              {lookupLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="search" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
          {lookupError ? (
            <Text style={styles.lookupError}>{lookupError}</Text>
          ) : null}
          {lookupResult ? (
            <View style={styles.lookupCard}>
              <Text style={styles.lookupWord}>{lookupResult.word}</Text>
              {lookupResult.partOfSpeech ? (
                <Text style={styles.lookupPos}>{lookupResult.partOfSpeech}</Text>
              ) : null}
              <Text style={styles.body}>{lookupResult.definition}</Text>
              {lookupResult.example ? (
                <Text style={styles.example}>"{lookupResult.example}"</Text>
              ) : null}
              <Pressable
                onPress={() => {
                  if (lookupPlaying) void stop();
                  else void speak(lookupListenKey, lookupListenScript);
                }}
                style={({ pressed }) => [
                  styles.listenBtn,
                  {
                    marginTop: 12,
                    backgroundColor: lookupPlaying
                      ? `${theme.colors.primary}22`
                      : `${theme.colors.primary}12`,
                    borderColor: lookupPlaying
                      ? theme.colors.primary
                      : theme.colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Ionicons
                  name={lookupPlaying ? "stop-circle" : "volume-high"}
                  size={18}
                  color={theme.colors.primary}
                />
                <Text
                  style={[styles.listenText, { color: theme.colors.primary }]}
                >
                  {lookupPlaying ? "Playing…" : "Listen"}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

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
      marginTop: 8,
    },
    listenBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
    },
    listenText: {
      fontSize: 14,
      fontWeight: "700",
    },
    lookupSection: {
      marginTop: 8,
      gap: 10,
    },
    lookupTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    lookupHint: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.text.secondary,
    },
    searchRow: {
      flexDirection: "row",
      gap: 8,
    },
    searchInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.l,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.colors.text.primary,
      backgroundColor: theme.colors.surface,
    },
    searchBtn: {
      width: 48,
      height: 48,
      borderRadius: theme.borderRadius.l,
      backgroundColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    lookupError: {
      color: theme.colors.error ?? "#f87171",
      fontSize: 14,
    },
    lookupCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.l,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 6,
    },
    lookupWord: {
      fontSize: 22,
      fontWeight: "800",
      color: theme.colors.text.primary,
      textTransform: "capitalize",
    },
    lookupPos: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.colors.text.light,
      textTransform: "uppercase",
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

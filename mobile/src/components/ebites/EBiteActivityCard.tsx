import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp, Layout } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface Props {
  item: any;
  isActive: boolean;
  onComplete?: (isCorrect: boolean) => void;
}

export default function EBiteActivityCard({
  item,
  isActive,
  onComplete,
}: Props) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const isCorrect = selectedOption === item.correctAnswer;

  const handleOptionPress = (option: string) => {
    if (selectedOption !== null) return;

    setSelectedOption(option);
    const correct = option === item.correctAnswer;
    if (onComplete) {
      onComplete(correct);
    }
  };

  // Reset when inactive
  React.useEffect(() => {
    if (!isActive) setSelectedOption(null);
  }, [isActive]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#1e1b4b", "#312e81"]} // Deep indigo/violet theme
        style={styles.gradient}
      />

      <View style={[styles.content, { paddingBottom: insets.bottom + 70 }]}>
        <View style={styles.card}>
          <Text style={styles.activityType}>
            {item.activityType === "mcq"
              ? "Knowledge Check"
              : "Fill in the blank"}
          </Text>

          <Text style={styles.title}>{item.title}</Text>

          <View style={styles.optionsContainer}>
            {item.options?.map((option: string, index: number) => {
              const isSelected = selectedOption === option;
              const showCorrect =
                selectedOption !== null && option === item.correctAnswer;
              const showIncorrect = isSelected && !isCorrect;

              return (
                <TouchableOpacity
                  key={index}
                  activeOpacity={0.8}
                  style={[
                    styles.optionButton,
                    isSelected && styles.optionSelected,
                    showCorrect && styles.optionCorrect,
                    showIncorrect && styles.optionIncorrect,
                  ]}
                  onPress={() => handleOptionPress(option)}
                  disabled={selectedOption !== null}
                >
                  <View style={styles.optionContent}>
                    <Text
                      style={[
                        styles.optionText,
                        (showCorrect || showIncorrect) && { color: "white" },
                        isSelected &&
                          !showCorrect &&
                          !showIncorrect && { color: "#6366f1" },
                      ]}
                    >
                      {option}
                    </Text>

                    {showCorrect && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="white"
                      />
                    )}
                    {showIncorrect && (
                      <Ionicons name="close-circle" size={20} color="white" />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedOption && (
            <Animated.View
              entering={FadeInUp}
              layout={Layout}
              style={styles.feedbackContainer}
            >
              <Text
                style={[
                  styles.feedbackText,
                  { color: isCorrect ? "#4ade80" : "#f87171" },
                ]}
              >
                {isCorrect
                  ? "Awesome! 🎯"
                  : `Oops! Answer: ${item.correctAnswer}`}
              </Text>
              {item.explanation && (
                <Text style={styles.explanationText}>{item.explanation}</Text>
              )}
            </Animated.View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: "#0f172a",
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 80, // Tab bar clearance
  },
  card: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 24,
    padding: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  activityType: {
    color: "#6366f1",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 32,
    lineHeight: 32,
  },
  optionsContainer: {
    gap: 16,
  },
  optionButton: {
    width: "100%",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#e2e8f0",
    backgroundColor: "white",
  },
  optionSelected: {
    borderColor: "#6366f1",
    backgroundColor: "#e0e7ff",
  },
  optionCorrect: {
    borderColor: "#4ade80",
    backgroundColor: "#4ade80",
  },
  optionIncorrect: {
    borderColor: "#f87171",
    backgroundColor: "#f87171",
  },
  optionContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  optionText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#475569",
  },
  feedbackContainer: {
    marginTop: 24,
    alignItems: "center",
  },
  feedbackText: {
    fontSize: 18,
    fontWeight: "bold",
  },
  explanationText: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
});

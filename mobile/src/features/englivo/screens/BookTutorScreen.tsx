import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function BookTutorScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Book a Tutor</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#F59E0B",
  },
});

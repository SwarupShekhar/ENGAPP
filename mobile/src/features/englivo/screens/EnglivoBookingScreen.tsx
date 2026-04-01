import React, { useEffect, useState } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useAppTheme } from "../../../theme/useAppTheme";
import { bookTutorSlot, getAvailableSlots } from "../../../api/englivo/booking";
import { BookingSlot } from "../../../types/session";

export default function EnglivoBookingScreen() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation = useNavigation<any>();
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAvailableSlots().then((data) => {
      setSlots(data);
      setLoading(false);
    });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
      </TouchableOpacity>
      <Text style={styles.title}>Book a Session</Text>
      <ScrollView>
        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} />
        ) : (
          slots.map((slot) => (
            <TouchableOpacity
              key={slot.id}
              style={[styles.slotCard, selectedSlot?.id === slot.id && styles.slotCardSelected]}
              onPress={() => setSelectedSlot(slot)}
            >
              <Text style={styles.tutorName}>{slot.tutorName}</Text>
              <Text style={styles.slotTime}>{new Date(slot.startTime).toLocaleString()}</Text>
            </TouchableOpacity>
          ))
        )}
        {selectedSlot && (
          <TouchableOpacity
            style={styles.bookButton}
            onPress={async () => {
              await bookTutorSlot({ slotId: selectedSlot.id, startTime: selectedSlot.startTime });
              navigation.goBack();
            }}
          >
            <LinearGradient colors={theme.colors.gradients.primary as any} style={styles.bookGradient}>
              <Text style={styles.bookButtonText}>Confirm Booking</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    backButton: { padding: theme.spacing.m },
    title: { fontSize: theme.typography.sizes.xxl, fontWeight: "bold", color: theme.colors.text.primary, paddingHorizontal: theme.spacing.m, marginBottom: theme.spacing.m },
    slotCard: { marginHorizontal: theme.spacing.m, marginBottom: theme.spacing.s, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.l, padding: theme.spacing.m, borderWidth: 1, borderColor: theme.colors.border },
    slotCardSelected: { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}15` },
    tutorName: { fontSize: theme.typography.sizes.m, fontWeight: "bold", color: theme.colors.text.primary },
    slotTime: { fontSize: theme.typography.sizes.s, color: theme.colors.text.light, marginTop: 4 },
    bookButton: { marginHorizontal: theme.spacing.m, marginTop: theme.spacing.l, borderRadius: theme.borderRadius.m, overflow: "hidden" },
    bookGradient: { paddingVertical: theme.spacing.m, alignItems: "center" },
    bookButtonText: { fontSize: theme.typography.sizes.m, fontWeight: "bold", color: "#0F172A" },
  });

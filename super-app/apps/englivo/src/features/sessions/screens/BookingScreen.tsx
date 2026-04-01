import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useAppTheme } from "../../../theme/useAppTheme";
import { getAvailableSlots, bookTutorSlot } from "../../../api/booking";
import { BookingSlot } from "../../../types/session";

type BookingState =
  | "Loading"
  | "SelectSlot"
  | "Confirming"
  | "Success"
  | "NoCredits"
  | "Error";

export default function BookingScreen() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation = useNavigation<any>();

  const [state, setState] = useState<BookingState>("Loading");
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    loadSlots();
  }, []);

  const loadSlots = async () => {
    setState("Loading");
    try {
      const data = await getAvailableSlots();
      const safeSlots = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      setSlots(safeSlots);
      setState("SelectSlot");
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to load slots.");
      setState("Error");
    }
  };

  const handleBook = async () => {
    if (!selectedSlot) return;
    setState("Confirming");
    try {
      const result = await bookTutorSlot({
        slotId: selectedSlot.id,
        startTime: selectedSlot.startTime,
      });
      if (result.noCredits) {
        setState("NoCredits");
      } else if (result.success) {
        setState("Success");
      } else {
        setErrorMsg(result.message || "Booking failed.");
        setState("Error");
      }
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.message || e?.message || "Booking failed.");
      setState("Error");
    }
  };

  const renderContent = () => {
    switch (state) {
      case "Loading":
        return (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Finding available slots...</Text>
          </View>
        );

      case "SelectSlot":
        return (
          <>
            <Text style={styles.sectionLabel}>Available Slots</Text>
            {slots.length === 0 ? (
              <View style={styles.centered}>
                <Ionicons
                  name="calendar-outline"
                  size={48}
                  color={theme.colors.text.light}
                />
                <Text style={styles.emptyText}>No slots available right now.</Text>
                <Text style={styles.emptySubText}>Check back later.</Text>
              </View>
            ) : (
              slots.map((slot) => (
                <TouchableOpacity
                  key={slot.id}
                  style={[
                    styles.slotCard,
                    selectedSlot?.id === slot.id && styles.slotCardSelected,
                  ]}
                  onPress={() => setSelectedSlot(slot)}
                >
                  <View style={styles.slotRow}>
                    <View>
                      <Text style={styles.tutorName}>{slot.tutorName}</Text>
                      <Text style={styles.slotTime}>
                        {new Date(slot.startTime).toLocaleString()} ·{" "}
                        {slot.creditsRequired} credits
                      </Text>
                    </View>
                    {selectedSlot?.id === slot.id && (
                      <Ionicons
                        name="checkmark-circle"
                        size={24}
                        color={theme.colors.primary}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              ))
            )}

            {selectedSlot && (
              <TouchableOpacity
                style={styles.bookButton}
                onPress={handleBook}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={theme.colors.gradients.primary as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.bookGradient}
                >
                  <Text style={styles.bookButtonText}>Confirm Booking</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </>
        );

      case "Confirming":
        return (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Booking your session...</Text>
          </View>
        );

      case "Success":
        return (
          <View style={styles.resultContainer}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={72} color="#34D399" />
            </View>
            <Text style={styles.resultTitle}>Booking Confirmed!</Text>
            <Text style={styles.resultSub}>
              Your session with {selectedSlot?.tutorName} is booked.
            </Text>
            <TouchableOpacity
              style={styles.resultButton}
              onPress={() => navigation.navigate("Sessions")}
            >
              <Text style={styles.resultButtonText}>View Sessions</Text>
            </TouchableOpacity>
          </View>
        );

      case "NoCredits":
        return (
          <View style={styles.resultContainer}>
            <View style={styles.warningIcon}>
              <Ionicons name="wallet-outline" size={72} color="#FBBF24" />
            </View>
            <Text style={styles.resultTitle}>Insufficient Credits</Text>
            <Text style={styles.resultSub}>
              You don't have enough credits to book this session.
            </Text>
            <TouchableOpacity
              style={styles.resultButton}
              onPress={() => setState("SelectSlot")}
            >
              <Text style={styles.resultButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        );

      case "Error":
        return (
          <View style={styles.resultContainer}>
            <View style={styles.errorIcon}>
              <Ionicons name="alert-circle-outline" size={72} color="#F87171" />
            </View>
            <Text style={styles.resultTitle}>Something went wrong</Text>
            <Text style={styles.resultSub}>{errorMsg}</Text>
            <TouchableOpacity style={styles.resultButton} onPress={loadSlots}>
              <Text style={styles.resultButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
      </TouchableOpacity>
      <Text style={styles.title}>Book a Session</Text>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        {renderContent()}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    backButton: { padding: theme.spacing.m },
    title: {
      fontSize: theme.typography.sizes.xxl,
      fontWeight: "bold",
      color: theme.colors.text.primary,
      paddingHorizontal: theme.spacing.m,
      marginBottom: theme.spacing.m,
    },
    scroll: { flex: 1 },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: theme.spacing.xxl,
      gap: theme.spacing.m,
    },
    loadingText: {
      fontSize: theme.typography.sizes.m,
      color: theme.colors.text.light,
    },
    sectionLabel: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "600",
      color: theme.colors.text.secondary,
      paddingHorizontal: theme.spacing.m,
      marginBottom: theme.spacing.s,
    },
    slotCard: {
      marginHorizontal: theme.spacing.m,
      marginBottom: theme.spacing.s,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.l,
      padding: theme.spacing.m,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    slotCardSelected: {
      borderColor: theme.colors.primary,
      backgroundColor: `${theme.colors.primary}15`,
    },
    slotRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    tutorName: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "bold",
      color: theme.colors.text.primary,
    },
    slotTime: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.light,
      marginTop: 4,
    },
    bookButton: {
      marginHorizontal: theme.spacing.m,
      marginTop: theme.spacing.l,
      borderRadius: theme.borderRadius.m,
      overflow: "hidden",
      ...theme.shadows.primaryGlow,
    },
    bookGradient: {
      paddingVertical: theme.spacing.m,
      alignItems: "center",
    },
    bookButtonText: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "bold",
      color: "#0F172A",
    },
    resultContainer: {
      flex: 1,
      alignItems: "center",
      paddingTop: theme.spacing.xxl,
      paddingHorizontal: theme.spacing.xl,
    },
    successIcon: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: "#34D39920",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: theme.spacing.l,
    },
    warningIcon: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: "#FBBF2420",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: theme.spacing.l,
    },
    errorIcon: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: "#F8717120",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: theme.spacing.l,
    },
    resultTitle: {
      fontSize: theme.typography.sizes.xl,
      fontWeight: "bold",
      color: theme.colors.text.primary,
      textAlign: "center",
      marginBottom: theme.spacing.s,
    },
    resultSub: {
      fontSize: theme.typography.sizes.m,
      color: theme.colors.text.light,
      textAlign: "center",
      marginBottom: theme.spacing.xl,
    },
    resultButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: theme.spacing.xl,
      paddingVertical: theme.spacing.m,
      borderRadius: theme.borderRadius.m,
    },
    resultButtonText: {
      color: "#0F172A",
      fontWeight: "bold",
      fontSize: theme.typography.sizes.m,
    },
    emptyText: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "600",
      color: theme.colors.text.secondary,
      marginTop: theme.spacing.m,
    },
    emptySubText: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.light,
    },
  });

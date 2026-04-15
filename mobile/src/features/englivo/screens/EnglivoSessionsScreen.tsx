import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";

import { client } from "../../../api/englivoClient";
import { getEnglivoMe } from "../../../api/englivoApi";
import { ENGLIVO_AI_TUTOR_TITLE } from "../constants";

// ─── Design Tokens ─────────────────────────────────────────────────────────────
const C = {
  void: "#080C14",
  card: "#111827",
  cardBorder: "#1E2D45",
  goldBright: "#F5C842",
  goldMid: "#E8A020",
  goldDeep: "#B8730A",
  goldFaint: "#F5C84210",
  ash: "#8B9AB0",
  ashDark: "#3D4F65",
  white: "#F4F6FA",
  green: "#34D399",
  blue: "#60A5FA",
  red: "#F87171",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface UpcomingSession {
  id: string;
  tutorName: string;
  date: string;
  time: string;
  topic: string;
  status: string;
}

interface PastSession {
  id: string;
  date: string;
  durationMinutes: number;
  topic: string;
  cefrBadge?: string;
}

interface Slot {
  id: string;
  tutorId?: string;
  date: string;
  time: string;
  tutorName: string;
  durationMinutes: number;
  creditsRequired: number;
}

type WizardStep = 1 | 2 | 3;

const TOPICS = [
  "General conversation",
  "Job interview prep",
  "IELTS / TOEFL practice",
  "Business English",
  "Pronunciation",
  "Grammar deep dive",
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EnglivoSessionsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // If navigated here with a joinToken (from Home screen's "Join" button),
  // jump straight to the live call screen without showing the sessions list.
  useEffect(() => {
    const { joinToken, roomName, tutorName, serverUrl, freeMinutesRemaining } =
      route.params ?? {};
    if (joinToken && roomName) {
      navigation.navigate("EnglivoLiveCall", {
        token: joinToken,
        roomName,
        tutorName,
        serverUrl,
        freeMinutesRemaining,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browse state
  const [upcoming, setUpcoming] = useState<UpcomingSession[]>([]);
  const [past, setPast] = useState<PastSession[]>([]);
  const [loadingUpcoming, setLoadingUpcoming] = useState(true);
  const [loadingPast, setLoadingPast] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Wizard state
  const [wizardActive, setWizardActive] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [userCredits, setUserCredits] = useState<number | null>(null);
  const [booking, setBooking] = useState(false);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const showToast = (msg: string) => {
    setToast(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setToast(null));
  };

  // ─── Data loaders ─────────────────────────────────────────────────────────

  const loadUpcoming = async () => {
    try {
      const r = await client.get<UpcomingSession[]>("/api/sessions/upcoming");
      setUpcoming(Array.isArray(r.data) ? r.data : []);
    } catch {
      setUpcoming([]);
    } finally {
      setLoadingUpcoming(false);
    }
  };

  const loadPast = async () => {
    try {
      const r = await client.get<PastSession[]>("/api/sessions?status=completed");
      setPast(Array.isArray(r.data) ? r.data : []);
    } catch {
      setPast([]);
    } finally {
      setLoadingPast(false);
    }
  };

  const loadAll = useCallback(async () => {
    setLoadingUpcoming(true);
    setLoadingPast(true);
    await Promise.all([loadUpcoming(), loadPast()]);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  // ─── Wizard helpers ────────────────────────────────────────────────────────

  const openWizard = () => {
    setSelectedTopic(null);
    setSelectedSlot(null);
    setSelectedDate(null);
    setSlots([]);
    setSlotsError(false);
    setWizardStep(1);
    setWizardActive(true);
  };

  const closeWizard = () => {
    setWizardActive(false);
  };

  const fetchSlots = async (topic: string) => {
    setLoadingSlots(true);
    setSlotsError(false);
    setSlots([]);
    setSelectedDate(null);
    setSelectedSlot(null);
    try {
      const r = await client.get<Slot[]>(`/api/sessions/slots?topic=${encodeURIComponent(topic)}`);
      const data = Array.isArray(r.data) ? r.data : [];
      setSlots(data);
      if (data.length > 0) setSelectedDate(data[0].date);
    } catch (e: any) {
      setSlotsError(true);
    } finally {
      setLoadingSlots(false);
    }
  };

  const goStep2 = () => {
    if (!selectedTopic) return;
    setWizardStep(2);
    fetchSlots(selectedTopic);
  };

  const goStep3 = async () => {
    if (!selectedSlot) return;
    setWizardStep(3);
    try {
      const me = await getEnglivoMe();
      setUserCredits(me?.credits ?? me?.creditBalance ?? null);
    } catch {
      setUserCredits(null);
    }
  };

  const confirmBooking = async () => {
    if (!selectedSlot || !selectedTopic) return;
    setBooking(true);
    try {
      await client.post("/api/sessions/book", {
        topicId: selectedTopic,
        slotId: selectedSlot.id,
        tutorId: selectedSlot.tutorId ?? selectedSlot.id,
      });
      closeWizard();
      showToast("Session booked! Check your upcoming sessions.");
      setLoadingUpcoming(true);
      loadUpcoming();
    } catch {
      showToast("Booking failed. Please try again.");
    } finally {
      setBooking(false);
    }
  };

  // ─── Derived slot data ─────────────────────────────────────────────────────

  const uniqueDates = Array.from(new Set(slots.map((s) => s.date)));
  const slotsForDate = slots.filter((s) => s.date === selectedDate);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const formatDateLong = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const s = makeStyles();
  const AMBER = C.goldMid;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          !wizardActive ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadAll(); }}
              tintColor={AMBER}
            />
          ) : undefined
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <View style={s.header}>
          {wizardActive && (
            <TouchableOpacity onPress={closeWizard} style={s.backBtn}>
              <Ionicons name="arrow-back" size={22} color={AMBER} />
            </TouchableOpacity>
          )}
          <View>
            <Text style={s.title}>Sessions</Text>
            {!wizardActive && (
              <Text style={s.subtitle}>
                Practice with {ENGLIVO_AI_TUTOR_TITLE} or book a human tutor
              </Text>
            )}
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            MODE A — BROWSE
        ══════════════════════════════════════════════════════════════════ */}
        {!wizardActive && (
          <>
            {/* AI Tutor Card */}
            <TouchableOpacity
              style={s.aiCard}
              activeOpacity={0.85}
              onPress={() => navigation.navigate("EnglivoAiConversation")}
            >
              <LinearGradient
                colors={[AMBER, "#D97706"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.aiCardGradient}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.aiCardTitle}>
                    Practice with {ENGLIVO_AI_TUTOR_TITLE}
                  </Text>
                  <Text style={s.aiCardSub}>Instant. Speak freely. Get feedback.</Text>
                </View>
                <View style={s.aiCardIcon}>
                  <Ionicons name="mic" size={32} color="#78350F" />
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* Human Tutor Card */}
            <TouchableOpacity
              style={s.humanCard}
              activeOpacity={0.85}
              onPress={openWizard}
            >
              <View style={s.humanCardInner}>
                <View style={s.humanCardIconWrap}>
                  <Ionicons name="person" size={26} color={AMBER} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.humanCardTitle}>Book a Human Tutor</Text>
                  <Text style={s.humanCardSub}>Schedule a live session with a certified tutor</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.ash} />
              </View>
            </TouchableOpacity>

            {/* Upcoming Sessions */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Upcoming</Text>
              {loadingUpcoming ? (
                <ActivityIndicator color={AMBER} style={{ marginTop: 12 }} />
              ) : upcoming.length === 0 ? (
                <View style={s.emptyBox}>
                  <Text style={s.emptyText}>No upcoming sessions. Book one above.</Text>
                </View>
              ) : (
                upcoming.map((item) => (
                  <View key={item.id} style={s.sessionCard}>
                    <LinearGradient colors={[C.goldBright, C.goldDeep]} style={{ width: 3, alignSelf: "stretch" }} />
                    <View style={{ flex: 1, padding: 14 }}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: C.goldMid, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>Human Tutor</Text>
                      <Text style={s.sessionPrimary}>{item.tutorName}</Text>
                      <Text style={s.sessionMeta}>{formatDateLong(item.date)} · {item.time}</Text>
                      <Text style={s.sessionMeta}>{item.topic}</Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: item.status === "confirmed" ? "rgba(52,211,153,0.1)" : "rgba(96,165,250,0.1)", marginRight: 14 }]}>
                      <Text style={[s.badgeText, { color: item.status === "confirmed" ? C.green : C.blue }]}>
                        {item.status}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Past Sessions */}
            <View style={s.section}>
              <View style={s.sectionRow}>
                <Text style={s.sectionTitle}>Past sessions</Text>
                {past.length > 5 && (
                  <TouchableOpacity>
                    <Text style={s.viewAll}>View all</Text>
                  </TouchableOpacity>
                )}
              </View>
              {loadingPast ? (
                <ActivityIndicator color={AMBER} style={{ marginTop: 12 }} />
              ) : past.length === 0 ? (
                <View style={s.emptyBox}>
                  <Text style={s.emptyText}>No past sessions yet.</Text>
                </View>
              ) : (
                past.slice(0, 5).map((item) => (
                  <View key={item.id} style={s.sessionCard}>
                    <View style={{ width: 3, alignSelf: "stretch", backgroundColor: C.ashDark }} />
                    <View style={{ flex: 1, padding: 14 }}>
                      <Text style={s.sessionPrimary}>{item.topic}</Text>
                      <Text style={s.sessionMeta}>{formatDateLong(item.date)} · {item.durationMinutes} min</Text>
                    </View>
                    {item.cefrBadge && (
                      <View style={[s.cefrBadge, { marginRight: 14 }]}>
                        <Text style={s.cefrBadgeText}>{item.cefrBadge}</Text>
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            MODE B — WIZARD
        ══════════════════════════════════════════════════════════════════ */}
        {wizardActive && (
          <View style={s.wizardWrap}>
            {/* Step dots */}
            <View style={s.stepDots}>
              {([1, 2, 3] as WizardStep[]).map((n) => (
                <View
                  key={n}
                  style={[s.dot, wizardStep === n ? s.dotActive : wizardStep > n ? s.dotDone : s.dotInactive]}
                />
              ))}
            </View>

            {/* ── STEP 1 ─ Pick topic ─────────────────────────────────── */}
            {wizardStep === 1 && (
              <>
                <Text style={s.wizardTitle}>What do you want to work on?</Text>
                <View style={s.topicGrid}>
                  {TOPICS.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[s.topicPill, selectedTopic === t && s.topicPillActive]}
                      onPress={() => setSelectedTopic(t)}
                    >
                      <Text style={[s.topicPillText, selectedTopic === t && s.topicPillTextActive]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={[s.ctaBtn, !selectedTopic && s.ctaBtnDisabled]}
                  disabled={!selectedTopic}
                  onPress={goStep2}
                >
                  <Text style={s.ctaBtnText}>Continue</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── STEP 2 ─ Pick date & slot ───────────────────────────── */}
            {wizardStep === 2 && (
              <>
                <Text style={s.wizardTitle}>Pick a time</Text>
                {loadingSlots && (
                  <View style={s.skeletonWrap}>
                    {[0, 1, 2].map((i) => (
                      <View key={i} style={s.skeleton} />
                    ))}
                  </View>
                )}
                {!loadingSlots && slotsError && (
                  <View style={s.errorBox}>
                    <Text style={s.errorText}>Slots unavailable right now. Try again later.</Text>
                    <TouchableOpacity style={s.retryBtn} onPress={() => fetchSlots(selectedTopic!)}>
                      <Text style={s.retryBtnText}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {!loadingSlots && !slotsError && slots.length === 0 && (
                  <View style={s.emptyBox}>
                    <Text style={s.emptyText}>No slots available for this topic right now.</Text>
                  </View>
                )}
                {!loadingSlots && !slotsError && slots.length > 0 && (
                  <>
                    {/* Date pills */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.datePillsScroll}>
                      {uniqueDates.map((d) => (
                        <TouchableOpacity
                          key={d}
                          style={[s.datePill, selectedDate === d && s.datePillActive]}
                          onPress={() => { setSelectedDate(d); setSelectedSlot(null); }}
                        >
                          <Text style={[s.datePillText, selectedDate === d && s.datePillTextActive]}>
                            {formatDate(d)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    {/* Slot cards */}
                    {slotsForDate.map((slot) => (
                      <TouchableOpacity
                        key={slot.id}
                        style={[s.slotCard, selectedSlot?.id === slot.id && s.slotCardActive]}
                        onPress={() => setSelectedSlot(slot)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={s.slotTime}>{slot.time}</Text>
                          <Text style={s.slotMeta}>{slot.tutorName} · {slot.durationMinutes} min</Text>
                        </View>
                        {selectedSlot?.id === slot.id && (
                          <Ionicons name="checkmark-circle" size={22} color={AMBER} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </>
                )}
                <TouchableOpacity
                  style={[s.ctaBtn, !selectedSlot && s.ctaBtnDisabled]}
                  disabled={!selectedSlot}
                  onPress={goStep3}
                >
                  <Text style={s.ctaBtnText}>Continue</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── STEP 3 ─ Confirm ────────────────────────────────────── */}
            {wizardStep === 3 && selectedSlot && (
              <>
                <Text style={s.wizardTitle}>Confirm your session</Text>
                <View style={s.confirmCard}>
                  <ConfirmRow label="Topic" value={selectedTopic ?? ""} />
                  <ConfirmRow label="Tutor" value={selectedSlot.tutorName} />
                  <ConfirmRow label="Date" value={formatDateLong(selectedSlot.date)} />
                  <ConfirmRow label="Time" value={selectedSlot.time} />
                  <ConfirmRow label="Duration" value={`${selectedSlot.durationMinutes} min`} />
                  <ConfirmRow label="Credits" value={`${selectedSlot.creditsRequired} credits`} last />
                </View>
                {userCredits !== null && selectedSlot.creditsRequired > userCredits && (
                  <View style={s.warningBox}>
                    <Ionicons name="warning-outline" size={18} color="#FBBF24" />
                    <Text style={s.warningText}>
                      Insufficient credits. You have {userCredits}, need {selectedSlot.creditsRequired}.
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[
                    s.ctaBtn,
                    (booking || (userCredits !== null && selectedSlot.creditsRequired > userCredits)) && s.ctaBtnDisabled,
                  ]}
                  disabled={booking || (userCredits !== null && selectedSlot.creditsRequired > userCredits)}
                  onPress={confirmBooking}
                >
                  {booking ? (
                    <ActivityIndicator color="#0F172A" size="small" />
                  ) : (
                    <Text style={s.ctaBtnText}>Confirm Booking</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Toast */}
      {toast && (
        <Animated.View style={[s.toast, { opacity: toastOpacity }]}>
          <Text style={s.toastText}>{toast}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ─── Small helper ─────────────────────────────────────────────────────────────

function ConfirmRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{ paddingVertical: 12, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: C.cardBorder, flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: C.ash, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: C.white, fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right", marginLeft: 12 }}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.void },

  // Header
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 16, marginBottom: 20, gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 26, fontWeight: Platform.OS === "ios" ? "800" : "900", color: C.white, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: C.ash, marginTop: 2 },

  // AI card
  aiCard: { marginHorizontal: 20, borderRadius: 16, overflow: "hidden", marginBottom: 14 },
  aiCardGradient: { flexDirection: "row", alignItems: "center", padding: 22, minHeight: 110 },
  aiCardTitle: { fontSize: 20, fontWeight: "700", color: C.void },
  aiCardSub: { fontSize: 13, color: C.void, opacity: 0.6, marginTop: 4 },
  aiCardIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(0,0,0,0.15)", justifyContent: "center", alignItems: "center" },

  // Human tutor card
  humanCard: { marginHorizontal: 20, borderRadius: 16, borderWidth: 0.5, borderColor: C.cardBorder, backgroundColor: C.card, marginBottom: 28 },
  humanCardInner: { flexDirection: "row", alignItems: "center", padding: 18, gap: 14 },
  humanCardIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.goldFaint, borderWidth: 0.5, borderColor: `${C.goldMid}50`, justifyContent: "center", alignItems: "center" },
  humanCardTitle: { fontSize: 16, fontWeight: "600", color: C.white },
  humanCardSub: { fontSize: 12, color: C.ash, marginTop: 2 },

  // Section
  section: { marginHorizontal: 20, marginBottom: 24 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: C.ash, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 },
  viewAll: { fontSize: 12, color: C.goldMid, fontWeight: "700" },

  // Session card — ticket style with left strip
  sessionCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 12, marginBottom: 8, borderWidth: 0.5, borderColor: C.cardBorder, overflow: "hidden" },
  sessionPrimary: { fontSize: 15, fontWeight: "600", color: C.white },
  sessionMeta: { fontSize: 12, color: C.ash, marginTop: 2 },

  // Badges
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  cefrBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: C.goldFaint, borderWidth: 0.5, borderColor: `${C.goldMid}60` },
  cefrBadgeText: { fontSize: 12, fontWeight: "700", color: C.goldBright },

  // Empty / Error
  emptyBox: { backgroundColor: C.card, borderRadius: 12, padding: 20, alignItems: "center", borderWidth: 0.5, borderColor: C.cardBorder },
  emptyText: { color: C.ash, fontSize: 14, textAlign: "center" },
  errorBox: { backgroundColor: C.card, borderRadius: 12, padding: 20, alignItems: "center", borderWidth: 0.5, borderColor: `${C.red}60`, marginBottom: 16 },
  errorText: { color: C.red, fontSize: 14, textAlign: "center", marginBottom: 12 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: C.goldMid, borderRadius: 8 },
  retryBtnText: { color: C.void, fontWeight: "700", fontSize: 14 },

  // Wizard
  wizardWrap: { paddingHorizontal: 20 },
  wizardTitle: { fontSize: 22, fontWeight: Platform.OS === "ios" ? "800" : "900", color: C.white, letterSpacing: -0.3, marginBottom: 24 },
  stepDots: { flexDirection: "row", gap: 8, marginBottom: 28 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { backgroundColor: C.goldMid, width: 24 },
  dotDone: { backgroundColor: C.goldDeep },
  dotInactive: { backgroundColor: C.ashDark },

  // Topics
  topicGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 28 },
  topicPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 0.5, borderColor: C.cardBorder, backgroundColor: C.card },
  topicPillActive: { borderColor: C.goldMid, backgroundColor: C.goldFaint },
  topicPillText: { fontSize: 14, color: C.ash },
  topicPillTextActive: { color: C.goldBright, fontWeight: "600" },

  // Date pills
  datePillsScroll: { marginBottom: 16 },
  datePill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 0.5, borderColor: C.cardBorder, backgroundColor: C.card, marginRight: 8 },
  datePillActive: { borderColor: C.goldMid, backgroundColor: C.goldFaint },
  datePillText: { fontSize: 13, color: C.ash },
  datePillTextActive: { color: C.goldBright, fontWeight: "600" },

  // Slot cards
  slotCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 0.5, borderColor: C.cardBorder },
  slotCardActive: { borderColor: C.goldMid, backgroundColor: C.goldFaint },
  slotTime: { fontSize: 16, fontWeight: "600", color: C.white },
  slotMeta: { fontSize: 12, color: C.ash, marginTop: 2 },

  // Skeleton
  skeletonWrap: { gap: 10, marginBottom: 16 },
  skeleton: { height: 64, borderRadius: 12, backgroundColor: C.card },

  // Confirm card
  confirmCard: { backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 18, marginBottom: 20, borderWidth: 0.5, borderColor: C.cardBorder },

  // Warning
  warningBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(245,200,66,0.08)", borderRadius: 10, padding: 14, marginBottom: 16, borderWidth: 0.5, borderColor: `${C.goldBright}60` },
  warningText: { fontSize: 13, color: C.goldBright, flex: 1 },

  // CTA
  ctaBtn: { backgroundColor: C.goldMid, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  ctaBtnDisabled: { opacity: 0.4 },
  ctaBtnText: { color: C.void, fontSize: 16, fontWeight: "700" },

  // Toast
  toast: { position: "absolute", bottom: 32, left: 20, right: 20, backgroundColor: C.card, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, borderWidth: 0.5, borderColor: `${C.goldMid}60`, alignItems: "center" },
  toastText: { color: C.white, fontSize: 14, fontWeight: "500" },
});

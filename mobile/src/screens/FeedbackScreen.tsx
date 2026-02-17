/**
 * FEEDBACK SCREEN — Full Redesign
 *
 * Features:
 * 1. Call history with real avatars, scores, duration
 * 2. Tap any call → Bottom sheet with full detailed feedback
 * 3. Connection/Friend request button on each call partner
 * 4. Filter by All / This Week / This Month
 * 5. Stats bar at top (total sessions, time, best score)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@clerk/clerk-expo';
import {
  View, Text, ScrollView, StyleSheet, Dimensions,
  TouchableOpacity, Animated, Modal, RefreshControl,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import Svg, {
  Circle, Text as SvgText,
} from 'react-native-svg';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { sessionsApi, ConversationSession } from '../api/sessions';
import { connectionsApi } from '../api/connections';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
interface CallSession {
  id: string;
  type: 'p2p' | 'ai_tutor' | 'assessment';
  topic: string;
  partnerName: string;
  partnerAvatar?: string;
  partnerLevel: string;
  partnerId?: string;
  connectionStatus: 'none' | 'pending_sent' | 'pending_received' | 'connected';
  duration: number;
  date: string;
  overallScore: number;
  scores: {
    grammar: number;
    vocabulary: number;
    fluency: number;
    pronunciation: number;
  };
  feedback: SessionFeedback;
}

interface SessionFeedback {
  aiSummary: string;
  strengths: string[];
  improvements: string[];
  mistakes: Mistake[];
  accentNotes?: string;
  wordLevelData?: WordScore[];
  grammarErrors?: GrammarError[];
  vocabularyAnalysis?: VocabAnalysis;
}

interface Mistake {
  id: string;
  category: string;
  wrong: string;
  right: string;
  explanation: string;
  timestamp?: string;
}

interface WordScore {
  word: string;
  accuracy: number;
  errorType: string;
}

interface GrammarError {
  text: string;
  correction: string;
  errorType: string;
  severity: 'major' | 'minor';
}

interface VocabAnalysis {
  score: number;
  uniqueWords: number;
  totalWords: number;
  advancedWords: string[];
  repetitions: Record<string, number>;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const formatDuration = (seconds: number): string => {
  if (!seconds || seconds === 0) return '0 min';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins} min`;
  return `${mins}m ${secs}s`;
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const getScoreColor = (score: number): string => {
  if (score === 0) return '#9ca3af';
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
};

const getInitials = (name: string): string => {
  if (name.includes('AI Tutor')) return '🤖';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
};

const getTypeConfig = (type: string) => ({
  p2p: { icon: '👥', label: 'Peer Call', color: '#8b5cf6' },
  ai_tutor: { icon: '🤖', label: 'AI Tutor', color: '#3b82f6' },
  assessment: { icon: '📋', label: 'Assessment', color: '#f59e0b' },
}[type] || { icon: '📞', label: 'Call', color: '#6b7280' });

// ── Helper: detect bot users by name ──────
function isBot(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes('bot') || lower.includes('ai tutor') || lower === 'engr';
}

// ── Map real API data to the UI shape ──────
function mapSessionToCallSession(
  session: ConversationSession,
  currentUser?: { clerkId?: string; fullName?: string } | null,
): CallSession {
  const analysis = session.analyses?.[0];
  const scores = analysis?.scores || { grammar: 0, vocabulary: 0, fluency: 0, pronunciation: 0, overall: 0 };
  const rawData = analysis?.rawData;

  // Build mistake list from real analysis
  const mistakes: Mistake[] = (analysis?.mistakes || []).map((m, i) => ({
    id: m.id || `m${i}`,
    category: m.type || 'Grammar',
    wrong: m.original || '',
    right: m.corrected || '',
    explanation: m.explanation || '',
    timestamp: undefined,
  }));

  // Word-level data from pronunciation issues
  const wordLevelData: WordScore[] = (analysis?.pronunciationIssues || []).map(p => ({
    word: p.word,
    accuracy: p.severity === 'high' ? 50 : p.severity === 'medium' ? 70 : 90,
    errorType: p.issueType || (p.severity === 'high' ? 'Mispronunciation' : 'None'),
  }));

  // ── Find the REAL partner (not self, not bot) ──────
  let realPartner: typeof session.participants[0] | undefined;

  if (session.participants && currentUser) {
    for (const p of session.participants) {
      if (!p.user) continue;
      const name = `${p.user.fname || ''} ${p.user.lname || ''}`.trim();

      // Skip bots
      if (isBot(name)) continue;

      // Skip self — check clerkId first, fall back to name
      if (p.user.clerkId && currentUser.clerkId) {
        if (p.user.clerkId === currentUser.clerkId) continue;
      } else if (currentUser.fullName && name === currentUser.fullName.trim()) {
        continue;
      }

      // This is a real, different human
      realPartner = p;
      break;
    }
  }

  // Determine session type
  const hasRealPartner = !!realPartner;
  const type = hasRealPartner ? 'p2p' : 'ai_tutor';

  const partnerName = hasRealPartner
    ? `${realPartner!.user!.fname || ''} ${realPartner!.user!.lname || ''}`.trim() || 'Partner'
    : 'AI Tutor';

  // Only set partnerId for real human partners — this controls Connect button
  const partnerId = hasRealPartner ? realPartner!.userId : undefined;

  return {
    id: session.id,
    type,
    topic: session.topic || 'General Conversation',
    partnerName,
    partnerLevel: analysis?.cefrLevel || 'B1',
    partnerId,
    connectionStatus: 'none',
    duration: session.duration || 0,
    date: session.startedAt,
    overallScore: scores.overall || 0,
    scores: {
      grammar: scores.grammar || 0,
      vocabulary: scores.vocabulary || 0,
      fluency: scores.fluency || 0,
      pronunciation: scores.pronunciation || 0,
    },
    feedback: {
      aiSummary: rawData?.aiFeedback || 'Session feedback is being generated...',
      strengths: rawData?.strengths || [],
      improvements: rawData?.improvementAreas || [],
      mistakes,
      accentNotes: rawData?.accentNotes || rawData?.pronunciationTip || undefined,
      wordLevelData: wordLevelData.length > 0 ? wordLevelData : undefined,
    },
  };
}

// ─────────────────────────────────────────────
// SCORE MINI RING (SVG)
// ─────────────────────────────────────────────
function MiniScoreRing({ score, size = 44, label }: { score: number; size?: number; label: string }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = getScoreColor(score);

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#f3f4f6" strokeWidth={5} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={5} fill="none"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <SvgText x={size / 2} y={size / 2 + 4} textAnchor="middle"
          fill={score === 0 ? '#9ca3af' : '#1f2937'} fontSize="11" fontWeight="700">
          {score === 0 ? '-' : String(score)}
        </SvgText>
      </Svg>
      <Text style={styles.miniRingLabel}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// CONNECTION BUTTON
// ─────────────────────────────────────────────
function ConnectionButton({ status, onPress }: { status: string; onPress: () => void }) {
  const configs: Record<string, { label: string; bg: string; textColor: string; border: string }> = {
    none: { label: '+ Connect', bg: '#ede9fe', textColor: '#7c3aed', border: '#c4b5fd' },
    pending_sent: { label: '⏳ Pending', bg: '#fef3c7', textColor: '#d97706', border: '#fcd34d' },
    pending_received: { label: '✓ Accept', bg: '#dcfce7', textColor: '#16a34a', border: '#86efac' },
    connected: { label: '💬 Message', bg: '#dbeafe', textColor: '#2563eb', border: '#93c5fd' },
  };
  const cfg = configs[status] || configs.none;

  return (
    <TouchableOpacity
      style={[styles.connectBtn, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
      onPress={onPress}
    >
      <Text style={[styles.connectBtnText, { color: cfg.textColor }]}>{cfg.label}</Text>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
// CALL SESSION CARD
// ─────────────────────────────────────────────
function SessionCard({ session, onPress, onConnectionPress }: {
  session: CallSession;
  onPress: () => void;
  onConnectionPress: (s: CallSession) => void;
}) {
  const typeConfig = getTypeConfig(session.type);
  const isAI = session.type === 'ai_tutor';
  const hasData = session.overallScore > 0;

  const avatarColors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
  const avatarColor = avatarColors[session.partnerName.charCodeAt(0) % avatarColors.length];

  return (
    <TouchableOpacity style={styles.sessionCard} onPress={onPress} activeOpacity={0.92}>
      {/* Left: Avatar */}
      <View style={[styles.avatar, { backgroundColor: avatarColor + '20', borderColor: avatarColor + '40' }]}>
        {session.partnerAvatar ? (
          <Image source={{ uri: session.partnerAvatar }} style={styles.avatarImage} />
        ) : (
          <Text style={[styles.avatarText, { color: avatarColor }]}>
            {getInitials(session.partnerName)}
          </Text>
        )}
        <View style={[styles.typeBadge, { backgroundColor: typeConfig.color }]}>
          <Text style={styles.typeBadgeIcon}>{typeConfig.icon}</Text>
        </View>
      </View>

      {/* Middle: Info */}
      <View style={styles.sessionInfo}>
        <Text style={styles.sessionTopic} numberOfLines={1}>
          {session.type === 'p2p' ? session.partnerName : session.topic}
        </Text>
        <Text style={styles.sessionPartner}>
          {session.type === 'p2p' ? session.topic : session.partnerName}
        </Text>
        <View style={styles.sessionMeta}>
          <Text style={styles.sessionMetaText}>
            {formatDuration(session.duration)} · {formatDate(session.date)}
          </Text>
          {session.partnerLevel && (
            <View style={[styles.levelChip, { backgroundColor: typeConfig.color + '15' }]}>
              <Text style={[styles.levelChipText, { color: typeConfig.color }]}>
                {session.partnerLevel}
              </Text>
            </View>
          )}
        </View>

        {/* Connection button — only for P2P */}
        {!isAI && session.partnerId && (
          <ConnectionButton
            status={session.connectionStatus}
            onPress={() => onConnectionPress(session)}
          />
        )}
      </View>

      {/* Right: Score */}
      <View style={styles.sessionScore}>
        {hasData ? (
          <>
            <View style={[styles.overallScoreBadge, {
              borderColor: getScoreColor(session.overallScore) + '40',
              backgroundColor: getScoreColor(session.overallScore) + '10',
            }]}>
              <Text style={[styles.overallScoreText, { color: getScoreColor(session.overallScore) }]}>
                {session.overallScore}
              </Text>
            </View>
            <Text style={styles.levelLabel}>{session.partnerLevel}</Text>
          </>
        ) : (
          <View style={styles.noScoreBadge}>
            <Text style={styles.noScoreText}>–</Text>
            <Text style={styles.noScoreLabel}>No data</Text>
          </View>
        )}
        <Text style={styles.viewDetail}>View →</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
// DETAILED FEEDBACK BOTTOM SHEET
// ─────────────────────────────────────────────
function FeedbackBottomSheet({ session, visible, onClose }: {
  session: CallSession | null; visible: boolean; onClose: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const [activeTab, setActiveTab] = useState<'overview' | 'mistakes' | 'words' | 'vocab'>('overview');

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  if (!session) return null;

  const hasData = session.overallScore > 0;
  const typeConfig = getTypeConfig(session.type);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

      <Animated.View
        style={[styles.bottomSheet, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* Handle bar */}
        <View style={styles.sheetHandle} />

        {/* Sheet Header */}
        <View style={styles.sheetHeader}>
          <View style={styles.sheetHeaderLeft}>
            <View style={[styles.sheetTypeChip, { backgroundColor: typeConfig.color + '15' }]}>
              <Text style={styles.sheetTypeIcon}>{typeConfig.icon}</Text>
              <Text style={[styles.sheetTypeLabel, { color: typeConfig.color }]}>{typeConfig.label}</Text>
            </View>
            <Text style={styles.sheetTopic}>{session.topic}</Text>
            <Text style={styles.sheetMeta}>
              with {session.partnerName} · {formatDate(session.date)} · {formatDuration(session.duration)}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {!hasData ? (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataIcon}>📭</Text>
            <Text style={styles.noDataTitle}>No feedback available</Text>
            <Text style={styles.noDataSubtitle}>This session ended before data could be recorded</Text>
          </View>
        ) : (
          <>
            {/* Score Row */}
            <View style={styles.sheetScoreRow}>
              <View style={styles.sheetOverallScore}>
                <Text style={styles.sheetOverallNumber}>{session.overallScore}</Text>
                <Text style={styles.sheetOverallLabel}>Overall</Text>
              </View>
              <View style={styles.sheetMiniScores}>
                <MiniScoreRing score={session.scores.grammar} label="Grammar" />
                <MiniScoreRing score={session.scores.vocabulary} label="Vocab" />
                <MiniScoreRing score={session.scores.fluency} label="Fluency" />
                <MiniScoreRing score={session.scores.pronunciation} label="Pronun." />
              </View>
            </View>

            {/* Tab Bar */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
              {[
                { key: 'overview', label: '📋 Overview' },
                { key: 'mistakes', label: `❌ Mistakes (${session.feedback.mistakes.length})` },
                { key: 'words', label: '🔤 Words' },
                { key: 'vocab', label: '📖 Vocabulary' },
              ].map(tab => (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                  onPress={() => setActiveTab(tab.key as any)}
                >
                  <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Tab Content */}
            <ScrollView style={styles.sheetContent} showsVerticalScrollIndicator={false}>
              {/* OVERVIEW TAB */}
              {activeTab === 'overview' && (
                <View style={styles.tabContent}>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryIcon}>🤖</Text>
                    <Text style={styles.summaryText}>{session.feedback.aiSummary}</Text>
                  </View>

                  {session.feedback.accentNotes && (
                    <View style={styles.accentCard}>
                      <Text style={styles.accentTitle}>🗣️ Accent Notes</Text>
                      <Text style={styles.accentText}>{session.feedback.accentNotes}</Text>
                    </View>
                  )}

                  {session.feedback.strengths.length > 0 && (
                    <View style={styles.feedbackSection}>
                      <Text style={styles.feedbackSectionTitle}>✨ What You Did Well</Text>
                      {session.feedback.strengths.map((s, i) => (
                        <View key={i} style={styles.strengthItem}>
                          <Text style={styles.strengthBullet}>✓</Text>
                          <Text style={styles.strengthText}>{s}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {session.feedback.improvements.length > 0 && (
                    <View style={styles.feedbackSection}>
                      <Text style={styles.feedbackSectionTitle}>🎯 Areas to Improve</Text>
                      {session.feedback.improvements.map((item, i) => (
                        <View key={i} style={styles.improvementItem}>
                          <Text style={styles.improvementBullet}>→</Text>
                          <Text style={styles.improvementText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* MISTAKES TAB */}
              {activeTab === 'mistakes' && (
                <View style={styles.tabContent}>
                  {session.feedback.mistakes.length === 0 ? (
                    <View style={styles.emptyTab}>
                      <Text style={styles.emptyTabIcon}>🎉</Text>
                      <Text style={styles.emptyTabText}>No major mistakes recorded!</Text>
                    </View>
                  ) : (
                    session.feedback.mistakes.map((mistake) => (
                      <View key={mistake.id} style={styles.mistakeDetailCard}>
                        <View style={styles.mistakeDetailHeader}>
                          <View style={[styles.mistakeCatBadge, {
                            backgroundColor: mistake.category === 'Grammar' ? '#ede9fe' : '#dbeafe',
                          }]}>
                            <Text style={[styles.mistakeCatText, {
                              color: mistake.category === 'Grammar' ? '#7c3aed' : '#2563eb',
                            }]}>{mistake.category}</Text>
                          </View>
                          {mistake.timestamp && (
                            <Text style={styles.mistakeTimestamp}>@ {mistake.timestamp}</Text>
                          )}
                        </View>
                        <View style={styles.mistakeWrong}>
                          <Text style={styles.mistakeLabel}>❌ You said:</Text>
                          <Text style={styles.mistakeWrongText}>"{mistake.wrong}"</Text>
                        </View>
                        <View style={styles.mistakeArrow}>
                          <Text style={styles.arrowDown}>↓</Text>
                        </View>
                        <View style={styles.mistakeRight}>
                          <Text style={styles.mistakeLabel}>✓ Better:</Text>
                          <Text style={styles.mistakeRightText}>"{mistake.right}"</Text>
                        </View>
                        <View style={styles.mistakeExplanation}>
                          <Text style={styles.explanationText}>💡 {mistake.explanation}</Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* WORDS TAB */}
              {activeTab === 'words' && (
                <View style={styles.tabContent}>
                  {!session.feedback.wordLevelData?.length ? (
                    <View style={styles.emptyTab}>
                      <Text style={styles.emptyTabIcon}>📭</Text>
                      <Text style={styles.emptyTabText}>Word-level data not available for this session</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.wordsSectionHint}>
                        Words with accuracy score from Azure Speech AI
                      </Text>
                      <View style={styles.wordsGrid}>
                        {session.feedback.wordLevelData.map((w, i) => (
                          <View key={i} style={[styles.wordChip, {
                            borderColor: getScoreColor(w.accuracy) + '60',
                            backgroundColor: getScoreColor(w.accuracy) + '10',
                          }]}>
                            <Text style={styles.wordChipText}>{w.word}</Text>
                            <Text style={[styles.wordChipScore, { color: getScoreColor(w.accuracy) }]}>
                              {w.accuracy}
                            </Text>
                            {w.errorType !== 'None' && (
                              <Text style={styles.wordChipError}>{w.errorType}</Text>
                            )}
                          </View>
                        ))}
                      </View>
                      <View style={styles.wordsLegend}>
                        <View style={styles.legendRow}>
                          <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
                          <Text style={styles.legendText}>85+ Excellent</Text>
                        </View>
                        <View style={styles.legendRow}>
                          <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
                          <Text style={styles.legendText}>70-84 Good</Text>
                        </View>
                        <View style={styles.legendRow}>
                          <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
                          <Text style={styles.legendText}>Below 70 Practice</Text>
                        </View>
                      </View>
                    </>
                  )}
                </View>
              )}

              {/* VOCAB TAB */}
              {activeTab === 'vocab' && (
                <View style={styles.tabContent}>
                  {!session.feedback.vocabularyAnalysis ? (
                    <View style={styles.emptyTab}>
                      <Text style={styles.emptyTabIcon}>📭</Text>
                      <Text style={styles.emptyTabText}>Vocabulary analysis not available</Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.vocabStats}>
                        <View style={styles.vocabStatCard}>
                          <Text style={styles.vocabStatNum}>{session.feedback.vocabularyAnalysis.totalWords}</Text>
                          <Text style={styles.vocabStatLabel}>Words Spoken</Text>
                        </View>
                        <View style={styles.vocabStatCard}>
                          <Text style={styles.vocabStatNum}>{session.feedback.vocabularyAnalysis.uniqueWords}</Text>
                          <Text style={styles.vocabStatLabel}>Unique Words</Text>
                        </View>
                        <View style={styles.vocabStatCard}>
                          <Text style={[styles.vocabStatNum, { color: '#8b5cf6' }]}>
                            {Math.round((session.feedback.vocabularyAnalysis.uniqueWords / session.feedback.vocabularyAnalysis.totalWords) * 100)}%
                          </Text>
                          <Text style={styles.vocabStatLabel}>Variety</Text>
                        </View>
                      </View>

                      {session.feedback.vocabularyAnalysis.advancedWords.length > 0 && (
                        <View style={styles.vocabSection}>
                          <Text style={styles.vocabSectionTitle}>🌟 Advanced Words Used</Text>
                          <View style={styles.vocabTagsRow}>
                            {session.feedback.vocabularyAnalysis.advancedWords.map((w, i) => (
                              <View key={i} style={styles.advancedWordTag}>
                                <Text style={styles.advancedWordTagText}>{w}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {Object.keys(session.feedback.vocabularyAnalysis.repetitions).length > 0 && (
                        <View style={styles.vocabSection}>
                          <Text style={styles.vocabSectionTitle}>⚠️ Overused Words</Text>
                          {Object.entries(session.feedback.vocabularyAnalysis.repetitions).map(([word, count], i) => (
                            <View key={i} style={styles.repetitionRow}>
                              <Text style={styles.repetitionWord}>"{word}"</Text>
                              <Text style={styles.repetitionCount}>used {count as number}× — try synonyms!</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          </>
        )}
      </Animated.View>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────
export default function FeedbackScreen() {
  const navigation = useNavigation();
  const [filter, setFilter] = useState<'all' | 'week' | 'month'>('all');
  const [sessions, setSessions] = useState<CallSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSession, setSelectedSession] = useState<CallSession | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  // ── Current user info for partner filtering ──
  const { user } = useUser();
  const currentUserInfo = user ? { clerkId: user.id, fullName: user.fullName || '' } : null;

  // ── Fetch real data from API ──────────────
  const fetchSessions = useCallback(async () => {
    try {
      const rawSessions = await sessionsApi.listSessions();
      const mapped = rawSessions.map(s => mapSessionToCallSession(s, currentUserInfo));
      setSessions(mapped);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  }, [currentUserInfo?.clerkId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchSessions().finally(() => setLoading(false));
    }, [fetchSessions])
  );

  // ── Filtering (client-side since API returns all) ──
  const filteredSessions = sessions.filter(s => {
    if (filter === 'all') return true;
    const date = new Date(s.date);
    const now = new Date();
    if (filter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      return date >= weekAgo;
    }
    if (filter === 'month') {
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }
    return true;
  });

  // Stats
  const totalSessions = filteredSessions.length;
  const totalMinutes = Math.floor(filteredSessions.reduce((sum, s) => sum + s.duration, 0) / 60);
  const scoredSessions = filteredSessions.filter(s => s.overallScore > 0);
  const bestScore = scoredSessions.length > 0
    ? Math.max(...scoredSessions.map(s => s.overallScore))
    : 0;
  const avgScore = scoredSessions.length > 0
    ? Math.round(scoredSessions.reduce((sum, s) => sum + s.overallScore, 0) / scoredSessions.length)
    : 0;

  const handleConnectionPress = useCallback(async (session: CallSession) => {
    if (!session.partnerId) return;

    if (session.connectionStatus === 'none') {
      Alert.alert(
        'Send Connection Request',
        `Send a friend request to ${session.partnerName}? If they accept, you can chat with each other.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Send Request',
            onPress: async () => {
              try {
                await connectionsApi.sendRequest(session.partnerId!);
                setSessions(prev => prev.map(s =>
                  s.id === session.id ? { ...s, connectionStatus: 'pending_sent' as const } : s
                ));
              } catch (err: any) {
                Alert.alert('Error', err?.response?.data?.message || 'Failed to send request');
              }
            },
          },
        ]
      );
    } else if (session.connectionStatus === 'pending_received') {
      Alert.alert(
        'Accept Request',
        `Accept ${session.partnerName}'s connection request?`,
        [
          {
            text: 'Decline', style: 'destructive',
            onPress: async () => {
              try {
                // We'd need the requestId — for now we'll just update UI
                setSessions(prev => prev.map(s =>
                  s.id === session.id ? { ...s, connectionStatus: 'none' as const } : s
                ));
              } catch (err: any) {
                Alert.alert('Error', err?.response?.data?.message || 'Failed to decline');
              }
            },
          },
          {
            text: 'Accept',
            onPress: async () => {
              try {
                // We'd need the requestId — for now just update UI
                setSessions(prev => prev.map(s =>
                  s.id === session.id ? { ...s, connectionStatus: 'connected' as const } : s
                ));
              } catch (err: any) {
                Alert.alert('Error', err?.response?.data?.message || 'Failed to accept');
              }
            },
          },
        ]
      );
    } else if (session.connectionStatus === 'connected') {
      try {
        const status = await connectionsApi.getStatus(session.partnerId!);
        if (status.conversationId) {
          (navigation as any).navigate('Chat', {
            conversationId: status.conversationId,
            partnerId: session.partnerId,
            partnerName: session.partnerName,
            partnerAvatar: session.partnerAvatar,
          });
        } else {
          Alert.alert('Chat', 'Conversation not available yet.');
        }
      } catch (err: any) {
        Alert.alert('Error', 'Could not open chat. Please try again.');
      }
    }
  }, [navigation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSessions();
    setRefreshing(false);
  }, [fetchSessions]);

  return (
    <View style={styles.container}>
      {/* Fixed Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Sessions</Text>
          <View style={styles.avgBadge}>
            <Text style={styles.avgIcon}>↗</Text>
            <Text style={styles.avgText}>Avg: {avgScore > 0 ? avgScore : '–'}</Text>
          </View>
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterRow}>
          {([
            { key: 'all' as const, label: 'All' },
            { key: 'week' as const, label: 'This Week' },
            { key: 'month' as const, label: 'This Month' },
          ]).map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterBtnText, filter === f.key && styles.filterBtnTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* STATS ROW */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{totalSessions}</Text>
            <Text style={styles.statLabel}>Total{'\n'}Sessions</Text>
          </View>
          <View style={[styles.statCard, styles.statCardMiddle]}>
            <Text style={styles.statNumber}>
              {totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` : `${totalMinutes}m`}
            </Text>
            <Text style={styles.statLabel}>Total{'\n'}Time</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: getScoreColor(bestScore) }]}>
              {bestScore > 0 ? bestScore : '–'}
            </Text>
            <Text style={styles.statLabel}>Best{'\n'}Score</Text>
          </View>
        </View>

        {/* SESSION LIST */}
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#8b5cf6" />
        ) : filteredSessions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📞</Text>
            <Text style={styles.emptyStateTitle}>No sessions yet</Text>
            <Text style={styles.emptyStateSubtitle}>
              Complete a call to see your feedback here
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.listTitle}>
              {filteredSessions.length} Session{filteredSessions.length !== 1 ? 's' : ''}
            </Text>
            {filteredSessions.map(session => (
              <SessionCard
                key={session.id}
                session={session}
                onPress={() => {
                  setSelectedSession(session);
                  setSheetVisible(true);
                }}
                onConnectionPress={handleConnectionPress}
              />
            ))}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* DETAILED FEEDBACK BOTTOM SHEET */}
      <FeedbackBottomSheet
        session={selectedSession}
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
      />
    </View>
  );
}

// ─────────────────────────────────────────────
// STYLES — White background as requested
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9ff',
  },

  // Header
  header: {
    backgroundColor: '#fff',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  avgBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ede9fe',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  avgIcon: {
    fontSize: 12,
    color: '#7c3aed',
  },
  avgText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7c3aed',
  },

  // Filters
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  filterBtnActive: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  filterBtnTextActive: {
    color: '#fff',
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  statCardMiddle: {
    borderColor: '#e9d5ff',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 15,
  },

  // List title
  listTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Session Card
  sessionCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },

  // Avatar
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 2,
    position: 'relative',
    flexShrink: 0,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 14,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
  },
  typeBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  typeBadgeIcon: {
    fontSize: 9,
  },

  // Session Info
  sessionInfo: {
    flex: 1,
    marginRight: 12,
  },
  sessionTopic: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 3,
  },
  sessionPartner: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 5,
  },
  sessionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sessionMetaText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  levelChip: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  levelChipText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Connection Button
  connectBtn: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  connectBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Session Score
  sessionScore: {
    alignItems: 'center',
    flexShrink: 0,
  },
  overallScoreBadge: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginBottom: 3,
  },
  overallScoreText: {
    fontSize: 18,
    fontWeight: '800',
  },
  levelLabel: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '600',
    marginBottom: 4,
  },
  noScoreBadge: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 3,
  },
  noScoreText: {
    fontSize: 18,
    color: '#cbd5e1',
    fontWeight: '700',
  },
  noScoreLabel: {
    fontSize: 9,
    color: '#cbd5e1',
    marginBottom: 4,
  },
  viewDetail: {
    fontSize: 10,
    color: '#7c3aed',
    fontWeight: '700',
  },
  miniRingLabel: {
    fontSize: 9,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Bottom Sheet
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.88,
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    padding: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  sheetHeaderLeft: {
    flex: 1,
  },
  sheetTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
    gap: 4,
  },
  sheetTypeIcon: {
    fontSize: 12,
  },
  sheetTypeLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sheetTopic: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  sheetMeta: {
    fontSize: 13,
    color: '#94a3b8',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '700',
  },

  // Score row in sheet
  sheetScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 16,
  },
  sheetOverallScore: {
    alignItems: 'center',
    backgroundColor: '#f8f4ff',
    borderRadius: 16,
    width: 72,
    height: 72,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#e9d5ff',
  },
  sheetOverallNumber: {
    fontSize: 28,
    fontWeight: '900',
    color: '#7c3aed',
  },
  sheetOverallLabel: {
    fontSize: 10,
    color: '#a78bfa',
    fontWeight: '600',
  },
  sheetMiniScores: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  // Tab bar
  tabBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    flexGrow: 0,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 6,
  },
  tabActive: {
    backgroundColor: '#7c3aed',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  tabTextActive: {
    color: '#fff',
  },

  sheetContent: {
    flex: 1,
  },
  tabContent: {
    padding: 20,
  },

  // Overview tab
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f8f4ff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  summaryIcon: {
    fontSize: 20,
    marginTop: 1,
  },
  summaryText: {
    flex: 1,
    fontSize: 14,
    color: '#334155',
    lineHeight: 21,
  },
  accentCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  accentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1d4ed8',
    marginBottom: 6,
  },
  accentText: {
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 19,
  },
  feedbackSection: {
    marginBottom: 16,
  },
  feedbackSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  strengthItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  strengthBullet: {
    fontSize: 16,
    color: '#10b981',
    marginTop: 1,
  },
  strengthText: {
    flex: 1,
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  improvementItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  improvementBullet: {
    fontSize: 14,
    color: '#f59e0b',
    marginTop: 2,
    fontWeight: '700',
  },
  improvementText: {
    flex: 1,
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },

  // Mistakes tab
  mistakeDetailCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#fee2e2',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  mistakeDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mistakeCatBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mistakeCatText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  mistakeTimestamp: {
    fontSize: 12,
    color: '#94a3b8',
  },
  mistakeWrong: {
    backgroundColor: '#fff5f5',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
    marginBottom: 6,
  },
  mistakeLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
    marginBottom: 4,
  },
  mistakeWrongText: {
    fontSize: 15,
    color: '#ef4444',
    fontWeight: '600',
    fontStyle: 'italic',
  },
  mistakeArrow: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  arrowDown: {
    fontSize: 18,
    color: '#cbd5e1',
  },
  mistakeRight: {
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#10b981',
    marginBottom: 10,
  },
  mistakeRightText: {
    fontSize: 15,
    color: '#10b981',
    fontWeight: '700',
    fontStyle: 'italic',
  },
  mistakeExplanation: {
    backgroundColor: '#fafafa',
    borderRadius: 8,
    padding: 10,
  },
  explanationText: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 19,
  },

  // Words tab
  wordsSectionHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 14,
  },
  wordsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  wordChip: {
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    minWidth: 70,
    borderWidth: 1.5,
  },
  wordChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  wordChipScore: {
    fontSize: 16,
    fontWeight: '800',
  },
  wordChipError: {
    fontSize: 8,
    color: '#94a3b8',
    marginTop: 2,
    textAlign: 'center',
  },
  wordsLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#94a3b8',
  },

  // Vocab tab
  vocabStats: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  vocabStatCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  vocabStatNum: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  vocabStatLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
    textAlign: 'center',
  },
  vocabSection: {
    marginBottom: 20,
  },
  vocabSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  vocabTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  advancedWordTag: {
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  advancedWordTagText: {
    fontSize: 13,
    color: '#16a34a',
    fontWeight: '600',
  },
  repetitionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  repetitionWord: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '700',
  },
  repetitionCount: {
    fontSize: 12,
    color: '#f59e0b',
    fontWeight: '600',
  },

  // Empty tab
  emptyTab: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTabIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTabText: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
  },

  // No data in sheet
  noDataContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  noDataIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  noDataTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  noDataSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
});

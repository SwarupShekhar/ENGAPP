import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { getLiveKitToken } from '../../../api/englivo/quota'

const C = {
  void: '#080C14',
  card: '#111827',
  cardBorder: '#1E2D45',
  goldBright: '#F5C842',
  goldMid: '#E8A020',
  ash: '#8B9AB0',
  white: '#F4F6FA',
}

type Category = 'basics' | 'general' | 'business'

const CATEGORIES: {
  key: Category
  label: string
  subtitle: string
  icon: string
  topics: string[]
}[] = [
  {
    key: 'basics',
    label: 'The Basics',
    subtitle: 'Grammar',
    icon: 'school-outline',
    topics: ['Modal verbs', 'Phrasal verbs', 'Idioms', 'Verb tenses'],
  },
  {
    key: 'general',
    label: 'Day-to-Day',
    subtitle: 'General English',
    icon: 'chatbubbles-outline',
    topics: ['Travel', 'Hobbies', 'Entertainment', 'AI'],
  },
  {
    key: 'business',
    label: 'Growth',
    subtitle: 'Business English',
    icon: 'briefcase-outline',
    topics: ['Presentations', 'Meetings', 'Interviews', 'Professional sectors'],
  },
]

export default function TutorConnectPreferenceScreen() {
  const navigation = useNavigation<any>()
  const [loading, setLoading] = useState<Category | null>(null)

  async function handleSelect(category: Category) {
    setLoading(category)
    try {
      const result = await getLiveKitToken(category, 'human')
      if (result.error === 'QUOTA_EXHAUSTED') {
        navigation.navigate('MainTabs')
        return
      }
      navigation.navigate('EnglivoLiveCall', {
        token: result.token,
        roomName: result.roomName,
        serverUrl: result.serverUrl,
        freeMinutesRemaining: result.freeMinutesRemaining,
        category,
      })
    } catch (err) {
      Alert.alert('Connection Error', 'Could not connect. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={22} color={C.white} />
      </TouchableOpacity>

      <Text style={s.heading}>What do you want{'\n'}to practise?</Text>
      <Text style={s.sub}>Your tutor will focus on this area.</Text>

      <ScrollView style={s.scroll} contentContainerStyle={s.list}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            style={s.card}
            onPress={() => handleSelect(cat.key)}
            activeOpacity={0.8}
            disabled={loading !== null}
          >
            <View style={s.cardTop}>
              <Ionicons name={cat.icon as any} size={28} color={C.goldMid} />
              <View style={s.cardText}>
                <Text style={s.cardLabel}>{cat.label}</Text>
                <Text style={s.cardSubtitle}>{cat.subtitle}</Text>
              </View>
              {loading === cat.key ? (
                <ActivityIndicator color={C.goldBright} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={C.ash} />
              )}
            </View>
            <View style={s.topics}>
              {cat.topics.map((t) => (
                <View key={t} style={s.topicPill}>
                  <Text style={s.topicText}>{t}</Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.void },
  back: { padding: 16 },
  heading: { fontSize: 26, fontWeight: '700', color: C.white, paddingHorizontal: 20, lineHeight: 34 },
  sub: { fontSize: 14, color: C.ash, paddingHorizontal: 20, marginTop: 6, marginBottom: 24 },
  scroll: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  card: {
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.cardBorder,
    borderRadius: 14,
    padding: 18,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  cardText: { flex: 1, marginLeft: 14 },
  cardLabel: { color: C.white, fontSize: 17, fontWeight: '700' },
  cardSubtitle: { color: C.ash, fontSize: 13, marginTop: 2 },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicPill: {
    borderWidth: 0.5,
    borderColor: C.cardBorder,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  topicText: { color: C.ash, fontSize: 12 },
})

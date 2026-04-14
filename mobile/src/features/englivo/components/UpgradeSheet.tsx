import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { createSubscription, getMe, type MeResponse } from '../../../api/englivo/quota'

const C = {
  void: '#080C14',
  card: '#111827',
  cardBorder: '#1E2D45',
  goldBright: '#F5C842',
  goldMid: '#E8A020',
  ash: '#8B9AB0',
  white: '#F4F6FA',
  green: '#34D399',
}

const PLANS: {
  key: 'STARTER' | 'PRO' | 'PREMIUM'
  label: string
  price: string
  tutorTime: string
  aiCredits: string
  extras: string[]
  highlight?: boolean
}[] = [
  {
    key: 'STARTER',
    label: 'Starter',
    price: '₹399/mo',
    tutorTime: '2 hrs/week tutor',
    aiCredits: '20 AI credits/mo',
    extras: ['Full Pulse access'],
  },
  {
    key: 'PRO',
    label: 'Pro',
    price: '₹599/mo',
    tutorTime: '5 hrs/week tutor',
    aiCredits: '50 AI credits/mo',
    extras: ['Full Pulse access', 'Priority matching', '1-week rollover'],
    highlight: true,
  },
  {
    key: 'PREMIUM',
    label: 'Premium',
    price: '₹899/mo',
    tutorTime: 'Unlimited tutor',
    aiCredits: '120 AI credits/mo',
    extras: ['Full Pulse access', 'Priority matching', '2-week rollover', 'Session feedback'],
  },
]

interface Props {
  visible: boolean
  onClose: () => void
  onUpgraded: (plan: MeResponse['plan']) => void
  userEmail?: string
  userName?: string
}

export default function UpgradeSheet({ visible, onClose, onUpgraded, userEmail, userName }: Props) {
  const slideAnim = useRef(new Animated.Value(400)).current
  const [buying, setBuying] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyMessage, setVerifyMessage] = useState('')

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : 400,
      useNativeDriver: true,
      tension: 70,
      friction: 12,
    }).start()
  }, [visible])

  async function handleSelect(plan: 'STARTER' | 'PRO' | 'PREMIUM') {
    setBuying(plan)
    try {
      const result = await createSubscription(plan)
      if (result.error) {
        Alert.alert('Error', result.error)
        return
      }

      // Open Razorpay checkout
      // react-native-razorpay is required — import dynamically to avoid crash if not installed
      let RazorpayCheckout: any
      try {
        RazorpayCheckout = require('react-native-razorpay').default
      } catch {
        Alert.alert('Payment Error', 'Razorpay not configured. Please try again later.')
        return
      }

      const RAZORPAY_KEY = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID ?? ''
      await RazorpayCheckout.open({
        key: RAZORPAY_KEY,
        subscription_id: result.subscriptionId,
        name: 'EngR',
        description: `${plan.charAt(0) + plan.slice(1).toLowerCase()} Plan`,
        prefill: { email: userEmail ?? '', name: userName ?? '' },
        theme: { color: C.goldMid },
      })

      // Poll /api/me until plan updates (up to 30s)
      setVerifying(true)
      setVerifyMessage('Activating your plan…')

      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 3000))
        if (i === 3) setVerifyMessage('Verifying payment…')
        try {
          const me = await getMe()
          if (me.plan !== 'FREE') {
            setVerifying(false)
            onUpgraded(me.plan)
            return
          }
        } catch (_) {}
      }

      // 30s elapsed — webhook may still be in flight
      setVerifying(false)
      Alert.alert(
        'Payment received',
        "Your plan will activate shortly. Pull to refresh if it hasn't updated.",
      )
      onClose()
    } catch (err: any) {
      if (err?.code !== 'PAYMENT_CANCELLED') {
        Alert.alert('Payment failed', 'Please try again.')
      }
    } finally {
      setBuying(null)
      setVerifying(false)
    }
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>Upgrade Plan</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.ash} />
            </TouchableOpacity>
          </View>
          <Text style={s.subtitle}>
            30 min free/week used — upgrade for unlimited practice
          </Text>

          {verifying ? (
            <View style={s.verifyState}>
              <ActivityIndicator color={C.goldBright} size="large" />
              <Text style={s.verifyText}>{verifyMessage}</Text>
            </View>
          ) : (
            <ScrollView style={s.planList} contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
              {PLANS.map((plan) => (
                <TouchableOpacity
                  key={plan.key}
                  style={[s.planCard, plan.highlight && s.planCardHighlight]}
                  onPress={() => handleSelect(plan.key)}
                  disabled={buying !== null}
                  activeOpacity={0.85}
                >
                  {plan.highlight && (
                    <View style={s.popularBadge}>
                      <Text style={s.popularText}>Most Popular</Text>
                    </View>
                  )}
                  <View style={s.planRow}>
                    <Text style={s.planLabel}>{plan.label}</Text>
                    <Text style={s.planPrice}>{plan.price}</Text>
                  </View>
                  <Text style={s.planFeature}>{plan.tutorTime}</Text>
                  <Text style={s.planFeature}>{plan.aiCredits}</Text>
                  {plan.extras.map((e) => (
                    <View key={e} style={s.extraRow}>
                      <Ionicons name="checkmark-circle" size={14} color={C.green} />
                      <Text style={s.extraText}>{e}</Text>
                    </View>
                  ))}
                  {buying === plan.key && (
                    <ActivityIndicator color={C.goldBright} style={{ marginTop: 8 }} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000080', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '85%',
  },
  handle: { width: 36, height: 4, backgroundColor: C.ash, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 20, fontWeight: '700', color: C.white },
  subtitle: { color: C.ash, fontSize: 13, marginBottom: 20 },
  planList: { flex: 1 },
  planCard: {
    backgroundColor: C.void,
    borderWidth: 0.5,
    borderColor: C.cardBorder,
    borderRadius: 14,
    padding: 16,
  },
  planCardHighlight: { borderColor: C.goldMid, borderWidth: 1 },
  popularBadge: {
    backgroundColor: C.goldMid,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  popularText: { color: C.void, fontSize: 11, fontWeight: '700' },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  planLabel: { color: C.white, fontSize: 17, fontWeight: '700' },
  planPrice: { color: C.goldBright, fontSize: 17, fontWeight: '700' },
  planFeature: { color: C.ash, fontSize: 13, marginBottom: 4 },
  extraRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  extraText: { color: C.ash, fontSize: 12 },
  verifyState: { alignItems: 'center', paddingVertical: 48, gap: 16 },
  verifyText: { color: C.ash, fontSize: 15 },
})

import { client } from '../englivoClient'

export interface QuotaStatus {
  weeklyLimitSeconds: number | null
  usedSeconds: number
  rolledOverSeconds: number
  remainingSeconds: number | null  // null = unlimited
  weekStartDate: string
}

export interface AiCredits {
  granted: number
  used: number
  remaining: number
}

export interface MeResponse {
  clerkId: string
  plan: 'FREE' | 'STARTER' | 'PRO' | 'PREMIUM' | 'ENTERPRISE'
  status: 'ACTIVE' | 'CANCELLED' | 'PAST_DUE' | 'PAUSED'
  quota: QuotaStatus
  aiCredits: AiCredits
  organization: { id: string; name: string; poolSeconds: number; poolUsedSeconds: number } | null
}

export interface LiveKitTokenResponse {
  token: string
  roomName: string
  serverUrl: string
  freeMinutesRemaining: number | null
  category: string
  error?: string
}

export interface SubscriptionResponse {
  subscriptionId: string
  shortUrl: string
  error?: string
  currentPlan?: string
}

/** GET /api/me — plan + quota status */
export const getMe = (): Promise<MeResponse> =>
  client.get<MeResponse>('/api/me').then((r) => r.data)

/** GET /api/livekit/token?category=...&mode=human */
export const getLiveKitToken = (
  category: 'basics' | 'general' | 'business',
  mode: 'human' | 'ai' = 'human',
): Promise<LiveKitTokenResponse> =>
  client
    .get<LiveKitTokenResponse>('/api/livekit/token', { params: { category, mode } })
    .then((r) => r.data)
    .catch((err) => {
      if (err.response?.status === 402) {
        return { error: 'QUOTA_EXHAUSTED', remainingSeconds: 0 } as any
      }
      throw err
    })

/** POST /api/sessions/call-end */
export const postCallEnd = (sessionId: string, durationSeconds: number): Promise<void> =>
  client
    .post('/api/sessions/call-end', { sessionId, durationSeconds })
    .then(() => undefined)
    .catch(console.error)

/** POST /api/payments/create-subscription */
export const createSubscription = (
  plan: 'STARTER' | 'PRO' | 'PREMIUM',
): Promise<SubscriptionResponse> =>
  client
    .post<SubscriptionResponse>('/api/payments/create-subscription', { plan })
    .then((r) => r.data)

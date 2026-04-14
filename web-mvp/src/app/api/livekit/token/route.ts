import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { resolveQuota } from '../../../../lib/resolveQuota'
import { generateLiveKitToken, makeRoomName } from '../../../../lib/livekit'

const VALID_CATEGORIES = ['basics', 'general', 'business'] as const
type Category = typeof VALID_CATEGORIES[number]

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = (searchParams.get('category') ?? 'general') as Category
  const mode = searchParams.get('mode') ?? 'human'

  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  if (mode === 'human') {
    const resolved = await resolveQuota(userId)
    const isUnlimited = resolved.remainingSeconds === null
    const hasTime = (resolved.remainingSeconds ?? 0) > 0

    if (!isUnlimited && !hasTime) {
      return NextResponse.json(
        { error: 'QUOTA_EXHAUSTED', remainingSeconds: 0 },
        { status: 402 },
      )
    }

    const roomName = makeRoomName(userId, category)
    const metadata = JSON.stringify({ category, plan: resolved.effectivePlan })
    const token = await generateLiveKitToken(userId, roomName, metadata)

    return NextResponse.json({
      token,
      roomName,
      serverUrl: process.env.LIVEKIT_URL ?? 'wss://ssengst-174tfe9o.livekit.cloud',
      freeMinutesRemaining:
        resolved.remainingSeconds !== null
          ? Math.floor(resolved.remainingSeconds / 60)
          : null,
      category,
    })
  }

  // mode=ai — no quota gate in Phase 1
  const roomName = makeRoomName(userId, `ai-${category}`)
  const token = await generateLiveKitToken(userId, roomName)
  return NextResponse.json({
    token,
    roomName,
    serverUrl: process.env.LIVEKIT_URL ?? 'wss://ssengst-174tfe9o.livekit.cloud',
    category,
  })
}

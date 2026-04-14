import { AccessToken } from 'livekit-server-sdk'

export async function generateLiveKitToken(
  userId: string,
  roomName: string,
  metadata?: string,
): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret) throw new Error('LIVEKIT_API_KEY / LIVEKIT_API_SECRET not set')

  const at = new AccessToken(apiKey, apiSecret, { identity: userId, metadata })
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true })
  return at.toJwt()
}

export function makeRoomName(userId: string, category: string): string {
  return `core-${category}-${userId}-${Date.now()}`
}

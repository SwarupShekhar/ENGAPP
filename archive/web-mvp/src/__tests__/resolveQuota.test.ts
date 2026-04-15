import { resolveQuota } from '../lib/resolveQuota'
import { getMondayUTC } from '../lib/planConfig'

jest.mock('../lib/db', () => ({
  db: {
    subscription: { upsert: jest.fn() },
    userQuota: { upsert: jest.fn(), update: jest.fn() },
  },
}))

import { db } from '../lib/db'

beforeEach(() => jest.clearAllMocks())

describe('resolveQuota', () => {
  it('resets freeSecondsUsed when weekStartDate is in the past', async () => {
    const oldMonday = new Date('2026-01-05T00:00:00Z')
    ;(db.subscription.upsert as jest.Mock).mockResolvedValue({ plan: 'FREE', status: 'ACTIVE', currentPeriodEnd: null })
    ;(db.userQuota.upsert as jest.Mock).mockResolvedValue({ weekStartDate: oldMonday, freeSecondsUsed: 900, rolledOverSeconds: 0, aiCreditsGranted: 0, aiCreditsUsed: 0 })
    ;(db.userQuota.update as jest.Mock).mockResolvedValue({})

    const result = await resolveQuota('user_test')

    expect(db.userQuota.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ freeSecondsUsed: 0 }),
    }))
    expect(result.remainingSeconds).toBe(1800)
  })

  it('returns null remainingSeconds for PREMIUM (unlimited)', async () => {
    ;(db.subscription.upsert as jest.Mock).mockResolvedValue({ plan: 'PREMIUM', status: 'ACTIVE', currentPeriodEnd: null })
    ;(db.userQuota.upsert as jest.Mock).mockResolvedValue({ weekStartDate: getMondayUTC(new Date()), freeSecondsUsed: 0, rolledOverSeconds: 0, aiCreditsGranted: 0, aiCreditsUsed: 0 })

    const result = await resolveQuota('user_premium')

    expect(result.remainingSeconds).toBeNull()
    expect(db.userQuota.update).not.toHaveBeenCalled()
  })

  it('sets rollover=0 for PREMIUM even after week reset', async () => {
    const oldMonday = new Date('2026-01-05T00:00:00Z')
    ;(db.subscription.upsert as jest.Mock).mockResolvedValue({ plan: 'PREMIUM', status: 'ACTIVE', currentPeriodEnd: null })
    ;(db.userQuota.upsert as jest.Mock).mockResolvedValue({ weekStartDate: oldMonday, freeSecondsUsed: 500, rolledOverSeconds: 0, aiCreditsGranted: 0, aiCreditsUsed: 0 })
    ;(db.userQuota.update as jest.Mock).mockResolvedValue({})

    await resolveQuota('user_premium2')

    expect(db.userQuota.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ rolledOverSeconds: 0 }),
    }))
  })
})

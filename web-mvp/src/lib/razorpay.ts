import Razorpay from 'razorpay'
import type { Plan } from './planConfig'

export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

// These plan IDs must exist in your Razorpay dashboard
export const PLAN_TO_RAZORPAY_ID: Record<string, string> = {
  STARTER: 'core_starter_monthly',
  PRO: 'core_pro_monthly',
  PREMIUM: 'core_premium_monthly',
}

export const RAZORPAY_ID_TO_PLAN: Record<string, Plan> = {
  core_starter_monthly: 'STARTER',
  core_pro_monthly: 'PRO',
  core_premium_monthly: 'PREMIUM',
}

const PLAN_ORDER: Plan[] = ['FREE', 'STARTER', 'PRO', 'PREMIUM', 'ENTERPRISE']

export function isPlanHigherOrEqual(a: Plan, b: Plan): boolean {
  return PLAN_ORDER.indexOf(a) >= PLAN_ORDER.indexOf(b)
}

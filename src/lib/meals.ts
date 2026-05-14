import type { Frequency, MealSlot, PlanType } from '@/types/database'

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
}

export const MEAL_SLOT_EMOJI: Record<MealSlot, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
}

export const PLAN_TYPE_LABEL: Record<PlanType, string> = {
  veg: 'Veg',
  nonveg: 'Non-veg',
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: 'Daily',
  alternate: 'Alternate',
}

export function formatMealSlots(slots: MealSlot[] | null | undefined): string {
  const safeSlots: MealSlot[] = slots?.length ? slots : ['lunch']
  return safeSlots.map(slot => `${MEAL_SLOT_EMOJI[slot]} ${MEAL_SLOT_LABEL[slot]}`).join(' + ')
}

export function normalizeMealSlots(slots: MealSlot[] | null | undefined): MealSlot[] {
  const cleaned = MEAL_SLOTS.filter(slot => slots?.includes(slot))
  return cleaned.length ? cleaned : ['lunch']
}

export function formatPlanSummary(plan: {
  name: string
  meal_slots: MealSlot[]
  plan_type: PlanType
  frequency: Frequency
  monthly_price: number
}): string {
  return `${plan.name} · ${PLAN_TYPE_LABEL[plan.plan_type]} · ${formatMealSlots(plan.meal_slots)} · ${FREQUENCY_LABEL[plan.frequency]} · ₹${plan.monthly_price}/mo`
}

export function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

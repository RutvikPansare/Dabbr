import type { MealSlot, PlanType } from '@/types/database'

export type MenuQuickTagType = 'any' | PlanType

export interface MenuQuickTag {
  id: string
  provider_id: string
  meal_slot: MealSlot
  plan_type: PlanType | null
  label: string
  sort_order: number
  created_at?: string
  updated_at?: string
}

export interface DefaultMenuQuickTag {
  meal_slot: MealSlot
  type: MenuQuickTagType
  label: string
  sort_order: number
}

const defaults: Record<MealSlot, Record<MenuQuickTagType, string[]>> = {
  breakfast: {
    any: ['Poha', 'Upma', 'Idli', 'Paratha', 'Dosa'],
    veg: ['Aloo Paratha', 'Paneer Paratha', 'Moong Chilla', 'Sabudana Khichdi', 'Veg Sandwich'],
    nonveg: ['Egg Bhurji', 'Masala Omelette', 'Boiled Eggs', 'Egg Paratha', 'Chicken Sandwich'],
  },
  lunch: {
    any: ['Dal Rice', 'Roti', 'Salad', 'Curd', 'Khichdi'],
    veg: ['Rajma', 'Chole', 'Paneer Butter Masala', 'Aloo Gobi', 'Bhindi Masala'],
    nonveg: ['Chicken Curry', 'Egg Curry', 'Fish Curry', 'Mutton Curry', 'Chicken Biryani'],
  },
  dinner: {
    any: ['Dal Tadka', 'Jeera Rice', 'Phulka', 'Raita', 'Soup'],
    veg: ['Paneer Bhurji', 'Mix Veg', 'Palak Paneer', 'Veg Pulao', 'Kadhi Pakora'],
    nonveg: ['Chicken Masala', 'Egg Curry', 'Keema', 'Fish Fry', 'Chicken Pulao'],
  },
}

export const DEFAULT_MENU_QUICK_TAGS: DefaultMenuQuickTag[] = Object.entries(defaults).flatMap(([mealSlot, sections]) =>
  Object.entries(sections).flatMap(([type, labels]) =>
    labels.map((label, index) => ({
      meal_slot: mealSlot as MealSlot,
      type: type as MenuQuickTagType,
      label,
      sort_order: index,
    })),
  ),
)

export function quickTagPlanType(type: MenuQuickTagType): PlanType | null {
  return type === 'any' ? null : type
}

export function quickTagType(planType: PlanType | null): MenuQuickTagType {
  return planType ?? 'any'
}

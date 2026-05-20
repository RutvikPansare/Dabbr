import type { MealSlot, PlanType } from '@/types/database'

export type MenuQuickTagType = 'any' | PlanType

export interface MenuQuickTag {
  id: string
  provider_id: string
  meal_slot: MealSlot
  plan_type: PlanType | null
  label: string
  sort_order: number
  default_quantity: number   // servings per customer (e.g. 5 for Roti, 1 for Dal)
  created_at?: string
  updated_at?: string
}

export interface DefaultMenuQuickTag {
  meal_slot: MealSlot
  type: MenuQuickTagType
  label: string
  sort_order: number
  default_quantity: number
}

// Items that naturally come in countable pieces get a default_quantity > 1.
// Everything else defaults to 1 (one portion / serving per customer).
const defaults: Record<MealSlot, Record<MenuQuickTagType, Array<{ label: string; qty: number }>>> = {
  breakfast: {
    any: [
      { label: 'Poha',   qty: 1 },
      { label: 'Upma',   qty: 1 },
      { label: 'Idli',   qty: 4 },
      { label: 'Paratha', qty: 3 },
      { label: 'Dosa',   qty: 2 },
    ],
    veg: [
      { label: 'Aloo Paratha',      qty: 3 },
      { label: 'Paneer Paratha',    qty: 3 },
      { label: 'Moong Chilla',      qty: 2 },
      { label: 'Sabudana Khichdi',  qty: 1 },
      { label: 'Veg Sandwich',      qty: 2 },
    ],
    nonveg: [
      { label: 'Egg Bhurji',      qty: 1 },
      { label: 'Masala Omelette', qty: 2 },
      { label: 'Boiled Eggs',     qty: 2 },
      { label: 'Egg Paratha',     qty: 3 },
      { label: 'Chicken Sandwich', qty: 2 },
    ],
  },
  lunch: {
    any: [
      { label: 'Dal Rice',  qty: 1 },
      { label: 'Roti',      qty: 5 },
      { label: 'Salad',     qty: 1 },
      { label: 'Curd',      qty: 1 },
      { label: 'Khichdi',   qty: 1 },
    ],
    veg: [
      { label: 'Rajma',               qty: 1 },
      { label: 'Chole',               qty: 1 },
      { label: 'Paneer Butter Masala', qty: 1 },
      { label: 'Aloo Gobi',           qty: 1 },
      { label: 'Bhindi Masala',       qty: 1 },
    ],
    nonveg: [
      { label: 'Chicken Curry',  qty: 1 },
      { label: 'Egg Curry',      qty: 1 },
      { label: 'Fish Curry',     qty: 1 },
      { label: 'Mutton Curry',   qty: 1 },
      { label: 'Chicken Biryani', qty: 1 },
    ],
  },
  dinner: {
    any: [
      { label: 'Dal Tadka', qty: 1 },
      { label: 'Jeera Rice', qty: 1 },
      { label: 'Phulka',    qty: 5 },
      { label: 'Raita',     qty: 1 },
      { label: 'Soup',      qty: 1 },
    ],
    veg: [
      { label: 'Paneer Bhurji', qty: 1 },
      { label: 'Mix Veg',       qty: 1 },
      { label: 'Palak Paneer',  qty: 1 },
      { label: 'Veg Pulao',     qty: 1 },
      { label: 'Kadhi Pakora',  qty: 1 },
    ],
    nonveg: [
      { label: 'Chicken Masala', qty: 1 },
      { label: 'Egg Curry',      qty: 1 },
      { label: 'Keema',          qty: 1 },
      { label: 'Fish Fry',       qty: 1 },
      { label: 'Chicken Pulao',  qty: 1 },
    ],
  },
}

export const DEFAULT_MENU_QUICK_TAGS: DefaultMenuQuickTag[] = Object.entries(defaults).flatMap(
  ([mealSlot, sections]) =>
    Object.entries(sections).flatMap(([type, items]) =>
      items.map(({ label, qty }, index) => ({
        meal_slot: mealSlot as MealSlot,
        type: type as MenuQuickTagType,
        label,
        sort_order: index,
        default_quantity: qty,
      })),
    ),
)

export function quickTagPlanType(type: MenuQuickTagType): PlanType | null {
  return type === 'any' ? null : type
}

export function quickTagType(planType: PlanType | null): MenuQuickTagType {
  return planType ?? 'any'
}

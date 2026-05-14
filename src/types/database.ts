export type PlanType = 'veg' | 'nonveg'
export type Frequency = 'daily' | 'alternate'
export type MealSlot = 'breakfast' | 'lunch' | 'dinner'
export type CustomerStatus = 'active' | 'paused' | 'inactive'
export type DeliveryStatus = 'delivered' | 'skipped'
export type MealPlanStatus = 'active' | 'inactive'
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled'
export type CancellationRequestStatus = 'pending' | 'approved' | 'rejected'

export interface Database {
  public: {
    Tables: {
      providers: {
        Row: {
          id: string
          phone: string | null
          name: string
          upi_id: string | null
          created_at: string
          trial_started_at: string | null
          is_subscribed: boolean
          enable_delivery_tracking: boolean
        }
        Insert: {
          id: string
          phone?: string | null
          name: string
          upi_id?: string | null
          created_at?: string
          trial_started_at?: string | null
          is_subscribed?: boolean
          enable_delivery_tracking?: boolean
        }
        Update: {
          id?: string
          phone?: string | null
          name?: string
          upi_id?: string | null
          created_at?: string
          trial_started_at?: string | null
          is_subscribed?: boolean
          enable_delivery_tracking?: boolean
        }
      }
      customers: {
        Row: {
          id: string
          provider_id: string
          name: string
          whatsapp_number: string
          address: string | null
          area: string | null
          plan_type: PlanType
          frequency: Frequency
          meal_slots: MealSlot[]
          price_per_month: number
          status: CustomerStatus
          balance_days: number
          created_at: string
          notes: string | null
          tags: string[]
        }
        Insert: {
          id?: string
          provider_id: string
          name: string
          whatsapp_number: string
          address?: string | null
          area?: string | null
          plan_type: PlanType
          frequency: Frequency
          meal_slots?: MealSlot[]
          price_per_month?: number
          status?: CustomerStatus
          balance_days?: number
          created_at?: string
          notes?: string | null
          tags?: string[]
        }
        Update: {
          id?: string
          provider_id?: string
          name?: string
          whatsapp_number?: string
          address?: string | null
          area?: string | null
          plan_type?: PlanType
          frequency?: Frequency
          meal_slots?: MealSlot[]
          price_per_month?: number
          status?: CustomerStatus
          balance_days?: number
          created_at?: string
          notes?: string | null
          tags?: string[]
        }
      }
      meal_plans: {
        Row: {
          id: string
          provider_id: string
          name: string
          meal_slots: MealSlot[]
          plan_type: PlanType
          frequency: Frequency
          monthly_price: number
          active_days: number
          description: string | null
          status: MealPlanStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          name: string
          meal_slots?: MealSlot[]
          plan_type: PlanType
          frequency: Frequency
          monthly_price?: number
          active_days?: number
          description?: string | null
          status?: MealPlanStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          name?: string
          meal_slots?: MealSlot[]
          plan_type?: PlanType
          frequency?: Frequency
          monthly_price?: number
          active_days?: number
          description?: string | null
          status?: MealPlanStatus
          created_at?: string
          updated_at?: string
        }
      }
      subscriptions: {
        Row: {
          id: string
          provider_id: string
          customer_id: string
          meal_plan_id: string
          status: SubscriptionStatus
          start_date: string
          paused_at: string | null
          cancelled_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          customer_id: string
          meal_plan_id: string
          status?: SubscriptionStatus
          start_date?: string
          paused_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          customer_id?: string
          meal_plan_id?: string
          status?: SubscriptionStatus
          start_date?: string
          paused_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      subscription_pauses: {
        Row: {
          id: string
          subscription_id: string
          provider_id: string
          start_date: string
          end_date: string
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          subscription_id: string
          provider_id: string
          start_date: string
          end_date: string
          reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          subscription_id?: string
          provider_id?: string
          start_date?: string
          end_date?: string
          reason?: string | null
          created_at?: string
        }
      }
      daily_menus: {
        Row: {
          id: string
          provider_id: string
          menu_date: string
          meal_slot: MealSlot
          dish_name: string
          plan_type: PlanType | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          menu_date: string
          meal_slot: MealSlot
          dish_name: string
          plan_type?: PlanType | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          menu_date?: string
          meal_slot?: MealSlot
          dish_name?: string
          plan_type?: PlanType | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      pauses: {
        Row: {
          id: string
          customer_id: string
          start_date: string
          end_date: string
          reason: string | null
        }
        Insert: {
          id?: string
          customer_id: string
          start_date: string
          end_date: string
          reason?: string | null
        }
        Update: {
          id?: string
          customer_id?: string
          start_date?: string
          end_date?: string
          reason?: string | null
        }
      }
      payments: {
        Row: {
          id: string
          customer_id: string
          provider_id: string
          amount: number
          recorded_at: string
          notes: string | null
        }
        Insert: {
          id?: string
          customer_id: string
          provider_id: string
          amount: number
          recorded_at?: string
          notes?: string | null
        }
        Update: {
          id?: string
          customer_id?: string
          provider_id?: string
          amount?: number
          recorded_at?: string
          notes?: string | null
        }
      }
      delivery_logs: {
        Row: {
          id: string
          customer_id: string
          provider_id: string
          date: string
          status: DeliveryStatus
          created_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          provider_id: string
          date: string
          status: DeliveryStatus
          created_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          provider_id?: string
          date?: string
          status?: DeliveryStatus
          created_at?: string
        }
      }
    }
    Views: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
    Functions: {
      is_active_today: {
        Args: { p_customer_id: string }
        Returns: boolean
      }
      is_subscription_active_today: {
        Args: { p_subscription_id: string }
        Returns: boolean
      }
      decrement_balance_for_today: {
        Args: Record<never, never>
        Returns: void
      }
    }
  }
}

// ── Customer portal types (not in main Database interface) ─────────────────

export interface CustomerAccessToken {
  id: string
  customer_id: string
  provider_id: string
  token: string
  is_active: boolean
  last_used_at: string | null
  created_at: string
}

export interface CancellationRequest {
  id: string
  subscription_id: string
  customer_id: string
  provider_id: string
  reason: string | null
  status: CancellationRequestStatus
  created_at: string
}

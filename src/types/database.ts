export type PlanType = 'veg' | 'nonveg'
export type Frequency = 'daily' | 'alternate'
export type CustomerStatus = 'active' | 'paused' | 'inactive'
export type DeliveryStatus = 'delivered' | 'skipped'

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
          price_per_month?: number
          status?: CustomerStatus
          balance_days?: number
          created_at?: string
          notes?: string | null
          tags?: string[]
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
      decrement_balance_for_today: {
        Args: Record<never, never>
        Returns: void
      }
    }
  }
}

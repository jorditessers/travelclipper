export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accommodation_assets: {
        Row: {
          accommodation_id: string
          approved_for_distribution: boolean
          asset_type: Database["public"]["Enums"]["asset_type"]
          created_at: string
          description: string | null
          external_url: string | null
          id: string
          is_cover: boolean
          is_demo: boolean
          sort_order: number
          storage_path: string | null
          title: string
          uploaded_by: string | null
        }
        Insert: {
          accommodation_id: string
          approved_for_distribution?: boolean
          asset_type: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          description?: string | null
          external_url?: string | null
          id?: string
          is_cover?: boolean
          is_demo?: boolean
          sort_order?: number
          storage_path?: string | null
          title?: string
          uploaded_by?: string | null
        }
        Update: {
          accommodation_id?: string
          approved_for_distribution?: boolean
          asset_type?: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          description?: string | null
          external_url?: string | null
          id?: string
          is_cover?: boolean
          is_demo?: boolean
          sort_order?: number
          storage_path?: string | null
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_assets_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodations"
            referencedColumns: ["id"]
          },
        ]
      }
      accommodation_distribution_settings: {
        Row: {
          accommodation_id: string
          commission_pool_pct: number | null
          content_approval_required: boolean
          content_usage_terms: string | null
          distribution_enabled: boolean
          is_demo: boolean
          target_markets: string[]
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          commission_pool_pct?: number | null
          content_approval_required?: boolean
          content_usage_terms?: string | null
          distribution_enabled?: boolean
          is_demo?: boolean
          target_markets?: string[]
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          commission_pool_pct?: number | null
          content_approval_required?: boolean
          content_usage_terms?: string | null
          distribution_enabled?: boolean
          is_demo?: boolean
          target_markets?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_distribution_settings_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: true
            referencedRelation: "accommodations"
            referencedColumns: ["id"]
          },
        ]
      }
      accommodation_partner_profiles: {
        Row: {
          accommodation_count_band: Database["public"]["Enums"]["accommodation_count_band"]
          business_type: Database["public"]["Enums"]["ap_business_type"]
          created_at: string
          goals: Database["public"]["Enums"]["ap_goal"][]
          is_demo: boolean
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          accommodation_count_band: Database["public"]["Enums"]["accommodation_count_band"]
          business_type: Database["public"]["Enums"]["ap_business_type"]
          created_at?: string
          goals?: Database["public"]["Enums"]["ap_goal"][]
          is_demo?: boolean
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          accommodation_count_band?: Database["public"]["Enums"]["accommodation_count_band"]
          business_type?: Database["public"]["Enums"]["ap_business_type"]
          created_at?: string
          goals?: Database["public"]["Enums"]["ap_goal"][]
          is_demo?: boolean
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      accommodations: {
        Row: {
          accommodation_type:
            | Database["public"]["Enums"]["accommodation_type"]
            | null
          address: string | null
          bathrooms: number | null
          bedrooms: number | null
          best_suited_for: string[]
          booking_url: string | null
          city: string | null
          commission_pool_pct: number
          country: string | null
          country_code: string | null
          created_at: string
          currency: string
          description: string | null
          first_published_at: string | null
          id: string
          is_demo: boolean
          latitude: number | null
          location_name: string | null
          long_description: string | null
          longitude: number | null
          markets: string[]
          max_guests: number | null
          name: string
          niches: Database["public"]["Enums"]["niche"][]
          owner_id: string
          partner_commission_pct: number | null
          partner_share_pct: number
          platform_commission_pct: number | null
          region: string | null
          review_note: string | null
          short_description: string | null
          starting_price_per_night: number | null
          status: Database["public"]["Enums"]["accommodation_status"]
          updated_at: string
          website_url: string | null
          effective_pool_pct: number | null
          recommendation_score: number | null
        }
        Insert: {
          accommodation_type?:
            | Database["public"]["Enums"]["accommodation_type"]
            | null
          address?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          best_suited_for?: string[]
          booking_url?: string | null
          city?: string | null
          commission_pool_pct?: number
          country?: string | null
          country_code?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          first_published_at?: string | null
          id?: string
          is_demo?: boolean
          latitude?: number | null
          location_name?: string | null
          long_description?: string | null
          longitude?: number | null
          markets?: string[]
          max_guests?: number | null
          name: string
          niches?: Database["public"]["Enums"]["niche"][]
          owner_id: string
          partner_commission_pct?: number | null
          partner_share_pct?: number
          platform_commission_pct?: number | null
          region?: string | null
          review_note?: string | null
          short_description?: string | null
          starting_price_per_night?: number | null
          status?: Database["public"]["Enums"]["accommodation_status"]
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          accommodation_type?:
            | Database["public"]["Enums"]["accommodation_type"]
            | null
          address?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          best_suited_for?: string[]
          booking_url?: string | null
          city?: string | null
          commission_pool_pct?: number
          country?: string | null
          country_code?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          first_published_at?: string | null
          id?: string
          is_demo?: boolean
          latitude?: number | null
          location_name?: string | null
          long_description?: string | null
          longitude?: number | null
          markets?: string[]
          max_guests?: number | null
          name?: string
          niches?: Database["public"]["Enums"]["niche"][]
          owner_id?: string
          partner_commission_pct?: number | null
          partner_share_pct?: number
          platform_commission_pct?: number | null
          region?: string | null
          review_note?: string | null
          short_description?: string | null
          starting_price_per_night?: number | null
          status?: Database["public"]["Enums"]["accommodation_status"]
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      activity_events: {
        Row: {
          accommodation_id: string | null
          actor_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["activity_event_type"]
          id: string
          is_demo: boolean
          metadata: Json
        }
        Insert: {
          accommodation_id?: string | null
          actor_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["activity_event_type"]
          id?: string
          is_demo?: boolean
          metadata?: Json
        }
        Update: {
          accommodation_id?: string | null
          actor_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["activity_event_type"]
          id?: string
          is_demo?: boolean
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          new_value: Json | null
          note: string | null
          old_value: Json | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
        }
        Relationships: []
      }
      bookings: {
        Row: {
          accommodation_id: string
          booking_date: string
          booking_value: number
          check_in: string
          check_out: string
          commission_pool_pct: number | null
          commission_total: number | null
          confirmed_at: string | null
          created_at: string
          guests: number
          id: string
          is_demo: boolean
          link_id: string | null
          notes: string | null
          partner_commission: number | null
          partner_id: string
          partner_share_of_pool: number | null
          platform_commission: number | null
          rejection_reason: string | null
          source: Database["public"]["Enums"]["booking_source"]
          status: Database["public"]["Enums"]["booking_status"]
          tracking_code: string | null
          traveler_reference: string | null
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          booking_date?: string
          booking_value: number
          check_in: string
          check_out: string
          commission_pool_pct?: number | null
          commission_total?: number | null
          confirmed_at?: string | null
          created_at?: string
          guests: number
          id?: string
          is_demo?: boolean
          link_id?: string | null
          notes?: string | null
          partner_commission?: number | null
          partner_id: string
          partner_share_of_pool?: number | null
          platform_commission?: number | null
          rejection_reason?: string | null
          source: Database["public"]["Enums"]["booking_source"]
          status?: Database["public"]["Enums"]["booking_status"]
          tracking_code?: string | null
          traveler_reference?: string | null
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          booking_date?: string
          booking_value?: number
          check_in?: string
          check_out?: string
          commission_pool_pct?: number | null
          commission_total?: number | null
          confirmed_at?: string | null
          created_at?: string
          guests?: number
          id?: string
          is_demo?: boolean
          link_id?: string | null
          notes?: string | null
          partner_commission?: number | null
          partner_id?: string
          partner_share_of_pool?: number | null
          platform_commission?: number | null
          rejection_reason?: string | null
          source?: Database["public"]["Enums"]["booking_source"]
          status?: Database["public"]["Enums"]["booking_status"]
          tracking_code?: string | null
          traveler_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "distribution_links"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_campaigns: {
        Row: {
          accommodation_id: string
          commission_pool_pct: number
          created_at: string
          description: string | null
          ends_on: string
          id: string
          is_demo: boolean
          name: string
          starts_on: string
        }
        Insert: {
          accommodation_id: string
          commission_pool_pct: number
          created_at?: string
          description?: string | null
          ends_on: string
          id?: string
          is_demo?: boolean
          name: string
          starts_on: string
        }
        Update: {
          accommodation_id?: string
          commission_pool_pct?: number
          created_at?: string
          description?: string | null
          ends_on?: string
          id?: string
          is_demo?: boolean
          name?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_campaigns_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodations"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_accounts: {
        Row: {
          created_at: string
          side: string
          user_id: string
        }
        Insert: {
          created_at?: string
          side: string
          user_id: string
        }
        Update: {
          created_at?: string
          side?: string
          user_id?: string
        }
        Relationships: []
      }
      distribution_clicks: {
        Row: {
          accommodation_id: string
          clicked_at: string
          id: string
          ip_hash: string
          is_bot: boolean
          is_demo: boolean
          is_unique: boolean
          link_id: string
          partner_id: string
          referrer: string | null
          user_agent: string | null
        }
        Insert: {
          accommodation_id: string
          clicked_at?: string
          id?: string
          ip_hash: string
          is_bot?: boolean
          is_demo?: boolean
          is_unique?: boolean
          link_id: string
          partner_id: string
          referrer?: string | null
          user_agent?: string | null
        }
        Update: {
          accommodation_id?: string
          clicked_at?: string
          id?: string
          ip_hash?: string
          is_bot?: boolean
          is_demo?: boolean
          is_unique?: boolean
          link_id?: string
          partner_id?: string
          referrer?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distribution_clicks_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_clicks_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "distribution_links"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_links: {
        Row: {
          accommodation_id: string
          archived_at: string | null
          created_at: string
          id: string
          is_demo: boolean
          label: string | null
          partner_id: string
          tracking_code: string
        }
        Insert: {
          accommodation_id: string
          archived_at?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          label?: string | null
          partner_id: string
          tracking_code: string
        }
        Update: {
          accommodation_id?: string
          archived_at?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          label?: string | null
          partner_id?: string
          tracking_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_links_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodations"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_partner_profiles: {
        Row: {
          bio: string | null
          brand_name: string
          created_at: string
          distribution_type: Database["public"]["Enums"]["distribution_type"]
          is_demo: boolean
          markets: string[]
          niches: Database["public"]["Enums"]["niche"][]
          reach_band: Database["public"]["Enums"]["reach_band"]
          social_links: string[]
          updated_at: string
          user_id: string
          website: string
        }
        Insert: {
          bio?: string | null
          brand_name: string
          created_at?: string
          distribution_type: Database["public"]["Enums"]["distribution_type"]
          is_demo?: boolean
          markets?: string[]
          niches?: Database["public"]["Enums"]["niche"][]
          reach_band: Database["public"]["Enums"]["reach_band"]
          social_links?: string[]
          updated_at?: string
          user_id: string
          website: string
        }
        Update: {
          bio?: string | null
          brand_name?: string
          created_at?: string
          distribution_type?: Database["public"]["Enums"]["distribution_type"]
          is_demo?: boolean
          markets?: string[]
          niches?: Database["public"]["Enums"]["niche"][]
          reach_band?: Database["public"]["Enums"]["reach_band"]
          social_links?: string[]
          updated_at?: string
          user_id?: string
          website?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          demo_baseline_at: string | null
          demo_last_reset_at: string | null
          demo_mode_enabled: boolean
          demo_tour_accommodation_id: string | null
          id: boolean
          partner_share_of_pool: number
          updated_at: string
        }
        Insert: {
          demo_baseline_at?: string | null
          demo_last_reset_at?: string | null
          demo_mode_enabled?: boolean
          demo_tour_accommodation_id?: string | null
          id?: boolean
          partner_share_of_pool?: number
          updated_at?: string
        }
        Update: {
          demo_baseline_at?: string | null
          demo_last_reset_at?: string | null
          demo_mode_enabled?: boolean
          demo_tour_accommodation_id?: string | null
          id?: boolean
          partner_share_of_pool?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_demo_tour_accommodation_id_fkey"
            columns: ["demo_tour_accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          country: string | null
          created_at: string
          display_name: string
          distribution_type:
            | Database["public"]["Enums"]["distribution_type"]
            | null
          email: string | null
          first_name: string | null
          id: string
          is_demo: boolean
          last_name: string | null
          onboarding_completed: boolean
          terms_accepted_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          display_name?: string
          distribution_type?:
            | Database["public"]["Enums"]["distribution_type"]
            | null
          email?: string | null
          first_name?: string | null
          id: string
          is_demo?: boolean
          last_name?: string | null
          onboarding_completed?: boolean
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          display_name?: string
          distribution_type?:
            | Database["public"]["Enums"]["distribution_type"]
            | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_demo?: boolean
          last_name?: string | null
          onboarding_completed?: boolean
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      saved_accommodations: {
        Row: {
          accommodation_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_accommodations_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodations"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_salts: {
        Row: {
          day: string
          salt: string
        }
        Insert: {
          day: string
          salt: string
        }
        Update: {
          day?: string
          salt?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accommodation_submission_blockers: {
        Args: { _accommodation_id: string }
        Returns: string[]
      }
      admin_correct_booking: {
        Args: {
          _booking_id: string
          _booking_value: number
          _note: string
          _status: Database["public"]["Enums"]["booking_status"]
        }
        Returns: undefined
      }
      admin_list_users: {
        Args: { _exclude_demo?: boolean }
        Returns: {
          company_name: string
          country: string
          created_at: string
          display_name: string
          email: string
          first_name: string
          id: string
          is_demo: boolean
          last_name: string
          onboarding_completed: boolean
          role: Database["public"]["Enums"]["app_role"]
          terms_accepted_at: string
        }[]
      }
      admin_metrics_window: {
        Args: { _exclude_demo: boolean; _from: string; _to: string }
        Returns: Json
      }
      admin_overview: { Args: { _exclude_demo?: boolean }; Returns: Json }
      admin_partner_performance: {
        Args: { _exclude_demo?: boolean }
        Returns: {
          booking_value: number
          bookings: number
          brand_name: string
          distribution_type: Database["public"]["Enums"]["distribution_type"]
          first_link_at: string
          is_demo: boolean
          joined_at: string
          links: number
          markets: string[]
          partner_commission: number
          partner_id: string
          reach_band: Database["public"]["Enums"]["reach_band"]
          unique_clicks: number
        }[]
      }
      admin_period_metrics: {
        Args: { _exclude_demo?: boolean; _from: string; _to: string }
        Returns: Json
      }
      admin_set_accommodation_status: {
        Args: {
          _accommodation_id: string
          _note: string
          _status: Database["public"]["Enums"]["accommodation_status"]
        }
        Returns: undefined
      }
      admin_set_demo_mode: {
        Args: { _enabled: boolean; _note?: string }
        Returns: undefined
      }
      admin_set_partner_share: {
        Args: { _note?: string; _value: number }
        Returns: undefined
      }
      ap_dashboard_accommodations: {
        Args: { _since?: string }
        Returns: {
          booking_value: number
          bookings: number
          campaign_ends_on: string
          campaign_name: string
          clicks: number
          effective_pct: number
          id: string
          name: string
          partners_engaged: number
          standard_pct: number
          status: Database["public"]["Enums"]["accommodation_status"]
        }[]
      }
      ap_dashboard_kpis: {
        Args: { _since?: string }
        Returns: {
          active_accommodations: number
          booking_value: number
          commission_owed: number
          confirmed_bookings: number
          partners_engaged: number
          pending_reviews: number
          unique_clicks: number
        }[]
      }
      ap_dashboard_partners: {
        Args: { _since?: string }
        Returns: {
          bookings: number
          clicks: number
          partner_id: string
        }[]
      }
      ap_pending_booking_ids: {
        Args: never
        Returns: {
          id: string
        }[]
      }
      ap_recent_activity: {
        Args: { _limit?: number }
        Returns: {
          accommodation_id: string
          accommodation_name: string
          created_at: string
          event_type: Database["public"]["Enums"]["activity_event_type"]
          id: string
          metadata: Json
          partner_type: Database["public"]["Enums"]["distribution_type"]
        }[]
      }
      archive_distribution_link: {
        Args: { _link_id: string }
        Returns: undefined
      }
      asset_folder_uuid: { Args: { _name: string }; Returns: string }
      can_manage_accommodation: {
        Args: { _accommodation_id: string }
        Returns: boolean
      }
      can_read_asset_object: { Args: { _name: string }; Returns: boolean }
      cancel_booking: {
        Args: { _booking_id: string; _reason: string }
        Returns: undefined
      }
      choose_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: undefined
      }
      clean_traveler_ref: { Args: { _t: string }; Returns: string }
      complete_accommodation_onboarding: {
        Args: {
          _accept_terms: boolean
          _business_type: Database["public"]["Enums"]["ap_business_type"]
          _company_name: string
          _count_band: Database["public"]["Enums"]["accommodation_count_band"]
          _country: string
          _first_name: string
          _goals: Database["public"]["Enums"]["ap_goal"][]
          _last_name: string
          _website: string
        }
        Returns: undefined
      }
      complete_distribution_onboarding: {
        Args: {
          _accept_terms: boolean
          _bio: string
          _brand_name: string
          _distribution_type: Database["public"]["Enums"]["distribution_type"]
          _markets: string[]
          _niches: Database["public"]["Enums"]["niche"][]
          _reach_band: Database["public"]["Enums"]["reach_band"]
          _social_links: string[]
          _website: string
        }
        Returns: undefined
      }
      complete_onboarding: {
        Args: {
          _company_name?: string
          _display_name: string
          _distribution_type?: Database["public"]["Enums"]["distribution_type"]
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      complete_past_bookings: { Args: never; Returns: number }
      create_distribution_link: {
        Args: { _accommodation_id: string; _label?: string }
        Returns: {
          created_at: string
          id: string
          label: string
          tracking_code: string
        }[]
      }
      demo_reset_state: { Args: never; Returns: undefined }
      demo_tour_summary: {
        Args: never
        Returns: {
          accommodation_name: string
          booking_value: number
          commission_pool_pct: number
          commission_total: number
          partner_brand: string
          partner_commission: number
          platform_commission: number
          status: string
        }[]
      }
      dp_dashboard_kpis: {
        Args: { _since?: string }
        Returns: {
          active_links: number
          booking_value: number
          commission_earned: number
          confirmed_bookings: number
          confirmed_commission: number
          confirmed_count: number
          earned_commission: number
          earned_count: number
          pending_commission: number
          pending_count: number
          saved: number
          unique_clicks: number
        }[]
      }
      dp_earnings_by_month: {
        Args: { _since?: string }
        Returns: {
          confirmed: number
          earned: number
          month: string
        }[]
      }
      dp_recent_activity: {
        Args: { _limit?: number }
        Returns: {
          accommodation_id: string
          accommodation_name: string
          created_at: string
          event_type: Database["public"]["Enums"]["activity_event_type"]
          id: string
          metadata: Json
        }[]
      }
      dp_top_links: {
        Args: { _since?: string }
        Returns: {
          accommodation_id: string
          accommodation_name: string
          bookings: number
          clicks: number
          commission: number
          id: string
          label: string
          tracking_code: string
        }[]
      }
      effective_commission_pct: {
        Args: { _accommodation_id: string; _on_date?: string }
        Returns: number
      }
      effective_pool_pct: {
        Args: { "": Database["public"]["Tables"]["accommodations"]["Row"] }
        Returns: {
          error: true
        } & "the function public.effective_pool_pct with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
      }
      ensure_my_profile: { Args: never; Returns: undefined }
      generate_tracking_code: { Args: { _name: string }; Returns: string }
      get_accommodation_links: {
        Args: { _accommodation_id: string }
        Returns: {
          archived_at: string
          created_at: string
          label: string
          partner_id: string
          tracking_code: string
        }[]
      }
      get_demo_mode: { Args: never; Returns: boolean }
      get_demo_tour_accommodation_id: { Args: never; Returns: string }
      get_interacting_partners: {
        Args: { _accommodation_id: string }
        Returns: {
          brand_name: string
          last_interaction: string
          partner_id: string
        }[]
      }
      get_my_bookings: {
        Args: never
        Returns: {
          accommodation_id: string
          accommodation_name: string
          booking_date: string
          booking_value: number
          check_in: string
          check_out: string
          created_at: string
          guests: number
          id: string
          partner_commission: number
          rejection_reason: string
          source: Database["public"]["Enums"]["booking_source"]
          status: Database["public"]["Enums"]["booking_status"]
          tracking_code: string
          traveler_reference: string
        }[]
      }
      get_my_links: {
        Args: never
        Returns: {
          accommodation_id: string
          accommodation_name: string
          archived_at: string
          clicks: number
          created_at: string
          id: string
          is_available: boolean
          label: string
          tracking_code: string
        }[]
      }
      get_my_saved_accommodations: {
        Args: never
        Returns: {
          accommodation_id: string
          city: string
          country: string
          is_available: boolean
          name: string
          saved_at: string
        }[]
      }
      get_partner_public_profile: {
        Args: { _partner_id: string }
        Returns: {
          bio: string
          brand_name: string
          distribution_type: Database["public"]["Enums"]["distribution_type"]
          markets: string[]
          niches: Database["public"]["Enums"]["niche"][]
          reach_band: Database["public"]["Enums"]["reach_band"]
          social_links: string[]
          website: string
        }[]
      }
      get_partner_share_of_pool: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_demo_user: { Args: { _uid: string }; Returns: boolean }
      is_distributable: {
        Args: { _accommodation_id: string }
        Returns: boolean
      }
      log_event: {
        Args: {
          _accommodation_id: string
          _event_type: Database["public"]["Enums"]["activity_event_type"]
          _metadata?: Json
        }
        Returns: undefined
      }
      lookup_tracking_code: {
        Args: { _accommodation_id: string; _code: string }
        Returns: {
          label: string
          link_id: string
          partner_id: string
          tracking_code: string
        }[]
      }
      my_demo_side: { Args: never; Returns: string }
      recommend_accommodations: {
        Args: { _include_saved?: boolean; _limit?: number; _partner_id: string }
        Returns: {
          accommodation_id: string
          reasons: string[]
          score: number
        }[]
      }
      recommendation_score: {
        Args: { "": Database["public"]["Tables"]["accommodations"]["Row"] }
        Returns: {
          error: true
        } & "the function public.recommendation_score with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
      }
      record_click: {
        Args: {
          _code: string
          _ip: string
          _referrer: string
          _user_agent: string
        }
        Returns: Json
      }
      register_booking: {
        Args: {
          _accommodation_id: string
          _booking_date?: string
          _booking_value: number
          _check_in: string
          _check_out: string
          _guests: number
          _notes?: string
          _partner_id: string
          _tracking_code: string
          _traveler_reference?: string
        }
        Returns: string
      }
      reorder_assets: {
        Args: { _accommodation_id: string; _ids: string[] }
        Returns: undefined
      }
      report_booking: {
        Args: {
          _accommodation_id: string
          _booking_value: number
          _check_in: string
          _check_out: string
          _guests: number
          _notes?: string
          _traveler_reference?: string
        }
        Returns: string
      }
      reset_demo: { Args: never; Returns: undefined }
      review_accommodation: {
        Args: { _accommodation_id: string; _approve: boolean; _note?: string }
        Returns: undefined
      }
      review_booking: {
        Args: {
          _booking_id: string
          _confirm: boolean
          _final_value?: number
          _reason?: string
        }
        Returns: undefined
      }
      score_accommodation_for_partner: {
        Args: { _accommodation_id: string; _partner_id: string }
        Returns: {
          reasons: string[]
          score: number
        }[]
      }
      set_asset_cover: { Args: { _asset_id: string }; Returns: undefined }
      submit_accommodation_for_review: {
        Args: { _accommodation_id: string }
        Returns: undefined
      }
    }
    Enums: {
      accommodation_count_band: "1" | "2_5" | "6_20" | "21_plus"
      accommodation_status:
        | "draft"
        | "published"
        | "pending_review"
        | "active"
        | "paused"
      accommodation_type:
        | "villa"
        | "boutique_hotel"
        | "hotel"
        | "apartment"
        | "bnb"
        | "resort"
        | "unique_stay"
        | "other"
      activity_event_type:
        | "opportunity_viewed"
        | "opportunity_saved"
        | "content_viewed"
        | "content_downloaded"
        | "link_created"
        | "link_clicked"
        | "booking_reported"
        | "booking_registered"
        | "booking_confirmed"
        | "booking_cancelled"
      ap_business_type:
        | "individual_owner"
        | "boutique_hotel"
        | "independent_hotel"
        | "villa_management"
        | "bnb"
        | "resort"
        | "other"
      ap_goal:
        | "direct_bookings"
        | "reduce_ota_dependency"
        | "new_audiences"
        | "travel_seller_relationships"
        | "fill_low_demand"
      app_role: "accommodation_partner" | "distribution_partner" | "admin"
      asset_type:
        | "photo"
        | "video"
        | "vertical_video"
        | "drone"
        | "document"
        | "brand_asset"
      booking_source: "partner_reported" | "accommodation_registered"
      booking_status:
        | "reported"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "rejected"
      distribution_type:
        | "creator"
        | "travel_advisor"
        | "boutique_agency"
        | "curator"
        | "publisher"
        | "niche_community"
      niche:
        | "luxury"
        | "boutique"
        | "family"
        | "couples"
        | "wellness"
        | "food_wine"
        | "adventure"
        | "design"
        | "sustainable"
        | "slow_travel"
        | "beach"
        | "city"
        | "romantic"
        | "lgbtq_friendly"
        | "cycling"
      reach_band: "lt_1k" | "1k_10k" | "10k_50k" | "50k_250k" | "250k_plus"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      accommodation_count_band: ["1", "2_5", "6_20", "21_plus"],
      accommodation_status: [
        "draft",
        "published",
        "pending_review",
        "active",
        "paused",
      ],
      accommodation_type: [
        "villa",
        "boutique_hotel",
        "hotel",
        "apartment",
        "bnb",
        "resort",
        "unique_stay",
        "other",
      ],
      activity_event_type: [
        "opportunity_viewed",
        "opportunity_saved",
        "content_viewed",
        "content_downloaded",
        "link_created",
        "link_clicked",
        "booking_reported",
        "booking_registered",
        "booking_confirmed",
        "booking_cancelled",
      ],
      ap_business_type: [
        "individual_owner",
        "boutique_hotel",
        "independent_hotel",
        "villa_management",
        "bnb",
        "resort",
        "other",
      ],
      ap_goal: [
        "direct_bookings",
        "reduce_ota_dependency",
        "new_audiences",
        "travel_seller_relationships",
        "fill_low_demand",
      ],
      app_role: ["accommodation_partner", "distribution_partner", "admin"],
      asset_type: [
        "photo",
        "video",
        "vertical_video",
        "drone",
        "document",
        "brand_asset",
      ],
      booking_source: ["partner_reported", "accommodation_registered"],
      booking_status: [
        "reported",
        "confirmed",
        "completed",
        "cancelled",
        "rejected",
      ],
      distribution_type: [
        "creator",
        "travel_advisor",
        "boutique_agency",
        "curator",
        "publisher",
        "niche_community",
      ],
      niche: [
        "luxury",
        "boutique",
        "family",
        "couples",
        "wellness",
        "food_wine",
        "adventure",
        "design",
        "sustainable",
        "slow_travel",
        "beach",
        "city",
        "romantic",
        "lgbtq_friendly",
        "cycling",
      ],
      reach_band: ["lt_1k", "1k_10k", "10k_50k", "50k_250k", "250k_plus"],
    },
  },
} as const

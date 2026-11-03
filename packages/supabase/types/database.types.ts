export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ogp_fetch_attempts: {
        Row: {
          completed_at: string | null
          started_at: string
          title: string | null
          url_hash: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          started_at?: string
          title?: string | null
          url_hash: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          started_at?: string
          title?: string | null
          url_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      places: {
        Row: {
          cached_at: string
          created_at: string
          google_place_id: string
          id: string
          latitude: number | null
          longitude: number | null
          updated_at: string
        }
        Insert: {
          cached_at?: string
          created_at?: string
          google_place_id: string
          id?: string
          latitude: number | null
          longitude: number | null
          updated_at?: string
        }
        Update: {
          cached_at?: string
          created_at?: string
          google_place_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          preferred_language: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id: string
          preferred_language?: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          preferred_language?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      saved_places: {
        Row: {
          created_at: string
          id: string
          memo: string | null
          place_id: string
          source_text: string | null
          source_title: string | null
          status: Database["public"]["Enums"]["saved_place_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          memo?: string | null
          place_id: string
          source_text?: string | null
          source_title?: string | null
          status: Database["public"]["Enums"]["saved_place_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          memo?: string | null
          place_id?: string
          source_text?: string | null
          source_title?: string | null
          status?: Database["public"]["Enums"]["saved_place_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_places_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      user_agreements: {
        Row: {
          agreed_at: string
          created_at: string
          user_id: string
        }
        Insert: {
          agreed_at?: string
          created_at?: string
          user_id: string
        }
        Update: {
          agreed_at?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      begin_withdrawal: { Args: never; Returns: string }
      check_request: { Args: never; Returns: undefined }
      claim_ogp_fetch: {
        Args: { p_url_hash: string }
        Returns: {
          allowed: boolean
          cached_title: string
        }[]
      }
      claim_place_refresh_batch: {
        Args: { p_limit: number }
        Returns: {
          google_place_id: string
        }[]
      }
      cleanup_ogp_fetch_attempts: { Args: never; Returns: undefined }
      complete_ogp_fetch: {
        Args: { p_title: string; p_url_hash: string }
        Returns: undefined
      }
      complete_onboarding: { Args: { p_username: string }; Returns: undefined }
      finish_withdrawal: { Args: never; Returns: undefined }
      ogp_fetch_window: { Args: never; Returns: string }
      revoke_this_session: { Args: never; Returns: undefined }
      session_is_valid: { Args: never; Returns: boolean }
      upsert_place: {
        Args: {
          p_google_place_id: string
          p_latitude: number
          p_longitude: number
        }
        Returns: string
      }
    }
    Enums: {
      saved_place_status: "want_to_go" | "visit_again" | "no_thanks"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      saved_place_status: ["want_to_go", "visit_again", "no_thanks"],
    },
  },
} as const


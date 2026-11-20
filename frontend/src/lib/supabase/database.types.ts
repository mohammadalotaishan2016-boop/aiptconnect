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
    PostgrestVersion: "14.15"
  }
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
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          ip: unknown
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          ip?: unknown
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          ip?: unknown
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_dashboard_card_availability: {
        Row: {
          card_key: string
          coming_soon: boolean
          is_available: boolean
          updated_at: string
        }
        Insert: {
          card_key: string
          coming_soon?: boolean
          is_available?: boolean
          updated_at?: string
        }
        Update: {
          card_key?: string
          coming_soon?: boolean
          is_available?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      client_dashboard_read_state: {
        Row: {
          category: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          category: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          category?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_dashboard_read_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_dashboard_read_state_config: {
        Row: {
          id: boolean
          tracking_started_at: string
        }
        Insert: {
          id?: boolean
          tracking_started_at?: string
        }
        Update: {
          id?: boolean
          tracking_started_at?: string
        }
        Relationships: []
      }
      client_invitations: {
        Row: {
          claimed_by: string | null
          client_id: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          membership_role: string
          revoked_at: string | null
          token_hash: string
          updated_at: string
        }
        Insert: {
          claimed_by?: string | null
          client_id: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          membership_role?: string
          revoked_at?: string | null
          token_hash: string
          updated_at?: string
        }
        Update: {
          claimed_by?: string | null
          client_id?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          membership_role?: string
          revoked_at?: string | null
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invitations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_memberships: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_id: string
          created_at: string
          id: string
          membership_role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          created_at?: string
          id?: string
          membership_role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          created_at?: string
          id?: string
          membership_role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_memberships_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_permission_audit: {
        Row: {
          actor_id: string
          after_permissions: Json
          before_permissions: Json | null
          created_at: string
          id: number
          revision: number
          user_id: string
        }
        Insert: {
          actor_id: string
          after_permissions: Json
          before_permissions?: Json | null
          created_at?: string
          id?: never
          revision: number
          user_id: string
        }
        Update: {
          actor_id?: string
          after_permissions?: Json
          before_permissions?: Json | null
          created_at?: string
          id?: never
          revision?: number
          user_id?: string
        }
        Relationships: []
      }
      client_permission_sets: {
        Row: {
          permissions: Json
          revision: number
          updated_at: string
          updated_by: string
          user_id: string
        }
        Insert: {
          permissions: Json
          revision?: number
          updated_at?: string
          updated_by: string
          user_id: string
        }
        Update: {
          permissions?: Json
          revision?: number
          updated_at?: string
          updated_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_permission_sets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_permission_sets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_registration_claims: {
        Row: {
          claimed_by: string | null
          client_id: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invitation_id: string
          updated_at: string
        }
        Insert: {
          claimed_by?: string | null
          client_id: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invitation_id: string
          updated_at?: string
        }
        Update: {
          claimed_by?: string | null
          client_id?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invitation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_registration_claims_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_registration_claims_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "client_invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string
          assigned_id: number
          client_type: string
          company_name: string
          country_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string
          fee_classification_id: string | null
          id: string
          notes: string
          phone: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address: string
          assigned_id?: number
          client_type: string
          company_name: string
          country_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email: string
          fee_classification_id?: string | null
          id?: string
          notes?: string
          phone: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string
          assigned_id?: number
          client_type?: string
          company_name?: string
          country_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string
          fee_classification_id?: string | null
          id?: string
          notes?: string
          phone?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_fee_classification_id_fkey"
            columns: ["fee_classification_id"]
            isOneToOne: false
            referencedRelation: "fee_classifications"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          abbreviation: string
          created_at: string
          deleted_at: string | null
          flag_url: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          abbreviation: string
          created_at?: string
          deleted_at?: string | null
          flag_url: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          abbreviation?: string
          created_at?: string
          deleted_at?: string | null
          flag_url?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_service_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          file_type: string
          id: string
          is_image: boolean
          message_id: string
          object_key: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size: number
          file_type: string
          id?: string
          is_image?: boolean
          message_id: string
          object_key: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number
          file_type?: string
          id?: string
          is_image?: boolean
          message_id?: string
          object_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "customer_service_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_service_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          reply_to_id: string | null
          sender_id: string | null
          sender_role: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          reply_to_id?: string | null
          sender_id?: string | null
          sender_role: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          reply_to_id?: string | null
          sender_id?: string | null
          sender_role?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "customer_service_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "customer_service_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_service_read_state: {
        Row: {
          last_read_at: string
          ticket_id: string
          typing_until: string | null
          user_id: string
        }
        Insert: {
          last_read_at?: string
          ticket_id: string
          typing_until?: string | null
          user_id: string
        }
        Update: {
          last_read_at?: string
          ticket_id?: string
          typing_until?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_read_state_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "customer_service_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_service_status_actions: {
        Row: {
          actor_id: string
          created_at: string
          from_status: string
          id: string
          note: string | null
          ticket_id: string
          to_status: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          from_status: string
          id?: string
          note?: string | null
          ticket_id: string
          to_status: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          from_status?: string
          id?: string
          note?: string | null
          ticket_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_status_actions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "customer_service_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_service_tickets: {
        Row: {
          category: string
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          priority: string
          status: string
          subject: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          priority?: string
          status?: string
          subject: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          priority?: string
          status?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          created_by: string | null
          device_id: string
          id: string
          ip: unknown
          last_seen_at: string
          revoked_at: string | null
          revoked_reason: string | null
          status: string
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          device_id: string
          id?: string
          ip?: unknown
          last_seen_at?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          device_id?: string
          id?: string
          ip?: unknown
          last_seen_at?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_categories: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_primary: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_primary?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_primary?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      fee_claiming_priority_values: {
        Row: {
          attorney_fee: number | null
          country_id: string
          created_at: string
          currency: string
          dataset_version_id: string
          id: string
          official_fee: number | null
          source_row: number | null
          source_sheet: string
          source_values: Json
          total_fee: number | null
          updated_at: string
        }
        Insert: {
          attorney_fee?: number | null
          country_id: string
          created_at?: string
          currency?: string
          dataset_version_id: string
          id?: string
          official_fee?: number | null
          source_row?: number | null
          source_sheet?: string
          source_values?: Json
          total_fee?: number | null
          updated_at?: string
        }
        Update: {
          attorney_fee?: number | null
          country_id?: string
          created_at?: string
          currency?: string
          dataset_version_id?: string
          id?: string
          official_fee?: number | null
          source_row?: number | null
          source_sheet?: string
          source_values?: Json
          total_fee?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_claiming_priority_values_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_claiming_priority_values_dataset_version_id_fkey"
            columns: ["dataset_version_id"]
            isOneToOne: false
            referencedRelation: "fee_dataset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_class_values: {
        Row: {
          attorney_fee: number | null
          class_number: number
          country_id: string
          created_at: string
          currency: string
          dataset_version_id: string
          id: string
          official_fee: number | null
          source_row: number | null
          source_sheet: string
          source_values: Json
          total_fee: number | null
          updated_at: string
        }
        Insert: {
          attorney_fee?: number | null
          class_number: number
          country_id: string
          created_at?: string
          currency?: string
          dataset_version_id: string
          id?: string
          official_fee?: number | null
          source_row?: number | null
          source_sheet?: string
          source_values?: Json
          total_fee?: number | null
          updated_at?: string
        }
        Update: {
          attorney_fee?: number | null
          class_number?: number
          country_id?: string
          created_at?: string
          currency?: string
          dataset_version_id?: string
          id?: string
          official_fee?: number | null
          source_row?: number | null
          source_sheet?: string
          source_values?: Json
          total_fee?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_class_values_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_class_values_dataset_version_id_fkey"
            columns: ["dataset_version_id"]
            isOneToOne: false
            referencedRelation: "fee_dataset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_classes: {
        Row: {
          attorney_fee: number | null
          class_number: number
          created_at: string
          currency: string
          dataset_version_id: string
          id: string
          name: string
          official_fee: number | null
          source_row: number | null
          source_sheet: string
          source_values: Json
          total_fee: number | null
          updated_at: string
        }
        Insert: {
          attorney_fee?: number | null
          class_number: number
          created_at?: string
          currency?: string
          dataset_version_id: string
          id?: string
          name: string
          official_fee?: number | null
          source_row?: number | null
          source_sheet?: string
          source_values?: Json
          total_fee?: number | null
          updated_at?: string
        }
        Update: {
          attorney_fee?: number | null
          class_number?: number
          created_at?: string
          currency?: string
          dataset_version_id?: string
          id?: string
          name?: string
          official_fee?: number | null
          source_row?: number | null
          source_sheet?: string
          source_values?: Json
          total_fee?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_classes_dataset_version_id_fkey"
            columns: ["dataset_version_id"]
            isOneToOne: false
            referencedRelation: "fee_dataset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_classifications: {
        Row: {
          color_indication: string
          created_at: string
          deleted_at: string | null
          description: string
          id: string
          updated_at: string
        }
        Insert: {
          color_indication: string
          created_at?: string
          deleted_at?: string | null
          description: string
          id?: string
          updated_at?: string
        }
        Update: {
          color_indication?: string
          created_at?: string
          deleted_at?: string | null
          description?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      fee_dataset_versions: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: string
          published_at: string | null
          published_by: string | null
          reconciliation_summary: Json
          rolled_back_at: string | null
          rolled_back_by: string | null
          rolled_back_from_id: string | null
          source_checksum: string | null
          status: string
          sync_run_id: string | null
          total_categories: number | null
          total_countries: number | null
          total_records: number | null
          total_services: number | null
          updated_at: string | null
          validation_summary: Json
          version_number: number
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          reconciliation_summary?: Json
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          rolled_back_from_id?: string | null
          source_checksum?: string | null
          status?: string
          sync_run_id?: string | null
          total_categories?: number | null
          total_countries?: number | null
          total_records?: number | null
          total_services?: number | null
          updated_at?: string | null
          validation_summary?: Json
          version_number: number
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          reconciliation_summary?: Json
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          rolled_back_from_id?: string | null
          source_checksum?: string | null
          status?: string
          sync_run_id?: string | null
          total_categories?: number | null
          total_countries?: number | null
          total_records?: number | null
          total_services?: number | null
          updated_at?: string | null
          validation_summary?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_dataset_versions_rolled_back_from_id_fkey"
            columns: ["rolled_back_from_id"]
            isOneToOne: false
            referencedRelation: "fee_dataset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_services: {
        Row: {
          category_id: string
          created_at: string | null
          deleted_at: string | null
          description: string | null
          display_order: number | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          category_id: string
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "fee_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_sync_checkpoints: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_batch: number
          deleted_at: string | null
          error_count: number | null
          heartbeat_at: string
          id: string
          inserted_count: number | null
          last_activity_at: string
          last_processed_position: number
          last_successful_position: number
          processed_rows: number | null
          recovery_attempts: number
          sheet_name: string
          skipped_count: number | null
          started_at: string | null
          sync_run_id: string
          total_batches: number
          total_rows: number | null
          updated_at: string | null
          updated_count: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_batch: number
          deleted_at?: string | null
          error_count?: number | null
          heartbeat_at?: string
          id?: string
          inserted_count?: number | null
          last_activity_at?: string
          last_processed_position?: number
          last_successful_position?: number
          processed_rows?: number | null
          recovery_attempts?: number
          sheet_name: string
          skipped_count?: number | null
          started_at?: string | null
          sync_run_id: string
          total_batches: number
          total_rows?: number | null
          updated_at?: string | null
          updated_count?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_batch?: number
          deleted_at?: string | null
          error_count?: number | null
          heartbeat_at?: string
          id?: string
          inserted_count?: number | null
          last_activity_at?: string
          last_processed_position?: number
          last_successful_position?: number
          processed_rows?: number | null
          recovery_attempts?: number
          sheet_name?: string
          skipped_count?: number | null
          started_at?: string | null
          sync_run_id?: string
          total_batches?: number
          total_rows?: number | null
          updated_at?: string | null
          updated_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_sync_checkpoints_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "fee_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_sync_errors: {
        Row: {
          attempt_number: number | null
          batch_number: number | null
          created_at: string | null
          deleted_at: string | null
          error_message: string | null
          error_type: string
          id: string
          max_attempts: number | null
          next_retry_at: string | null
          resolved_at: string | null
          retryable: boolean | null
          sheet_name: string | null
          source_row: number | null
          sync_run_id: string
          updated_at: string | null
        }
        Insert: {
          attempt_number?: number | null
          batch_number?: number | null
          created_at?: string | null
          deleted_at?: string | null
          error_message?: string | null
          error_type: string
          id?: string
          max_attempts?: number | null
          next_retry_at?: string | null
          resolved_at?: string | null
          retryable?: boolean | null
          sheet_name?: string | null
          source_row?: number | null
          sync_run_id: string
          updated_at?: string | null
        }
        Update: {
          attempt_number?: number | null
          batch_number?: number | null
          created_at?: string | null
          deleted_at?: string | null
          error_message?: string | null
          error_type?: string
          id?: string
          max_attempts?: number | null
          next_retry_at?: string | null
          resolved_at?: string | null
          retryable?: boolean | null
          sheet_name?: string | null
          source_row?: number | null
          sync_run_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_sync_errors_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "fee_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_sync_locks: {
        Row: {
          acquired_at: string | null
          created_at: string | null
          expires_at: string | null
          heartbeat_at: string | null
          id: string
          owner_user_id: string | null
          released_at: string | null
          sync_run_id: string | null
          updated_at: string | null
        }
        Insert: {
          acquired_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          heartbeat_at?: string | null
          id?: string
          owner_user_id?: string | null
          released_at?: string | null
          sync_run_id?: string | null
          updated_at?: string | null
        }
        Update: {
          acquired_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          heartbeat_at?: string | null
          id?: string
          owner_user_id?: string | null
          released_at?: string | null
          sync_run_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_sync_locks_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "fee_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_sync_logs: {
        Row: {
          batch_number: number | null
          created_at: string | null
          deleted_at: string | null
          event_type: string
          id: string
          message: string | null
          metadata: Json | null
          severity: string | null
          sheet_name: string | null
          source_row: number | null
          sync_run_id: string
        }
        Insert: {
          batch_number?: number | null
          created_at?: string | null
          deleted_at?: string | null
          event_type: string
          id?: string
          message?: string | null
          metadata?: Json | null
          severity?: string | null
          sheet_name?: string | null
          source_row?: number | null
          sync_run_id: string
        }
        Update: {
          batch_number?: number | null
          created_at?: string | null
          deleted_at?: string | null
          event_type?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          severity?: string | null
          sheet_name?: string | null
          source_row?: number | null
          sync_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_sync_logs_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "fee_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_sync_runs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_batch: number | null
          current_operation: string | null
          current_sheet: string | null
          current_stage: string | null
          dataset_version_id: string | null
          deleted_at: string | null
          error_count: number | null
          error_message: string | null
          heartbeat_at: string | null
          id: string
          inserted_count: number | null
          invalid_record_count: number | null
          last_activity_at: string | null
          percentage: number
          processed_rows: number | null
          recovery_attempts: number | null
          sheet_progress: Json
          skipped_count: number | null
          source_record_count: number | null
          started_at: string | null
          started_by: string | null
          status: string
          total_batches: number | null
          total_rows: number | null
          unchanged_count: number | null
          updated_at: string | null
          updated_count: number | null
          valid_record_count: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_batch?: number | null
          current_operation?: string | null
          current_sheet?: string | null
          current_stage?: string | null
          dataset_version_id?: string | null
          deleted_at?: string | null
          error_count?: number | null
          error_message?: string | null
          heartbeat_at?: string | null
          id?: string
          inserted_count?: number | null
          invalid_record_count?: number | null
          last_activity_at?: string | null
          percentage?: number
          processed_rows?: number | null
          recovery_attempts?: number | null
          sheet_progress?: Json
          skipped_count?: number | null
          source_record_count?: number | null
          started_at?: string | null
          started_by?: string | null
          status?: string
          total_batches?: number | null
          total_rows?: number | null
          unchanged_count?: number | null
          updated_at?: string | null
          updated_count?: number | null
          valid_record_count?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_batch?: number | null
          current_operation?: string | null
          current_sheet?: string | null
          current_stage?: string | null
          dataset_version_id?: string | null
          deleted_at?: string | null
          error_count?: number | null
          error_message?: string | null
          heartbeat_at?: string | null
          id?: string
          inserted_count?: number | null
          invalid_record_count?: number | null
          last_activity_at?: string | null
          percentage?: number
          processed_rows?: number | null
          recovery_attempts?: number | null
          sheet_progress?: Json
          skipped_count?: number | null
          source_record_count?: number | null
          started_at?: string | null
          started_by?: string | null
          status?: string
          total_batches?: number | null
          total_rows?: number | null
          unchanged_count?: number | null
          updated_at?: string | null
          updated_count?: number | null
          valid_record_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_sync_runs_dataset_version_id_fkey"
            columns: ["dataset_version_id"]
            isOneToOne: false
            referencedRelation: "fee_dataset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_sync_schedules: {
        Row: {
          consecutive_failures: number | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          enabled: boolean | null
          execution_time: string | null
          frequency: string
          id: string
          last_error: string | null
          last_run_at: string | null
          last_successful_run_at: string | null
          next_scheduled_run_at: string | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          consecutive_failures?: number | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          enabled?: boolean | null
          execution_time?: string | null
          frequency?: string
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_successful_run_at?: string | null
          next_scheduled_run_at?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          consecutive_failures?: number | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          enabled?: boolean | null
          execution_time?: string | null
          frequency?: string
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_successful_run_at?: string | null
          next_scheduled_run_at?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      fee_values: {
        Row: {
          attorney_fee: number | null
          category_id: string
          country_id: string
          created_at: string | null
          currency: string | null
          dataset_version_id: string
          deleted_at: string | null
          id: string
          imported_at: string | null
          official_fee: number | null
          record_key: string | null
          region: string | null
          service_id: string
          source_checksum: string | null
          source_identifier: string | null
          source_row: number | null
          source_sheet: string | null
          source_values: Json
          status: string | null
          total_fee: number | null
          updated_at: string | null
        }
        Insert: {
          attorney_fee?: number | null
          category_id: string
          country_id: string
          created_at?: string | null
          currency?: string | null
          dataset_version_id: string
          deleted_at?: string | null
          id?: string
          imported_at?: string | null
          official_fee?: number | null
          record_key?: string | null
          region?: string | null
          service_id: string
          source_checksum?: string | null
          source_identifier?: string | null
          source_row?: number | null
          source_sheet?: string | null
          source_values?: Json
          status?: string | null
          total_fee?: number | null
          updated_at?: string | null
        }
        Update: {
          attorney_fee?: number | null
          category_id?: string
          country_id?: string
          created_at?: string | null
          currency?: string | null
          dataset_version_id?: string
          deleted_at?: string | null
          id?: string
          imported_at?: string | null
          official_fee?: number | null
          record_key?: string | null
          region?: string | null
          service_id?: string
          source_checksum?: string | null
          source_identifier?: string | null
          source_row?: number | null
          source_sheet?: string | null
          source_values?: Json
          status?: string | null
          total_fee?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_values_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "fee_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_values_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_values_dataset_version_id_fkey"
            columns: ["dataset_version_id"]
            isOneToOne: false
            referencedRelation: "fee_dataset_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_values_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "fee_services"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          expires_at: string
          key: string
          result_snapshot: Json | null
          route: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          key: string
          result_snapshot?: Json | null
          route: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          key?: string
          result_snapshot?: Json | null
          route?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      login_otp_challenges: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          last_sent_at: string
          request_ip: unknown
          resend_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id: string
          last_sent_at?: string
          request_ip?: unknown
          resend_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          last_sent_at?: string
          request_ip?: unknown
          resend_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      news_feed: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          service_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          id?: string
          service_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          service_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_feed_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      news_feed_countries: {
        Row: {
          country_id: string
          news_feed_id: string
        }
        Insert: {
          country_id: string
          news_feed_id: string
        }
        Update: {
          country_id?: string
          news_feed_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_feed_countries_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_feed_countries_news_feed_id_fkey"
            columns: ["news_feed_id"]
            isOneToOne: false
            referencedRelation: "news_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_countries: {
        Row: {
          country_id: string
          notification_id: string
        }
        Insert: {
          country_id: string
          notification_id: string
        }
        Update: {
          country_id?: string
          notification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_countries_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_countries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          document_key: string | null
          document_name: string | null
          document_size: number | null
          document_type: string | null
          id: string
          notification_date: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          document_key?: string | null
          document_name?: string | null
          document_size?: number | null
          document_type?: string | null
          id?: string
          notification_date: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          document_key?: string | null
          document_name?: string | null
          document_size?: number | null
          document_type?: string | null
          id?: string
          notification_date?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      poa_document_countries: {
        Row: {
          country_id: string
          document_id: string
        }
        Insert: {
          country_id: string
          document_id: string
        }
        Update: {
          country_id?: string
          document_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poa_document_countries_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poa_document_countries_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "poa_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      poa_documents: {
        Row: {
          created_at: string
          document_name: string
          id: string
          s3_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_name: string
          id?: string
          s3_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_name?: string
          id?: string
          s3_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      procedures: {
        Row: {
          client_visible: boolean
          color_indication: string
          created_at: string
          deleted_at: string | null
          description: string
          detail_text: string
          id: string
          service_id: string
          updated_at: string
        }
        Insert: {
          client_visible?: boolean
          color_indication: string
          created_at?: string
          deleted_at?: string | null
          description: string
          detail_text: string
          id?: string
          service_id: string
          updated_at?: string
        }
        Update: {
          client_visible?: boolean
          color_indication?: string
          created_at?: string
          deleted_at?: string | null
          description?: string
          detail_text?: string
          id?: string
          service_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedures_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: string
          address: string
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          client_id: string | null
          company_name: string
          created_at: string
          created_by: string | null
          failed_login_attempts: number
          full_name: string | null
          id: string
          last_login_at: string | null
          last_login_ip: unknown
          locked_at: string | null
          logo_url: string | null
          max_devices: number
          phone: string | null
          phone_verified: boolean
          phone_verified_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          role: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_status?: string
          address?: string
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string | null
          company_name?: string
          created_at?: string
          created_by?: string | null
          failed_login_attempts?: number
          full_name?: string | null
          id: string
          last_login_at?: string | null
          last_login_ip?: unknown
          locked_at?: string | null
          logo_url?: string | null
          max_devices?: number
          phone?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_status?: string
          address?: string
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string | null
          company_name?: string
          created_at?: string
          created_by?: string | null
          failed_login_attempts?: number
          full_name?: string | null
          id?: string
          last_login_at?: string | null
          last_login_ip?: unknown
          locked_at?: string | null
          logo_url?: string | null
          max_devices?: number
          phone?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      project_field_definitions: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          deleted_at: string | null
          display_order: number
          field_type: string
          id: string
          label: string
          name: string
          required: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          deleted_at?: string | null
          display_order?: number
          field_type?: string
          id?: string
          label: string
          name: string
          required?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          display_order?: number
          field_type?: string
          id?: string
          label?: string
          name?: string
          required?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      project_field_values: {
        Row: {
          created_at: string
          field_definition_id: string
          project_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          field_definition_id: string
          project_id: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          field_definition_id?: string
          project_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "project_field_values_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "project_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_field_values_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_lifecycle_events: {
        Row: {
          created_at: string
          deleted_at: string | null
          event_type: string
          id: string
          occurred_on: string
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          event_type: string
          id?: string
          occurred_on: string
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          event_type?: string
          id?: string
          occurred_on?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_lifecycle_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_procedures: {
        Row: {
          created_at: string
          procedure_id: string
          project_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          procedure_id: string
          project_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          procedure_id?: string
          project_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_procedures_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_procedures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_timeline_documents: {
        Row: {
          created_at: string
          deleted_at: string | null
          document_name: string
          document_size: number
          document_type: string
          id: string
          object_key: string
          timeline_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          document_name: string
          document_size: number
          document_type: string
          id?: string
          object_key: string
          timeline_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          document_name?: string
          document_size?: number
          document_type?: string
          id?: string
          object_key?: string
          timeline_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_timeline_documents_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "project_timelines"
            referencedColumns: ["id"]
          },
        ]
      }
      project_timelines: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string
          id: string
          procedure_id: string
          project_id: string
          timeline_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description: string
          id?: string
          procedure_id: string
          project_id: string
          timeline_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string
          id?: string
          procedure_id?: string
          project_id?: string
          timeline_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_timelines_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_timelines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          acceptance_date: string | null
          acceptance_number: string | null
          aipt_ref_no: string
          annuity_date: string | null
          annuity_years: number | null
          applicant: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          class_number: number | null
          client_id: string
          client_ref_no: string
          country_id: string
          created_at: string
          created_by: string | null
          deadline_date: string | null
          deleted_at: string | null
          filing_date: string | null
          filing_number: string | null
          id: string
          image_path: string | null
          matter_date: string
          matter_type: string
          opposition_date: string | null
          procedure_id: string
          project_name: string
          register_number: string | null
          registered_date: string | null
          renewal_date: string | null
          service_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          acceptance_date?: string | null
          acceptance_number?: string | null
          aipt_ref_no: string
          annuity_date?: string | null
          annuity_years?: number | null
          applicant?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          class_number?: number | null
          client_id: string
          client_ref_no: string
          country_id: string
          created_at?: string
          created_by?: string | null
          deadline_date?: string | null
          deleted_at?: string | null
          filing_date?: string | null
          filing_number?: string | null
          id?: string
          image_path?: string | null
          matter_date: string
          matter_type: string
          opposition_date?: string | null
          procedure_id: string
          project_name: string
          register_number?: string | null
          registered_date?: string | null
          renewal_date?: string | null
          service_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          acceptance_date?: string | null
          acceptance_number?: string | null
          aipt_ref_no?: string
          annuity_date?: string | null
          annuity_years?: number | null
          applicant?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          class_number?: number | null
          client_id?: string
          client_ref_no?: string
          country_id?: string
          created_at?: string
          created_by?: string | null
          deadline_date?: string | null
          deleted_at?: string | null
          filing_date?: string | null
          filing_number?: string | null
          id?: string
          image_path?: string | null
          matter_date?: string
          matter_type?: string
          opposition_date?: string | null
          procedure_id?: string
          project_name?: string
          register_number?: string | null
          registered_date?: string | null
          renewal_date?: string | null
          service_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          additional_fee_per_class: number
          attorney_fee: number
          category: string
          claiming_priority: boolean
          claiming_priority_fee: number
          class_count: number
          class_numbers: number[]
          class_pricing_rows: Json
          class_type: string | null
          country_id: string
          created_at: string
          fee_value_id: string | null
          id: string
          official_fee: number
          other_fee: number
          procedure_name: string
          quantity: number
          quotation_id: string
          requirement_ids: string[]
          state_country_ids: string[]
          state_fee_total: number
          vat_rate: number
        }
        Insert: {
          additional_fee_per_class?: number
          attorney_fee?: number
          category: string
          claiming_priority?: boolean
          claiming_priority_fee?: number
          class_count?: number
          class_numbers?: number[]
          class_pricing_rows?: Json
          class_type?: string | null
          country_id: string
          created_at?: string
          fee_value_id?: string | null
          id?: string
          official_fee?: number
          other_fee?: number
          procedure_name: string
          quantity?: number
          quotation_id: string
          requirement_ids?: string[]
          state_country_ids?: string[]
          state_fee_total?: number
          vat_rate?: number
        }
        Update: {
          additional_fee_per_class?: number
          attorney_fee?: number
          category?: string
          claiming_priority?: boolean
          claiming_priority_fee?: number
          class_count?: number
          class_numbers?: number[]
          class_pricing_rows?: Json
          class_type?: string | null
          country_id?: string
          created_at?: string
          fee_value_id?: string | null
          id?: string
          official_fee?: number
          other_fee?: number
          procedure_name?: string
          quantity?: number
          quotation_id?: string
          requirement_ids?: string[]
          state_country_ids?: string[]
          state_fee_total?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_fee_value_id_fkey"
            columns: ["fee_value_id"]
            isOneToOne: false
            referencedRelation: "fee_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_reference_counters: {
        Row: {
          category_prefix: string
          next_sequence: number
          reference_year: number
        }
        Insert: {
          category_prefix: string
          next_sequence?: number
          reference_year: number
        }
        Update: {
          category_prefix?: string
          next_sequence?: number
          reference_year?: number
        }
        Relationships: []
      }
      quotations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_id: string
          client_matter_ref: string | null
          created_at: string
          created_by: string
          currency: string
          deleted_at: string | null
          discount: number
          grand_total: number
          id: string
          invoice_date: string
          invoice_verification_token: string
          primary_category: string
          primary_country_id: string
          project_id: string | null
          reference_no: string | null
          spreadsheet_revision: number | null
          status: string
          subject: string
          total_attorney_fee: number
          total_official_fee: number
          total_other_fee: number
          total_vat: number
          updated_at: string
          updated_by: string | null
          vat_rate: number
          vatable: boolean
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          client_matter_ref?: string | null
          created_at?: string
          created_by: string
          currency?: string
          deleted_at?: string | null
          discount?: number
          grand_total?: number
          id?: string
          invoice_date?: string
          invoice_verification_token?: string
          primary_category: string
          primary_country_id: string
          project_id?: string | null
          reference_no?: string | null
          spreadsheet_revision?: number | null
          status?: string
          subject?: string
          total_attorney_fee?: number
          total_official_fee?: number
          total_other_fee?: number
          total_vat?: number
          updated_at?: string
          updated_by?: string | null
          vat_rate?: number
          vatable?: boolean
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          client_matter_ref?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          deleted_at?: string | null
          discount?: number
          grand_total?: number
          id?: string
          invoice_date?: string
          invoice_verification_token?: string
          primary_category?: string
          primary_country_id?: string
          project_id?: string | null
          reference_no?: string | null
          spreadsheet_revision?: number | null
          status?: string
          subject?: string
          total_attorney_fee?: number
          total_official_fee?: number
          total_other_fee?: number
          total_vat?: number
          updated_at?: string
          updated_by?: string | null
          vat_rate?: number
          vatable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "quotations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_primary_country_id_fkey"
            columns: ["primary_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      requirements: {
        Row: {
          client_visible: boolean
          country_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          procedure_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_visible?: boolean
          country_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          id?: string
          procedure_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_visible?: boolean
          country_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          procedure_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requirements_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirements_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          color: string
          created_at: string
          deleted_at: string | null
          id: string
          service: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          service: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          service?: string
          updated_at?: string
        }
        Relationships: []
      }
      spreadsheet_workbook_versions: {
        Row: {
          revision: number
          saved_at: string
          saved_by: string | null
          workbook: Json
        }
        Insert: {
          revision: number
          saved_at?: string
          saved_by?: string | null
          workbook: Json
        }
        Update: {
          revision?: number
          saved_at?: string
          saved_by?: string | null
          workbook?: Json
        }
        Relationships: [
          {
            foreignKeyName: "spreadsheet_workbook_versions_saved_by_fkey"
            columns: ["saved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      spreadsheet_workbooks: {
        Row: {
          id: boolean
          revision: number
          updated_at: string
          updated_by: string | null
          workbook: Json
        }
        Insert: {
          id?: boolean
          revision?: number
          updated_at?: string
          updated_by?: string | null
          workbook: Json
        }
        Update: {
          id?: boolean
          revision?: number
          updated_at?: string
          updated_by?: string | null
          workbook?: Json
        }
        Relationships: [
          {
            foreignKeyName: "spreadsheet_workbooks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      statements: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          document_key: string | null
          document_name: string | null
          document_size: number | null
          document_type: string | null
          id: string
          paid_at: string | null
          paid_by: string | null
          payment_status: string
          statement_date: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          document_key?: string | null
          document_name?: string | null
          document_size?: number | null
          document_type?: string | null
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_status?: string
          statement_date: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          document_key?: string | null
          document_name?: string | null
          document_size?: number | null
          document_type?: string | null
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_status?: string
          statement_date?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "statements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      unblock_requests: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unblock_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unblock_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unblock_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_rates: {
        Row: {
          country_id: string
          created_at: string
          deleted_at: string | null
          id: string
          updated_at: string
          vat: number
        }
        Insert: {
          country_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          updated_at?: string
          vat?: number
        }
        Update: {
          country_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          updated_at?: string
          vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "vat_rates_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: true
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      video_tutorials: {
        Row: {
          card_key: string
          content_type: string
          file_name: string
          file_size: number
          s3_key: string
          storage_path: string | null
          storage_provider: string
          title: string
          updated_at: string
        }
        Insert: {
          card_key: string
          content_type: string
          file_name: string
          file_size: number
          s3_key: string
          storage_path?: string | null
          storage_provider?: string
          title: string
          updated_at?: string
        }
        Update: {
          card_key?: string
          content_type?: string
          file_name?: string
          file_size?: number
          s3_key?: string
          storage_path?: string | null
          storage_provider?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_existing_client_registration: {
        Args: {
          p_administrator_id: string
          p_claim_id: string
          p_email: string
          p_user_id: string
        }
        Returns: string
      }
      client_page_visible: {
        Args: { p_client_id?: string; p_page: string }
        Returns: boolean
      }
      consume_login_otp_challenge: {
        Args: { p_challenge_id: string; p_code_hash: string }
        Returns: string
      }
      dashboard_summary: {
        Args: {
          p_as_of_date: string
          p_month_count: number
          p_recent_page: number
          p_recent_page_size: number
          p_recent_search?: string
        }
        Returns: Json
      }
      edit_pending_client_quotation: {
        Args: {
          p_client_id: string
          p_items: Json
          p_payload: Json
          p_quotation_id: string
        }
        Returns: Json
      }
      find_auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
      list_client_permission_targets: {
        Args: { p_page?: number; p_page_size?: number; p_search?: string }
        Returns: {
          account_status: string
          approval_status: string
          client: Json
          company_name: string
          email: string
          full_name: string
          id: string
          total_count: number
        }[]
      }
      next_quotation_reference: {
        Args: { p_category: string; p_country_id: string }
        Returns: string
      }
      publish_fee_dataset: {
        Args: { p_actor_id: string; p_version_id: string }
        Returns: undefined
      }
      resend_login_otp_challenge: {
        Args: { p_challenge_id: string; p_code_hash: string }
        Returns: Json
      }
      rollback_fee_dataset: {
        Args: { p_actor_id: string; p_version_id: string }
        Returns: undefined
      }
      save_client_permissions: {
        Args: {
          p_actor_id: string
          p_permissions: Json
          p_revision: number
          p_user_id: string
        }
        Returns: number
      }
      save_poa_document: {
        Args: {
          p_country_ids: string[]
          p_document_name: string
          p_id: string
          p_s3_key: string
        }
        Returns: string
      }
      save_shared_spreadsheet: {
        Args: { p_expected_revision: number; p_workbook: Json }
        Returns: number
      }
      update_customer_service_ticket_status: {
        Args: {
          p_actor_id: string
          p_note?: string
          p_status: string
          p_ticket_id: string
        }
        Returns: {
          category: string
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          priority: string
          status: string
          subject: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "customer_service_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

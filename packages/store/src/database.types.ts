// Generated from the live schema (Supabase type generator). Do not edit by hand:
// regenerate with `pnpm db:types` after a migration.

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          id: number
          payload: Json
          project_id: string | null
          target_id: string
          target_table: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          id?: never
          payload?: Json
          project_id?: string | null
          target_id: string
          target_table: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          id?: never
          payload?: Json
          project_id?: string | null
          target_id?: string
          target_table?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          git_branch: string | null
          id: string
          name: string
          project_id: string
          status: string
        }
        Insert: {
          git_branch?: string | null
          name: string
          project_id: string
        }
        Update: never
        Relationships: []
      }
      claim_checks: {
        Row: {
          claim_id: string
          created_at: string
          model: string
          project_id: string
          reason: string
          target_id: string | null
          verdict: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      claims: {
        Row: {
          details: string | null
          links: string[] | null
          rationale: string | null
          branch_id: string | null
          confidence: number | null
          created_at: string
          embedding: string | null
          embedding_model: string | null
          fts: unknown
          id: string
          project_id: string
          source_id: string
          status: string
          superseded_by: string | null
          text: string
          type: string
        }
        Insert: {
          details?: string | null
          links?: string[] | null
          rationale?: string | null
          branch_id?: string | null
          confidence?: number | null
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          fts?: unknown
          id?: string
          project_id: string
          source_id: string
          status?: string
          superseded_by?: string | null
          text: string
          type: string
        }
        Update: {
          details?: string | null
          links?: string[] | null
          rationale?: string | null
          branch_id?: string | null
          confidence?: number | null
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          fts?: unknown
          id?: string
          project_id?: string
          source_id?: string
          status?: string
          superseded_by?: string | null
          text?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_source_fk"
            columns: ["project_id", "source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "claims_superseded_by_fk"
            columns: ["project_id", "superseded_by"]
            isOneToOne: false
            referencedRelation: "claim_view"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "claims_superseded_by_fk"
            columns: ["project_id", "superseded_by"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["project_id", "id"]
          },
        ]
      }
      conflicts: {
        Row: {
          claim_a: string
          claim_b: string
          created_at: string
          id: string
          project_id: string
          reason: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          claim_a: string
          claim_b: string
          created_at?: string
          id?: string
          project_id: string
          reason?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          claim_a?: string
          claim_b?: string
          created_at?: string
          id?: string
          project_id?: string
          reason?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "conflicts_project_id_claim_a_fkey"
            columns: ["project_id", "claim_a"]
            isOneToOne: false
            referencedRelation: "claim_view"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "conflicts_project_id_claim_a_fkey"
            columns: ["project_id", "claim_a"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "conflicts_project_id_claim_b_fkey"
            columns: ["project_id", "claim_b"]
            isOneToOne: false
            referencedRelation: "claim_view"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "conflicts_project_id_claim_b_fkey"
            columns: ["project_id", "claim_b"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "conflicts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          owner_id: string | null
          project_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id?: string | null
          project_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string | null
          project_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      edges: {
        Row: {
          actor_id: string | null
          created_at: string
          created_by: string
          from_claim: string
          id: string
          project_id: string
          reason: string
          to_claim: string
          type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          created_by: string
          from_claim: string
          id?: string
          project_id: string
          reason: string
          to_claim: string
          type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          created_by?: string
          from_claim?: string
          id?: string
          project_id?: string
          reason?: string
          to_claim?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "edges_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edges_project_id_from_claim_fkey"
            columns: ["project_id", "from_claim"]
            isOneToOne: false
            referencedRelation: "claim_view"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "edges_project_id_from_claim_fkey"
            columns: ["project_id", "from_claim"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "edges_project_id_to_claim_fkey"
            columns: ["project_id", "to_claim"]
            isOneToOne: false
            referencedRelation: "claim_view"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "edges_project_id_to_claim_fkey"
            columns: ["project_id", "to_claim"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["project_id", "id"]
          },
        ]
      }
      handoff_claims: {
        Row: {
          claim_id: string
          handoff_id: string
          position: number
          project_id: string
        }
        Insert: {
          claim_id: string
          handoff_id: string
          position: number
          project_id: string
        }
        Update: never
        Relationships: []
      }
      handoffs: {
        Row: {
          area: string | null
          created_at: string
          id: string
          links: Json
          next_steps: string[]
          project_id: string
          recipient: string | null
          source_id: string
          summary: string
          title: string
        }
        Insert: {
          area?: string | null
          created_at?: string
          id?: string
          links?: Json
          next_steps?: string[]
          project_id: string
          recipient?: string | null
          source_id: string
          summary: string
          title: string
        }
        Update: never
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          role: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          role: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          role?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_id: string | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          model: string | null
          project_id: string
          role: string
        }
        Insert: {
          author_id?: string | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          model?: string | null
          project_id: string
          role: string
        }
        Update: {
          author_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          model?: string | null
          project_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_project_id_conversation_id_fkey"
            columns: ["project_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["project_id", "id"]
          },
        ]
      }
      profiles: {
        Row: { auto_save: string; created_at: string; display_name: string; updated_at: string; user_id: string }
        Insert: { created_at?: string; display_name: string; updated_at?: string; user_id: string }
        Update: { auto_save?: string; created_at?: string; display_name?: string; updated_at?: string; user_id?: string }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          author_id: string | null
          author_label: string
          client: string
          client_id: string | null
          created_at: string
          id: string
          model: string
          project_id: string
          raw_payload: Json
        }
        Insert: {
          author_id?: string | null
          author_label: string
          client: string
          client_id?: string | null
          created_at?: string
          id?: string
          model: string
          project_id: string
          raw_payload: Json
        }
        Update: {
          author_id?: string | null
          author_label?: string
          client?: string
          client_id?: string | null
          created_at?: string
          id?: string
          model?: string
          project_id?: string
          raw_payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      branch_claim_view: {
        Row: {
          details: string | null
          links: string[] | null
          rationale: string | null
          auto_saved: boolean | null
          author_id: string | null
          author_label: string | null
          branch_id: string | null
          branch_name: string | null
          branch_status: string | null
          client: string | null
          confidence: number | null
          created_at: string | null
          id: string | null
          model: string | null
          project_id: string | null
          recorded_at: string | null
          source_id: string | null
          status: string | null
          superseded_by: string | null
          text: string | null
          type: string | null
        }
        Relationships: []
      }
      claim_view: {
        Row: {
          details: string | null
          links: string[] | null
          rationale: string | null
          auto_saved: boolean | null
          author_id: string | null
          branch_id: string | null
          author_label: string | null
          client: string | null
          confidence: number | null
          created_at: string | null
          id: string | null
          model: string | null
          project_id: string | null
          recorded_at: string | null
          source_id: string | null
          status: string | null
          superseded_by: string | null
          text: string | null
          type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_source_fk"
            columns: ["project_id", "source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "claims_superseded_by_fk"
            columns: ["project_id", "superseded_by"]
            isOneToOne: false
            referencedRelation: "claim_view"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "claims_superseded_by_fk"
            columns: ["project_id", "superseded_by"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["project_id", "id"]
          },
        ]
      }
    }
    Functions: {
      abandon_branch: {
        Args: { p_name: string; p_project_id: string }
        Returns: string
      }
      create_handoff: {
        Args: {
          p_area: string
          p_author_label: string
          p_claims: Json
          p_client: string
          p_client_id: string
          p_links: Json
          p_model: string
          p_next_steps: string[]
          p_project_id: string
          p_raw_payload: Json
          p_recipient: string
          p_summary: string
          p_title: string
        }
        Returns: {
          claim_id: string
          claim_text: string
          handoff_id: string
        }[]
      }
      create_workspace: { Args: { p_name: string }; Returns: string }
      ingest_claims: {
        Args: {
          p_author_label: string
          p_claims: Json
          p_client: string
          p_client_id: string
          p_model: string
          p_project_id: string
          p_raw_payload: Json
          p_branch?: string
          p_git_branch?: string
        }
        Returns: {
          id: string
          text: string
        }[]
      }
      invite_member: {
        Args: { p_email: string; p_role: string; p_workspace_id: string }
        Returns: string
      }
      resolve_conflict: {
        Args: { p_conflict: string; p_keep: string | null; p_note?: string }
        Returns: undefined
      }
      merge_branch: {
        Args: { p_name: string; p_project_id: string }
        Returns: {
          branch_id: string
          claims_sent: number
        }[]
      }
      retire_claim: {
        Args: { p_claim: string; p_reason: string }
        Returns: undefined
      }
      search_claims: {
        Args: {
          p_author_id?: string
          p_embedding?: string
          p_embedding_model?: string
          p_limit?: number
          p_model?: string
          p_project_id: string
          p_query: string
          p_since?: string
          p_statuses?: string[]
          p_types?: string[]
        }
        Returns: {
          author_id: string
          author_label: string
          client: string
          confidence: number
          created_at: string
          id: string
          matched_by: string
          model: string
          project_id: string
          recorded_at: string
          score: number
          source_id: string
          status: string
          superseded_by: string
          text: string
          type: string
        }[]
      }
      workspace_members: {
        Args: { p_workspace_id: string }
        Returns: {
          created_at: string
          email: string
          role: string
          user_id: string
        }[]
      }
      supersede_claim: {
        Args: { p_new_claim: string; p_old_claim: string; p_reason: string }
        Returns: undefined
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

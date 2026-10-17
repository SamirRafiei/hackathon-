/** Hand-maintained, incomplete schema subset for account setup and private evidence reads. Not generated database types. */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type AgreementState =
  | "draft"
  | "awaiting_acceptance"
  | "awaiting_funding"
  | "ready_for_handover"
  | "active"
  | "return_requested"
  | "inspecting"
  | "disputed"
  | "settling"
  | "completed"
  | "cancelling"
  | "cancelled";

export type Database = {
  public: {
    Tables: {
      evidence_files: Table<{
        id: string;
        agreement_id: string;
        uploader_id: string;
        actual_participant_id: string | null;
        phase: "item" | "collection" | "return" | "dispute";
        exchange_event_id: string | null;
        dispute_id: string | null;
        case_id: string | null;
        bucket_id: "pact-evidence";
        object_path: string;
        mime_type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
        size_bytes: number;
        sha256: string;
        caption: string | null;
        created_at: string;
        submitted_at: string | null;
      }>;
      agreements: Table<{
        id: string;
        owner_id: string;
        currency: "EUR" | "USD" | "GBP";
        state: AgreementState;
        current_version_id: string | null;
        revision: number;
        created_at: string;
        updated_at: string;
      }>;
      agreement_versions: Table<{
        id: string;
        agreement_id: string;
        owner_id: string;
        version_number: number;
        currency: "EUR" | "USD" | "GBP";
        deposit_minor: number;
        item_name: string;
        item_description: string;
        terms: string;
        starts_at: string;
        due_at: string;
        published_at: string;
      }>;
      participants: Table<{
        id: string;
        agreement_id: string;
        user_id: string | null;
        email: string;
        share_bps: number;
        allocated_minor: number;
        joined_at: string | null;
        removed_at: string | null;
      }>;
      acceptances: Table<{
        agreement_id: string;
        version_id: string;
        actor_id: string;
        accepted_at: string;
      }>;
      profiles: Table<{
        id: string;
        display_name: string;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      ensure_profile: {
        Args: { p_display_name?: string | null };
        Returns: Json;
      };
      create_agreement: { Args: { p_input: Json }; Returns: Json };
      claim_invitation: { Args: { p_input: Json }; Returns: Json };
      accept_agreement_version: { Args: { p_input: Json }; Returns: Json };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

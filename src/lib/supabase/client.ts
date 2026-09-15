import { getSupabaseBrowserClient, isSupabaseConfigured as configured } from "../supabase-client";

export const isSupabaseConfigured = configured();
export const getSupabaseClient = getSupabaseBrowserClient;

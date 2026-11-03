export type ReplyStatus = 'ok' | 'unavailable' | 'offline';

export interface ChatReply {
  text: string;
  status: ReplyStatus;
  intent: string;
  language: 'en' | 'hi' | 'mr';
  sources: string[];
  data: Record<string, unknown>;
  /** unvalidated: the app validates every entry before running it */
  actions: unknown[];
  used_llm: boolean;
  followup: boolean;
}

export interface ChatPayload {
  session_id: string;
  session_token?: string;
  reply: ChatReply;
}

/** What the browser tells AeroSage about the screen. Unverified on the server: it only fills a default station or pollutant. */
export interface UiContext {
  selected_region?: string;
  pollutant?: string;
  section?: string;
  map_location?: { lat: number; lon: number };
}

export interface Health {
  status: 'ok';
  service: 'aerosage';
  llm_configured: boolean;
  model_api: 'online' | 'offline';
}

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  status?: ReplyStatus;
  sources?: string[];
  /** validated actions waiting for the person's confirmation */
  pending?: import('./aeromatrixActions').Action[];
  /** outcomes of actions that already ran */
  outcomes?: { label: string; ok: boolean; message: string }[];
  streaming?: boolean;
  failed?: boolean;
  language?: 'en' | 'hi' | 'mr';
}

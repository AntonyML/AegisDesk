interface Env {
  TEST_MIGRATIONS?: Array<{ name: string; queries: string[] }>;
  STATE_PRIVATE_KEY?: string;
  STATE_KEY_ID?: string;
  TURNSTILE_SECRET?: string;
  RESEND_API_KEY?: string;
  NOTIFY_FROM?: string;
  NOTIFY_DESTINATION?: string;
  TICKET_RATE_LIMIT?: {
    limit: (input: { key: string }) => Promise<{ success: boolean }>;
  };
}

declare module "cloudflare:workers" {
  interface ProvidedEnv extends Env {}
}

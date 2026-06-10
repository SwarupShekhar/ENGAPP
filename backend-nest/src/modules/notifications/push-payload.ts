export interface PushPayload {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export interface SendResult {
  token: string;
  success: boolean;
  error?: string;
  invalidToken?: boolean;
}

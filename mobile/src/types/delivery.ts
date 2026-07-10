export type DeliveryInsightSeverity = "info" | "tip" | "focus";

export type DeliveryInsightId =
  | "expressiveness"
  | "pauses"
  | "energy"
  | "hesitation"
  | "pace";

export interface DeliveryInsight {
  id: DeliveryInsightId | string;
  label: string;
  severity: DeliveryInsightSeverity;
  message: string;
  feature_value?: number;
}

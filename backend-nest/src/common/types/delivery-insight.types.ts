export type DeliveryInsightDto = {
  id: string;
  label: string;
  severity: 'info' | 'tip' | 'focus';
  message: string;
  feature_value?: number;
};

export type SessionEnrichment = {
  deliveryInsights?: DeliveryInsightDto[] | null;
};

export function hasDeliveryInsights(
  enrichment?: SessionEnrichment | null,
): enrichment is SessionEnrichment & { deliveryInsights: DeliveryInsightDto[] } {
  return (
    Array.isArray(enrichment?.deliveryInsights) &&
    enrichment.deliveryInsights.length > 0
  );
}

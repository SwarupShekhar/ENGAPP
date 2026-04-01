export interface BookingSlot {
  id: string;
  tutorName: string;
  tutorAvatar?: string;
  startTime: string;
  endTime: string;
  creditsRequired: number;
}

export interface BookingPayload {
  slotId: string;
  tutorId?: string;
  startTime: string;
}

export interface BookingResult {
  success: boolean;
  bookingId?: string;
  message?: string;
  noCredits?: boolean;
}

import { client } from "../englivoClient";
import { BookingResult, BookingSlot } from "../../types/session";

export async function getAvailableSlots(): Promise<BookingSlot[]> {
  const r = await client.get<any>("/api/sessions/slots");
  const raw = r.data;
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.slots)) return raw.slots;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

export async function bookTutorSlot(payload: any): Promise<BookingResult> {
  const r = await client.post<BookingResult>("/api/sessions/book", payload);
  return r.data;
}

import { client } from "./client";
import { BookingSlot, BookingResult } from "../types/session";

export async function getAvailableSlots(): Promise<BookingSlot[]> {
  try {
    const r = await client.get<any>("/api/sessions/slots");
    const raw = r.data;
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.slots)) return raw.slots;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
  } catch (e) {
    console.error("[Englivo API] getAvailableSlots failed:", e);
    throw e;
  }
}

export async function bookTutorSlot(payload: any): Promise<BookingResult> {
  try {
    const r = await client.post<BookingResult>("/api/sessions/book", payload);
    return r.data;
  } catch (e) {
    console.error("[Englivo API] bookTutorSlot failed:", e);
    throw e;
  }
}

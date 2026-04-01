import { client } from "./client";
import { BookingPayload, BookingResult } from "../types/session";

export const bookSession = (payload: BookingPayload): Promise<BookingResult> =>
  client.post<BookingResult>("/api/sessions/book", payload).then((r) => r.data);

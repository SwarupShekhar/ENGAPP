import { Platform } from "react-native";

export type LocalNotificationPayload = Record<string, unknown>;

/** Must match `channelId` in backend-nest FcmService Android config. */
export const ENGLIVO_NOTIFICATION_CHANNEL_ID = "englivo_default";

let channelReady = false;
let foregroundPressHandler: ((data: LocalNotificationPayload) => void) | null =
  null;

function stringifyData(data: LocalNotificationPayload): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return out;
}

async function getNotifee() {
  if (Platform.OS === "web") return null;
  try {
    return await import("@notifee/react-native");
  } catch {
    return null;
  }
}

export function registerNotifeePressHandler(
  handler: (data: LocalNotificationPayload) => void,
): void {
  foregroundPressHandler = handler;
}

export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android" || channelReady) return;

  const notifee = await getNotifee();
  if (!notifee) return;

  await notifee.default.createChannel({
    id: ENGLIVO_NOTIFICATION_CHANNEL_ID,
    name: "Englivo notifications",
    description: "Calls, matches, messages, and practice reminders",
    importance: notifee.AndroidImportance.HIGH,
    sound: "default",
  });
  channelReady = true;
}

export async function displayForegroundNotification(
  payload: LocalNotificationPayload,
): Promise<void> {
  if (Platform.OS === "web") return;

  const notifee = await getNotifee();
  if (!notifee) return;

  await ensureNotificationChannel();

  const title = String(payload.title ?? "Englivo");
  const body = String(payload.body ?? payload.message ?? "").trim();
  const data = stringifyData(payload);

  await notifee.default.displayNotification({
    title,
    body: body || "You have a new notification",
    data,
    android: {
      channelId: ENGLIVO_NOTIFICATION_CHANNEL_ID,
      pressAction: { id: "default" },
    },
  });
}

export async function setupNotifeeForegroundPressHandling(): Promise<void> {
  if (Platform.OS === "web") return;

  const notifee = await getNotifee();
  if (!notifee) return;

  notifee.default.onForegroundEvent(({ type, detail }) => {
    if (type !== notifee.EventType.PRESS) return;
    const raw = detail.notification?.data;
    if (!raw || !foregroundPressHandler) return;
    foregroundPressHandler(raw as LocalNotificationPayload);
  });
}

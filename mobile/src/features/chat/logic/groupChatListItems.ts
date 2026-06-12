export const RUN_GAP_MS = 5 * 60 * 1000;

export interface ChatMessage {
  id: string;
  content: string;
  type: string;
  senderId: string;
  sender: { id: string; name: string; profileImage: string | null };
  createdAt: string;
  readBy?: string[];
  metadata?: any;
}

export type RunItem = {
  kind: "run";
  id: string;
  isMine: boolean;
  messages: ChatMessage[];
  clusterTime: string;
  showReadReceipt: boolean;
};

export type ChatListItem =
  | { kind: "date"; id: string; label: string }
  | { kind: "system"; id: string; content: string }
  | { kind: "call_invite"; id: string; message: ChatMessage }
  | RunItem;

function formatDateSeparator(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMsg = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfMsg.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

interface GroupOptions {
  partnerId: string;
  runGapMs?: number;
}

export function groupChatListItems(
  messages: ChatMessage[],
  { partnerId, runGapMs = RUN_GAP_MS }: GroupOptions
): ChatListItem[] {
  if (messages.length === 0) return [];

  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const result: ChatListItem[] = [];
  let lastDay = "";
  let currentRun: ChatMessage[] | null = null;
  let currentRunSender = "";
  let currentRunIsMine = false;

  const flushRun = () => {
    if (!currentRun || currentRun.length === 0) return;
    const last = currentRun[currentRun.length - 1];
    const showReadReceipt = currentRunIsMine && !!last.readBy?.includes(partnerId);
    result.push({
      kind: "run",
      id: `${currentRun[0].id}-run`,
      isMine: currentRunIsMine,
      messages: currentRun,
      clusterTime: last.createdAt,
      showReadReceipt,
    });
    currentRun = null;
    currentRunSender = "";
  };

  for (const msg of sorted) {
    const day = new Date(msg.createdAt).toDateString();
    if (day !== lastDay) {
      flushRun();
      result.push({
        kind: "date",
        id: `date-${day}`,
        label: formatDateSeparator(msg.createdAt),
      });
      lastDay = day;
    }

    if (msg.type === "system") {
      flushRun();
      result.push({ kind: "system", id: msg.id, content: msg.content });
      continue;
    }

    if (msg.type === "call_invite") {
      flushRun();
      result.push({ kind: "call_invite", id: msg.id, message: msg });
      continue;
    }

    const isMine = msg.senderId !== partnerId;
    const prevInRun = currentRun?.[currentRun.length - 1];
    const timeDiff = prevInRun
      ? new Date(msg.createdAt).getTime() - new Date(prevInRun.createdAt).getTime()
      : Infinity;

    const shouldStartNew =
      !currentRun ||
      msg.senderId !== currentRunSender ||
      timeDiff >= runGapMs;

    if (shouldStartNew) {
      flushRun();
      currentRun = [msg];
      currentRunSender = msg.senderId;
      currentRunIsMine = isMine;
    } else {
      currentRun!.push(msg);
    }
  }

  flushRun();
  return result;
}

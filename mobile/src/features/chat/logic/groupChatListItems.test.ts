import { groupChatListItems, ChatMessage, RUN_GAP_MS } from "./groupChatListItems";

const partnerId = "partner";

function msg(
  id: string,
  senderId: string,
  createdAt: string,
  type = "text",
  extra: Partial<ChatMessage> = {}
): ChatMessage {
  return {
    id,
    content: `msg-${id}`,
    type,
    senderId,
    sender: { id: senderId, name: senderId, profileImage: null },
    createdAt,
    ...extra,
  };
}

const opts = { partnerId };

// Base date: 2024-01-15T12:00:00Z
const T = (offsetMs: number) =>
  new Date(new Date("2024-01-15T12:00:00Z").getTime() + offsetMs).toISOString();

const DAY2 = (offsetMs = 0) =>
  new Date(new Date("2024-01-16T12:00:00Z").getTime() + offsetMs).toISOString();

describe("groupChatListItems", () => {
  test("1. empty array → []", () => {
    expect(groupChatListItems([], opts)).toEqual([]);
  });

  test("2. single text from me → one run, isMine: true", () => {
    const result = groupChatListItems([msg("1", "me", T(0))], opts);
    const runs = result.filter((i) => i.kind === "run");
    expect(runs).toHaveLength(1);
    if (runs[0].kind === "run") {
      expect(runs[0].isMine).toBe(true);
      expect(runs[0].messages).toHaveLength(1);
    }
  });

  test("3. single text from partner → one run, isMine: false", () => {
    const result = groupChatListItems([msg("1", "partner", T(0))], opts);
    const runs = result.filter((i) => i.kind === "run");
    expect(runs).toHaveLength(1);
    if (runs[0].kind === "run") {
      expect(runs[0].isMine).toBe(false);
    }
  });

  test("4. same sender, 2 messages 1 min apart → one run, 2 messages", () => {
    const msgs = [
      msg("1", "me", T(0)),
      msg("2", "me", T(60_000)),
    ];
    const result = groupChatListItems(msgs, opts);
    const runs = result.filter((i) => i.kind === "run");
    expect(runs).toHaveLength(1);
    if (runs[0].kind === "run") {
      expect(runs[0].messages).toHaveLength(2);
    }
  });

  test("5. same sender, 6 min apart → two runs", () => {
    const msgs = [
      msg("1", "me", T(0)),
      msg("2", "me", T(6 * 60_000)),
    ];
    const result = groupChatListItems(msgs, opts);
    const runs = result.filter((i) => i.kind === "run");
    expect(runs).toHaveLength(2);
  });

  test("6. alternating senders → two runs (1 msg each)", () => {
    const msgs = [
      msg("1", "me", T(0)),
      msg("2", "partner", T(60_000)),
    ];
    const result = groupChatListItems(msgs, opts);
    const runs = result.filter((i) => i.kind === "run");
    expect(runs).toHaveLength(2);
    if (runs[0].kind === "run") expect(runs[0].messages).toHaveLength(1);
    if (runs[1].kind === "run") expect(runs[1].messages).toHaveLength(1);
  });

  test("7. three messages same sender 1 min gaps → one run, 3 messages", () => {
    const msgs = [
      msg("1", "me", T(0)),
      msg("2", "me", T(60_000)),
      msg("3", "me", T(120_000)),
    ];
    const result = groupChatListItems(msgs, opts);
    const runs = result.filter((i) => i.kind === "run");
    expect(runs).toHaveLength(1);
    if (runs[0].kind === "run") {
      expect(runs[0].messages).toHaveLength(3);
    }
  });

  test("8. messages on two calendar days → date item between runs", () => {
    const msgs = [
      msg("1", "me", T(0)),
      msg("2", "me", DAY2()),
    ];
    const result = groupChatListItems(msgs, opts);
    const kinds = result.map((i) => i.kind);
    expect(kinds).toContain("date");
    const dateItems = result.filter((i) => i.kind === "date");
    expect(dateItems).toHaveLength(2); // one per day
    const runs = result.filter((i) => i.kind === "run");
    expect(runs).toHaveLength(2);
  });

  test("9. system between two texts same sender → system standalone; texts not in same run", () => {
    const msgs = [
      msg("1", "me", T(0)),
      msg("sys", "system", T(30_000), "system"),
      msg("2", "me", T(60_000)),
    ];
    const result = groupChatListItems(msgs, opts);
    const kinds = result.map((i) => i.kind);
    expect(kinds).toContain("system");
    const runs = result.filter((i) => i.kind === "run");
    expect(runs).toHaveLength(2);
  });

  test("10. reel_share + text same sender < 5 min → one run with both", () => {
    const msgs = [
      msg("1", "me", T(0), "reel_share", { metadata: { strapiReelId: "r1" } }),
      msg("2", "me", T(60_000), "text"),
    ];
    const result = groupChatListItems(msgs, opts);
    const runs = result.filter((i) => i.kind === "run");
    expect(runs).toHaveLength(1);
    if (runs[0].kind === "run") {
      expect(runs[0].messages).toHaveLength(2);
    }
  });

  test("11. call_invite → standalone call_invite, not in run", () => {
    const msgs = [
      msg("1", "me", T(0), "call_invite"),
    ];
    const result = groupChatListItems(msgs, opts);
    const callItems = result.filter((i) => i.kind === "call_invite");
    expect(callItems).toHaveLength(1);
    const runs = result.filter((i) => i.kind === "run");
    expect(runs).toHaveLength(0);
  });

  test("12. outgoing run, last msg readBy includes partner → showReadReceipt: true", () => {
    const msgs = [
      msg("1", "me", T(0), "text", { readBy: [partnerId] }),
    ];
    const result = groupChatListItems(msgs, opts);
    const runs = result.filter((i) => i.kind === "run");
    if (runs[0].kind === "run") {
      expect(runs[0].showReadReceipt).toBe(true);
    }
  });

  test("13. outgoing run, not read → showReadReceipt: false", () => {
    const msgs = [
      msg("1", "me", T(0), "text", { readBy: [] }),
    ];
    const result = groupChatListItems(msgs, opts);
    const runs = result.filter((i) => i.kind === "run");
    if (runs[0].kind === "run") {
      expect(runs[0].showReadReceipt).toBe(false);
    }
  });

  test("14. incoming run → showReadReceipt: false always", () => {
    const msgs = [
      msg("1", "partner", T(0), "text", { readBy: ["me"] }),
    ];
    const result = groupChatListItems(msgs, opts);
    const runs = result.filter((i) => i.kind === "run");
    if (runs[0].kind === "run") {
      expect(runs[0].showReadReceipt).toBe(false);
    }
  });
});

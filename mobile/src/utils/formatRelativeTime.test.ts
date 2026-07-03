import { formatRelativeTime } from "./formatRelativeTime";

describe("formatRelativeTime", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-03T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns just now for recent timestamps", () => {
    expect(formatRelativeTime("2026-07-03T11:59:30.000Z")).toBe("just now");
  });

  it("returns minutes ago", () => {
    expect(formatRelativeTime("2026-07-03T11:30:00.000Z")).toBe("30m ago");
  });

  it("returns hours ago", () => {
    expect(formatRelativeTime("2026-07-03T08:00:00.000Z")).toBe("4h ago");
  });

  it("returns days ago", () => {
    expect(formatRelativeTime("2026-07-01T12:00:00.000Z")).toBe("2d ago");
  });
});

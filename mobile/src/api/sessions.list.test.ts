import { unwrapSessionsListResponse } from "./sessions";

describe("sessions list response", () => {
  it("accepts legacy array", () => {
    expect(unwrapSessionsListResponse([{ id: "a" }])).toEqual([{ id: "a" }]);
  });

  it("accepts paginated envelope", () => {
    expect(
      unwrapSessionsListResponse({
        items: [{ id: "b" }],
        nextCursor: "x",
        hasMore: true,
      }),
    ).toEqual([{ id: "b" }]);
  });
});

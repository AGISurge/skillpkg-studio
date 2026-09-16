import { getMasonryRowSpan } from "./useMasonryGrid";

describe("getMasonryRowSpan", () => {
  it("reserves the measured card height and the vertical gutter", () => {
    expect(getMasonryRowSpan(100 + 16, 1, 0)).toBe(116);
    expect(getMasonryRowSpan(153.4 + 16, 1, 0)).toBe(170);
  });

  it("never returns an empty grid span", () => {
    expect(getMasonryRowSpan(0, 1, 0)).toBe(1);
  });
});

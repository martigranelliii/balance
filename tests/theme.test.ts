import { describe, expect, it } from "vitest";
import { THEME_COLORS, THEME_OPTIONS } from "../lib/theme";

describe("theme options", () => {
  it("keeps the original palette selectable together with the new themes", () => {
    expect(THEME_OPTIONS.map((option) => option.id)).toEqual([
      "classic",
      "sage",
      "rose",
      "minimal",
    ]);
    expect(Object.keys(THEME_COLORS)).toEqual([
      "classic",
      "sage",
      "rose",
      "minimal",
    ]);
  });
});

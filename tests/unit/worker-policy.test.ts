import { describe, expect, it } from "vitest";
import { backoff, shouldMarkDead } from "../../scripts/worker.mjs";

describe("worker retry policy", () => {
  it("applies exponential backoff with 60-second cap", () => {
    expect(backoff(1)).toBe(2);
    expect(backoff(2)).toBe(4);
    expect(backoff(6)).toBe(60);
    expect(backoff(12)).toBe(60);
  });

  it("marks a job dead only when attempts reach max_attempts", () => {
    expect(shouldMarkDead({ attempts: 2, max_attempts: 5 })).toBe(false);
    expect(shouldMarkDead({ attempts: 5, max_attempts: 5 })).toBe(true);
    expect(shouldMarkDead({ attempts: 7, max_attempts: 5 })).toBe(true);
  });
});

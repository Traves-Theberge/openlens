import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { debounce } from "../../src/util/debounce";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("debounce", () => {
  it("delays execution until after the wait period", async () => {
    let callCount = 0;
    const debounced = debounce(() => { callCount++; }, 50);

    debounced();
    expect(callCount).toBe(0);

    await sleep(80);
    expect(callCount).toBe(1);
  });

  it("only executes the last call when called multiple times rapidly", async () => {
    const calls: number[] = [];
    const debounced = debounce((n: number) => { calls.push(n); }, 50);

    debounced(1);
    debounced(2);
    debounced(3);

    await sleep(80);
    expect(calls).toEqual([3]);
  });

  it("cancels pending execution", async () => {
    let callCount = 0;
    const debounced = debounce(() => { callCount++; }, 50);

    debounced();
    debounced.cancel();

    await sleep(80);
    expect(callCount).toBe(0);
  });

  it("forwards arguments correctly", async () => {
    let result: [string, number] | undefined;
    const debounced = debounce((a: string, b: number) => { result = [a, b]; }, 50);

    debounced("hello", 42);

    await sleep(80);
    expect(result).toEqual(["hello", 42]);
  });

  it("resets the timer on subsequent calls", async () => {
    let callCount = 0;
    const debounced = debounce(() => { callCount++; }, 50);

    debounced();
    await sleep(30);
    debounced(); // reset timer
    await sleep(30);
    // 60ms total but only 30ms since last call — should not have fired yet
    expect(callCount).toBe(0);

    await sleep(40);
    expect(callCount).toBe(1);
  });
});

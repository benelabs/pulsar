import { afterEach, describe, expect, it, vi } from "vitest";

const originalLogLevel = process.env.LOG_LEVEL;

async function loadLogger(logLevel?: string) {
  if (logLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = logLevel;
  }

  vi.resetModules();
  const module = await import("../../src/logger.js");
  return module.default;
}

afterEach(() => {
  if (originalLogLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = originalLogLevel;
  }
});

describe("logger", () => {
  it("uses trace level when configured", async () => {
    const logger = await loadLogger("trace");
    expect(logger.level).toBe("trace");
  });

  it("defaults to info when LOG_LEVEL is unset", async () => {
    const logger = await loadLogger(undefined);
    expect(logger.level).toBe("info");
  });
});

import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  createTask,
  getTask,
  resetLedgerForTests,
  updateTask,
} from "../ledger/store";
import { resetAuditForTests } from "../security/audit";
import { runLiveStep } from "./live";

describe("live agent adapter", () => {
  const prevKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    resetLedgerForTests();
    resetAuditForTests();
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
    resetLedgerForTests();
  });

  it("reports live unverified when OPENAI_API_KEY is missing (fixture remains usable)", async () => {
    const owner = "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr";
    const task = createTask({
      prompt: "Research weather",
      budgetBaseUnits: "1000000",
      ownerWallet: owner,
      mode: "live",
    });
    const result = await runLiveStep(task.id, owner);
    assert.equal(result.mode, "live");
    assert.equal(result.verified, false);
    assert.match(result.message, /OPENAI_API_KEY/);
    assert.ok(result.blocker);
  });

  it("rejects live step for non-owner wallet", async () => {
    const task = createTask({
      prompt: "Research weather",
      budgetBaseUnits: "1000000",
      ownerWallet: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
      mode: "live",
    });
    await assert.rejects(
      () => runLiveStep(task.id, "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"),
      /Forbidden/,
    );
  });

  it("persists pause progress and reports still awaiting approval", async () => {
    process.env.OPENAI_API_KEY = "sk-test-not-used-on-paused-resume";
    const owner = "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr";
    const task = createTask({
      prompt: "Research weather",
      budgetBaseUnits: "1000000",
      ownerWallet: owner,
      mode: "live",
    });
    updateTask(task.id, {
      liveProgress: {
        messages: [{ role: "system", content: "test" }],
        toolCallCount: 2,
        status: "paused",
        pauseReason: "approval",
        pendingEntryId: "entry-pending-approval",
      },
      status: "awaiting_approval",
      lastEntryId: "entry-pending-approval",
    });
    const result = await runLiveStep(task.id, owner);
    assert.equal(result.pauseReason, "approval");
    assert.equal(result.next, "await_human_approval");
    assert.equal(result.verified, true);
    const refreshed = getTask(task.id);
    assert.equal(refreshed?.liveProgress?.pauseReason, "approval");
  });
});

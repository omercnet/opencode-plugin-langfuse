import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { LangfusePlugin } from "./index";

const mockTrace = {
  score: mock(() => {}),
  generation: mock(() => {}),
  span: mock(() => {}),
  event: mock(() => {}),
};

const mockLangfuse = {
  trace: mock(() => mockTrace),
  flushAsync: mock(() => Promise.resolve()),
};

mock.module("langfuse", () => ({
  Langfuse: mock(() => mockLangfuse),
}));

const createSessionEvent = (sessionId: string, title = "Test Session") =>
  ({
    type: "session.created",
    properties: {
      info: {
        id: sessionId,
        title,
        directory: "/test",
        version: "1.0.0",
        projectID: "proj-1",
        time: { start: Date.now() },
      },
    },
  }) as any;

const createMessagePartEvent = (
  sessionId: string,
  messageId: string,
  text: string,
  options: { start?: number; end?: number } = {}
) =>
  ({
    type: "message.part.updated",
    properties: {
      part: {
        type: "text",
        id: "part-1",
        sessionID: sessionId,
        messageID: messageId,
        text,
        time: {
          start: options.start ?? Date.now(),
          end: options.end,
        },
        synthetic: false,
        ignored: false,
      },
    },
  }) as any;

const createSessionIdleEvent = (sessionId: string) =>
  ({
    type: "session.idle",
    properties: { sessionID: sessionId },
  }) as any;

const createSessionDeletedEvent = (sessionId: string) =>
  ({
    type: "session.deleted",
    properties: {
      info: {
        id: sessionId,
        projectID: "proj-1",
        directory: "/test",
        title: "Test",
        version: "1.0.0",
        time: { start: Date.now() },
      },
    },
  }) as any;

const createSessionErrorEvent = (sessionId: string, errorName: string) =>
  ({
    type: "session.error",
    properties: {
      sessionID: sessionId,
      error: { name: errorName, data: { details: "test error" } },
    },
  }) as any;

const createSessionCompactedEvent = (sessionId: string) =>
  ({
    type: "session.compacted",
    properties: { sessionID: sessionId },
  }) as any;

const createMessageUpdatedEvent = (
  sessionId: string,
  messageId: string,
  tokens?: { input: number; output: number },
  cost?: number
) =>
  ({
    type: "message.updated",
    properties: {
      info: {
        id: messageId,
        sessionID: sessionId,
        role: "assistant",
        modelID: "gpt-4",
        providerID: "openai",
        tokens: tokens
          ? { ...tokens, reasoning: 0, cache: { read: 0, write: 0 } }
          : undefined,
        cost,
      },
    },
  }) as any;

const mockPluginInput = {
  client: {},
  project: { id: "proj-123", worktree: "/test" },
  directory: "/test/dir",
  worktree: "/test/worktree",
  serverUrl: new URL("http://localhost:3000"),
  $: {},
} as any;

describe("LangfusePlugin", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockTrace.score.mockClear();
    mockTrace.generation.mockClear();
    mockTrace.span.mockClear();
    mockTrace.event.mockClear();
    mockLangfuse.trace.mockClear();
    mockLangfuse.flushAsync.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const setupEnv = (overrides: Record<string, string> = {}) => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";
    Object.assign(process.env, overrides);
  };

  describe("credentials", () => {
    it("returns empty hooks when credentials missing", async () => {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;

      const hooks = await LangfusePlugin(mockPluginInput);
      expect(hooks).toEqual({});
    });

    it("returns hooks when credentials provided via env", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput);

      expect(hooks.event).toBeDefined();
      expect(hooks["tool.execute.before"]).toBeDefined();
      expect(hooks["tool.execute.after"]).toBeDefined();
      expect(hooks["chat.message"]).toBeDefined();
    });
  });

  describe("session lifecycle", () => {
    it("creates trace on session.created", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput);

      await hooks.event!({ event: createSessionEvent("sess-1") });

      expect(mockLangfuse.trace).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "sess-1",
          name: "Test Session",
        })
      );
    });

    it("records scores and flushes on session.idle", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput);

      await hooks.event!({ event: createSessionEvent("sess-1") });
      await hooks.event!({ event: createSessionIdleEvent("sess-1") });

      expect(mockTrace.score).toHaveBeenCalledWith(
        expect.objectContaining({ name: "messages-count" })
      );
      expect(mockTrace.score).toHaveBeenCalledWith(
        expect.objectContaining({ name: "tools-count" })
      );
      expect(mockTrace.score).toHaveBeenCalledWith(
        expect.objectContaining({ name: "duration-ms" })
      );
      expect(mockLangfuse.flushAsync).toHaveBeenCalled();
    });

    it("records scores and flushes on session.deleted", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput);

      await hooks.event!({ event: createSessionEvent("sess-1") });
      await hooks.event!({ event: createSessionDeletedEvent("sess-1") });

      expect(mockTrace.score).toHaveBeenCalledWith(
        expect.objectContaining({ name: "messages-count" })
      );
      expect(mockLangfuse.flushAsync).toHaveBeenCalled();
    });

    it("logs error event on session.error", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput);

      await hooks.event!({ event: createSessionEvent("sess-1") });
      await hooks.event!({
        event: createSessionErrorEvent("sess-1", "TestError"),
      });

      expect(mockTrace.event).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "session-error",
          level: "ERROR",
        })
      );
    });
  });

  describe("message streaming", () => {
    it("accumulates text without creating generation until complete", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput);

      await hooks.event!({ event: createSessionEvent("sess-1") });
      await hooks.event!({
        event: createMessagePartEvent("sess-1", "msg-1", "Hello"),
      });
      await hooks.event!({
        event: createMessagePartEvent("sess-1", "msg-1", "Hello world"),
      });

      expect(mockTrace.generation).not.toHaveBeenCalled();
    });

    it("creates single generation when message completes", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput);

      await hooks.event!({ event: createSessionEvent("sess-1") });

      const startTime = Date.now();
      await hooks.event!({
        event: createMessagePartEvent("sess-1", "msg-1", "Hello", {
          start: startTime,
        }),
      });
      await hooks.event!({
        event: createMessagePartEvent("sess-1", "msg-1", "Hello world", {
          start: startTime,
          end: Date.now(),
        }),
      });

      expect(mockTrace.generation).toHaveBeenCalledTimes(1);
      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "ai-response",
          output: "Hello world",
        })
      );
    });

    it("flushes pending messages on session idle", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput);

      await hooks.event!({ event: createSessionEvent("sess-1") });
      await hooks.event!({
        event: createMessagePartEvent("sess-1", "msg-1", "Incomplete message"),
      });

      expect(mockTrace.generation).not.toHaveBeenCalled();

      await hooks.event!({ event: createSessionIdleEvent("sess-1") });

      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({
          output: "Incomplete message",
        })
      );
    });
  });

  describe("tool timing", () => {
    it("tracks tool duration between before and after hooks", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput);

      await hooks.event!({ event: createSessionEvent("sess-1") });

      await hooks["tool.execute.before"]!(
        { tool: "read", sessionID: "sess-1", callID: "call-1" },
        { args: { path: "/test.ts" } }
      );

      await new Promise((r) => setTimeout(r, 10));

      await hooks["tool.execute.after"]!(
        { tool: "read", sessionID: "sess-1", callID: "call-1" },
        { title: "Read file", output: "content", metadata: {} }
      );

      expect(mockTrace.span).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "tool.read",
          input: { path: "/test.ts" },
          output: "content",
          startTime: expect.any(Date),
          endTime: expect.any(Date),
        })
      );

      const calls = mockTrace.span.mock.calls as any[];
      const spanCall = calls[0]?.[0];
      expect(spanCall).toBeDefined();
      const duration =
        spanCall.endTime.getTime() - spanCall.startTime.getTime();
      expect(duration).toBeGreaterThanOrEqual(10);
    });

    it("increments tool count on each execution", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput);

      await hooks.event!({ event: createSessionEvent("sess-1") });

      await hooks["tool.execute.before"]!(
        { tool: "read", sessionID: "sess-1", callID: "call-1" },
        { args: {} }
      );
      await hooks["tool.execute.after"]!(
        { tool: "read", sessionID: "sess-1", callID: "call-1" },
        { title: "Read", output: "", metadata: {} }
      );

      await hooks["tool.execute.before"]!(
        { tool: "write", sessionID: "sess-1", callID: "call-2" },
        { args: {} }
      );
      await hooks["tool.execute.after"]!(
        { tool: "write", sessionID: "sess-1", callID: "call-2" },
        { title: "Write", output: "", metadata: {} }
      );

      await hooks.event!({ event: createSessionIdleEvent("sess-1") });

      expect(mockTrace.score).toHaveBeenCalledWith(
        expect.objectContaining({ name: "tools-count", value: 2 })
      );
    });
  });

  describe("user input capture", () => {
    it("captures user input via chat.message hook", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput);

      await hooks.event!({ event: createSessionEvent("sess-1") });

      await hooks["chat.message"]!(
        { sessionID: "sess-1" } as any,
        {
          message: { role: "user" },
          parts: [{ type: "text", text: "What is 2+2?" }],
        } as any
      );

      const startTime = Date.now();
      await hooks.event!({
        event: createMessagePartEvent("sess-1", "msg-1", "The answer is 4", {
          start: startTime,
          end: Date.now(),
        }),
      });

      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({
          input: "What is 2+2?",
          output: "The answer is 4",
        })
      );
    });
  });

  describe("model info capture", () => {
    it("captures model info via chat.message hook for assistant messages", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput);

      await hooks.event!({ event: createSessionEvent("sess-1") });

      await hooks["chat.message"]!(
        {
          sessionID: "sess-1",
          messageID: "msg-1",
          model: { modelID: "gpt-4", providerID: "openai" },
        } as any,
        {
          message: { role: "assistant" },
          parts: [],
        } as any
      );

      const startTime = Date.now();
      await hooks.event!({
        event: createMessagePartEvent("sess-1", "msg-1", "Response text", {
          start: startTime,
          end: Date.now(),
        }),
      });

      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-4",
          metadata: expect.objectContaining({
            providerId: "openai",
          }),
        })
      );
    });
  });

  describe("token and cost tracking", () => {
    it("tracks token usage from message.updated events", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput);

      await hooks.event!({ event: createSessionEvent("sess-1") });
      await hooks.event!({
        event: createMessageUpdatedEvent(
          "sess-1",
          "msg-1",
          { input: 100, output: 50 },
          0.005
        ),
      });
      await hooks.event!({ event: createSessionIdleEvent("sess-1") });

      expect(mockTrace.score).toHaveBeenCalledWith(
        expect.objectContaining({ name: "input-tokens", value: 100 })
      );
      expect(mockTrace.score).toHaveBeenCalledWith(
        expect.objectContaining({ name: "output-tokens", value: 50 })
      );
      expect(mockTrace.score).toHaveBeenCalledWith(
        expect.objectContaining({ name: "total-cost-usd", value: 0.005 })
      );
    });

    it("accumulates tokens across multiple messages", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput);

      await hooks.event!({ event: createSessionEvent("sess-1") });
      await hooks.event!({
        event: createMessageUpdatedEvent("sess-1", "msg-1", {
          input: 100,
          output: 50,
        }),
      });
      await hooks.event!({
        event: createMessageUpdatedEvent("sess-1", "msg-2", {
          input: 200,
          output: 100,
        }),
      });
      await hooks.event!({ event: createSessionIdleEvent("sess-1") });

      expect(mockTrace.score).toHaveBeenCalledWith(
        expect.objectContaining({ name: "input-tokens", value: 300 })
      );
      expect(mockTrace.score).toHaveBeenCalledWith(
        expect.objectContaining({ name: "output-tokens", value: 150 })
      );
    });
  });

  describe("compaction tracking", () => {
    it("tracks session compaction events", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput);

      await hooks.event!({ event: createSessionEvent("sess-1") });
      await hooks.event!({ event: createSessionCompactedEvent("sess-1") });
      await hooks.event!({ event: createSessionCompactedEvent("sess-1") });
      await hooks.event!({ event: createSessionIdleEvent("sess-1") });

      expect(mockTrace.event).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "context-compacted",
          output: { compactionNumber: 1 },
        })
      );
      expect(mockTrace.event).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "context-compacted",
          output: { compactionNumber: 2 },
        })
      );
      expect(mockTrace.score).toHaveBeenCalledWith(
        expect.objectContaining({ name: "compactions-count", value: 2 })
      );
    });
  });

  describe("config via environment", () => {
    it("includes promptVersion in tags when provided via env", async () => {
      setupEnv({ PROMPT_VERSION: "v2.0" });
      const hooks = await LangfusePlugin(mockPluginInput);

      await hooks.event!({ event: createSessionEvent("sess-1") });

      expect(mockLangfuse.trace).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining(["opencode", "v2.0"]),
        })
      );
    });

    it("parses LANGFUSE_METADATA json and includes in trace", async () => {
      setupEnv({ LANGFUSE_METADATA: '{"environment":"test","version":"1.0"}' });
      const hooks = await LangfusePlugin(mockPluginInput);

      await hooks.event!({ event: createSessionEvent("sess-1") });

      expect(mockLangfuse.trace).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            environment: "test",
            version: "1.0",
          }),
        })
      );
    });
  });
});

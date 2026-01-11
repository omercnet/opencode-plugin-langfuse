import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createLangfusePlugin } from "./index";

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

describe("createLangfusePlugin", () => {
  beforeEach(() => {
    mockTrace.score.mockClear();
    mockTrace.generation.mockClear();
    mockTrace.span.mockClear();
    mockTrace.event.mockClear();
    mockLangfuse.trace.mockClear();
    mockLangfuse.flushAsync.mockClear();
  });

  describe("credentials", () => {
    it("returns empty hooks when credentials missing", async () => {
      const plugin = createLangfusePlugin();
      const hooks = await plugin({ project: { pathname: "/test" } } as any);

      expect(hooks).toEqual({});
    });

    it("returns hooks when credentials provided via config", async () => {
      const plugin = createLangfusePlugin({
        publicKey: "pk-test",
        secretKey: "sk-test",
      });
      const hooks = await plugin({ project: { pathname: "/test" } } as any);

      expect(hooks.event).toBeDefined();
      expect(hooks["tool.execute.before"]).toBeDefined();
      expect(hooks["tool.execute.after"]).toBeDefined();
      expect(hooks["chat.message"]).toBeDefined();
    });
  });

  describe("session lifecycle", () => {
    it("creates trace on session.created", async () => {
      const plugin = createLangfusePlugin({
        publicKey: "pk-test",
        secretKey: "sk-test",
      });
      const hooks = await plugin({ project: { pathname: "/test" } } as any);

      await hooks.event!({ event: createSessionEvent("sess-1") });

      expect(mockLangfuse.trace).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "sess-1",
          name: "Test Session",
        })
      );
    });

    it("records scores and flushes on session.idle", async () => {
      const plugin = createLangfusePlugin({
        publicKey: "pk-test",
        secretKey: "sk-test",
      });
      const hooks = await plugin({ project: { pathname: "/test" } } as any);

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
      const plugin = createLangfusePlugin({
        publicKey: "pk-test",
        secretKey: "sk-test",
      });
      const hooks = await plugin({ project: { pathname: "/test" } } as any);

      await hooks.event!({ event: createSessionEvent("sess-1") });
      await hooks.event!({ event: createSessionDeletedEvent("sess-1") });

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

    it("logs error event on session.error", async () => {
      const plugin = createLangfusePlugin({
        publicKey: "pk-test",
        secretKey: "sk-test",
      });
      const hooks = await plugin({ project: { pathname: "/test" } } as any);

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
      const plugin = createLangfusePlugin({
        publicKey: "pk-test",
        secretKey: "sk-test",
      });
      const hooks = await plugin({ project: { pathname: "/test" } } as any);

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
      const plugin = createLangfusePlugin({
        publicKey: "pk-test",
        secretKey: "sk-test",
      });
      const hooks = await plugin({ project: { pathname: "/test" } } as any);

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
      const plugin = createLangfusePlugin({
        publicKey: "pk-test",
        secretKey: "sk-test",
      });
      const hooks = await plugin({ project: { pathname: "/test" } } as any);

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
      const plugin = createLangfusePlugin({
        publicKey: "pk-test",
        secretKey: "sk-test",
      });
      const hooks = await plugin({ project: { pathname: "/test" } } as any);

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

      const spanCall = mockTrace.span.mock.calls[0][0];
      const duration =
        spanCall.endTime.getTime() - spanCall.startTime.getTime();
      expect(duration).toBeGreaterThanOrEqual(10);
    });

    it("increments tool count on each execution", async () => {
      const plugin = createLangfusePlugin({
        publicKey: "pk-test",
        secretKey: "sk-test",
      });
      const hooks = await plugin({ project: { pathname: "/test" } } as any);

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
      const plugin = createLangfusePlugin({
        publicKey: "pk-test",
        secretKey: "sk-test",
      });
      const hooks = await plugin({ project: { pathname: "/test" } } as any);

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
      const plugin = createLangfusePlugin({
        publicKey: "pk-test",
        secretKey: "sk-test",
      });
      const hooks = await plugin({ project: { pathname: "/test" } } as any);

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

  describe("config options", () => {
    it("passes custom metadata to trace", async () => {
      const plugin = createLangfusePlugin({
        publicKey: "pk-test",
        secretKey: "sk-test",
        metadata: { environment: "test", version: "1.0" },
      });
      const hooks = await plugin({ project: { pathname: "/test" } } as any);

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

    it("includes promptVersion in tags when provided", async () => {
      const plugin = createLangfusePlugin({
        publicKey: "pk-test",
        secretKey: "sk-test",
        promptVersion: "v2.0",
      });
      const hooks = await plugin({ project: { pathname: "/test" } } as any);

      await hooks.event!({ event: createSessionEvent("sess-1") });

      expect(mockLangfuse.trace).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining(["opencode", "v2.0"]),
        })
      );
    });
  });
});

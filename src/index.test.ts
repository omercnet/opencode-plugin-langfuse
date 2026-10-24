import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { LangfusePlugin } from "./index";

const mockForceFlush = mock(() => Promise.resolve());
const mockStart = mock(() => {});
let sdkOptions: any;

mock.module("@langfuse/otel", () => ({
  LangfuseSpanProcessor: mock(() => ({
    forceFlush: mockForceFlush,
  })),
}));

mock.module("@opentelemetry/sdk-node", () => ({
  NodeSDK: mock((options: any) => {
    sdkOptions = options;
    return { start: mockStart };
  }),
}));

const mockLog = mock(() => {});

const createMockClient = () => ({
  app: {
    log: mockLog,
  },
});

const mockPluginInput = (clientOverrides = {}) =>
  ({
    client: { ...createMockClient(), ...clientOverrides },
    project: { id: "proj-123", worktree: "/test" },
    directory: "/test/dir",
    worktree: "/test/worktree",
    serverUrl: new URL("http://localhost:3000"),
    $: {},
  }) as any;

describe("LangfusePlugin", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockForceFlush.mockClear();
    mockStart.mockClear();
    mockLog.mockClear();
    sdkOptions = undefined;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const setupEnv = (overrides: Record<string, string> = {}) => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";
    delete process.env.LANGFUSE_BASEURL;
    delete process.env.LANGFUSE_CAPTURE_CONTENT;
    Object.assign(process.env, overrides);
  };

  describe("credentials", () => {
    it("returns empty hooks when credentials missing", async () => {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;

      const hooks = await LangfusePlugin(mockPluginInput());

      expect(hooks).toEqual({});
      expect(mockLog).toHaveBeenCalledWith({
        body: {
          service: "langfuse-otel",
          level: "warn",
          message:
            "Missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY - tracing disabled",
        },
      });
    });

    it("returns hooks when credentials provided via env", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput());

      expect(hooks.config).toBeDefined();
      expect(hooks.event).toBeDefined();
      expect(mockStart).toHaveBeenCalled();
      expect(mockLog).toHaveBeenCalledWith({
        body: {
          service: "langfuse-otel",
          level: "info",
          message:
            "OTEL tracing initialized → https://cloud.langfuse.com (content capture enabled)",
        },
      });
    });

    it("redacts content attributes when captureContent is disabled", async () => {
      setupEnv({ LANGFUSE_CAPTURE_CONTENT: "false" });
      await LangfusePlugin(mockPluginInput());

      expect(sdkOptions.spanProcessors).toHaveLength(2);
      const span = {
        attributes: {
          "langfuse.observation.input": "private prompt",
          "langfuse.observation.output": "private response",
          "gen_ai.input.messages": '[{"content":"private prompt"}]',
          "gen_ai.output.messages": '[{"content":"private response"}]',
          "gen_ai.system_instructions": "private system prompt",
          "input.value": "private input",
          "output.value": "private output",
          "ai.toolCall.args": '{"query":"private tool input"}',
          "ai.toolCall.result": '{"data":"private tool output"}',
          "gen_ai.request.model": "model-name",
          "opencode.client": "opencode",
        },
      };

      sdkOptions.spanProcessors[0].onEnd(span);

      expect(span.attributes["langfuse.observation.input"]).toBe("[REDACTED]");
      expect(span.attributes["langfuse.observation.output"]).toBe("[REDACTED]");
      expect(span.attributes["gen_ai.input.messages"]).toBe("[REDACTED]");
      expect(span.attributes["gen_ai.output.messages"]).toBe("[REDACTED]");
      expect(span.attributes["gen_ai.system_instructions"]).toBe("[REDACTED]");
      expect(span.attributes["input.value"]).toBe("[REDACTED]");
      expect(span.attributes["output.value"]).toBe("[REDACTED]");
      expect(span.attributes["ai.toolCall.args"]).toBe("[REDACTED]");
      expect(span.attributes["ai.toolCall.result"]).toBe("[REDACTED]");
      expect(span.attributes["gen_ai.request.model"]).toBe("model-name");
      expect(span.attributes["opencode.client"]).toBe("opencode");
    });

    it("keeps content capture enabled unless explicitly disabled", async () => {
      setupEnv({ LANGFUSE_CAPTURE_CONTENT: "0" });
      await LangfusePlugin(mockPluginInput());

      expect(sdkOptions.spanProcessors).toHaveLength(1);
    });
  });

  describe("config hook", () => {
    it("warns when openTelemetry is disabled in config", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput());

      await hooks.config!({ experimental: { openTelemetry: false } } as any);

      expect(mockLog).toHaveBeenCalledWith({
        body: {
          service: "langfuse-otel",
          level: "warn",
          message:
            "OpenTelemetry experimental feature is disabled in Opencode config - tracing disabled",
        },
      });
    });

    it("warns when experimental config is missing", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput());

      await hooks.config!({} as any);

      expect(mockLog).toHaveBeenCalledWith({
        body: {
          service: "langfuse-otel",
          level: "warn",
          message:
            "OpenTelemetry experimental feature is disabled in Opencode config - tracing disabled",
        },
      });
    });

    it("does not warn when openTelemetry is enabled", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput());
      mockLog.mockClear();

      await hooks.config!({ experimental: { openTelemetry: true } } as any);

      expect(mockLog).not.toHaveBeenCalled();
    });
  });

  describe("event hook", () => {
    it("flushes OTEL spans on session.idle", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput());

      await hooks.event!({
        event: { type: "session.idle", properties: { sessionID: "sess-1" } },
      } as any);

      expect(mockForceFlush).toHaveBeenCalled();
      expect(mockLog).toHaveBeenCalledWith({
        body: {
          service: "langfuse-otel",
          level: "info",
          message: "Flushing OTEL spans before idle",
        },
      });
    });

    it("does not flush on other events", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput());
      mockForceFlush.mockClear();

      await hooks.event!({
        event: {
          type: "session.created",
          properties: { info: { id: "sess-1" } },
        },
      } as any);

      expect(mockForceFlush).not.toHaveBeenCalled();
    });
  });

  describe("environment configuration", () => {
    it("uses default baseUrl when not provided", async () => {
      setupEnv();
      delete process.env.LANGFUSE_BASEURL;

      await LangfusePlugin(mockPluginInput());

      expect(mockLog).toHaveBeenCalledWith({
        body: {
          service: "langfuse-otel",
          level: "info",
          message:
            "OTEL tracing initialized → https://cloud.langfuse.com (content capture enabled)",
        },
      });
    });

    it("uses custom baseUrl when provided", async () => {
      setupEnv({ LANGFUSE_BASEURL: "https://custom.langfuse.com" });

      await LangfusePlugin(mockPluginInput());

      expect(mockLog).toHaveBeenCalledWith({
        body: {
          service: "langfuse-otel",
          level: "info",
          message:
            "OTEL tracing initialized → https://custom.langfuse.com (content capture enabled)",
        },
      });
    });
  });
});

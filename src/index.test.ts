import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { LangfusePlugin } from "./index";

const mockForceFlush = mock(() => Promise.resolve());
const mockStart = mock(() => {});
const mockShutdown = mock(() => Promise.resolve());

// Track if setAttribute was called
let capturedSpan: { setAttribute?: (key: string, value: any) => void } = {};

mock.module("@langfuse/otel", () => {
  return {
    LangfuseSpanProcessor: mock((config: any) => ({
      forceFlush: mockForceFlush,
      onStart: (span: any, context: any) => {
        capturedSpan = span;
      },
      onEnd: mock(() => {}),
      shutdown: mockShutdown,
    })),
  };
});

mock.module("@opentelemetry/sdk-node", () => ({
  NodeSDK: mock(() => ({
    start: mockStart,
    shutdown: mockShutdown,
  })),
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
    mockShutdown.mockClear();
    mockLog.mockClear();
    capturedSpan = {};
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
      delete process.env.LANGFUSE_BASEURL;
      delete process.env.LANGFUSE_ENVIRONMENT;
      delete process.env.LANGFUSE_USER_ID;

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
          message: "OTEL tracing initialized → https://cloud.langfuse.com",
        },
      });
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
          message: "OTEL tracing initialized → https://cloud.langfuse.com",
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
          message: "OTEL tracing initialized → https://custom.langfuse.com",
        },
      });
    });
  });

  describe("user tracking", () => {
    it("creates plugin with userId when provided", async () => {
      setupEnv({ LANGFUSE_USER_ID: "user-123" });

      const hooks = await LangfusePlugin(mockPluginInput());

      // Verify plugin still initializes properly
      expect(hooks.config).toBeDefined();
      expect(hooks.event).toBeDefined();
      expect(mockStart).toHaveBeenCalled();
    });

    it("creates plugin without userId when not provided", async () => {
      setupEnv();
      delete process.env.LANGFUSE_USER_ID;

      const hooks = await LangfusePlugin(mockPluginInput());

      // Verify plugin still initializes properly
      expect(hooks.config).toBeDefined();
      expect(hooks.event).toBeDefined();
      expect(mockStart).toHaveBeenCalled();
    });

    it("works with all environment variables together", async () => {
      setupEnv({
        LANGFUSE_BASEURL: "https://custom.example.com",
        LANGFUSE_ENVIRONMENT: "production",
        LANGFUSE_USER_ID: "user@example.com",
      });

      const hooks = await LangfusePlugin(mockPluginInput());

      expect(hooks.config).toBeDefined();
      expect(mockStart).toHaveBeenCalled();
      expect(mockLog).toHaveBeenCalledWith({
        body: {
          service: "langfuse-otel",
          level: "info",
          message: "OTEL tracing initialized → https://custom.example.com",
        },
      });
    });
  });
});

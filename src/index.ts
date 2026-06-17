import { LangfuseSpanProcessor } from "@langfuse/otel";
import type { Plugin } from "@opencode-ai/plugin";
import { NodeSDK } from "@opentelemetry/sdk-node";
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";

const LANGFUSE_SESSION_ID_MAX_LENGTH = 200;

class LangfuseSessionSpanProcessor implements SpanProcessor {
  constructor(private readonly sessionId: string) {}

  onStart(span: Span): void {
    span.setAttribute("session.id", this.sessionId);
  }

  onEnd(_span: ReadableSpan): void {}

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

export const LangfusePlugin: Plugin = async ({ client }) => {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASEURL ?? "https://cloud.langfuse.com";
  const environment = process.env.LANGFUSE_ENVIRONMENT ?? "development";

  const log = (level: "info" | "warn" | "error", message: string) => {
    client.app.log({
      body: { service: "langfuse-otel", level, message },
    });
  };

  if (!publicKey || !secretKey) {
    log(
      "warn",
      "Missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY - tracing disabled"
    );
    return {};
  }

  const processor = new LangfuseSpanProcessor({
    publicKey,
    secretKey,
    baseUrl,
    environment,
  });

  const sessionId = process.env.LANGFUSE_SESSION_ID?.trim();
  const sessionProcessor =
    sessionId && sessionId.length <= LANGFUSE_SESSION_ID_MAX_LENGTH
      ? new LangfuseSessionSpanProcessor(sessionId)
      : undefined;

  if (sessionId && !sessionProcessor) {
    log(
      "warn",
      `LANGFUSE_SESSION_ID is longer than ${LANGFUSE_SESSION_ID_MAX_LENGTH} characters - session grouping disabled`
    );
  }

  const sdk = new NodeSDK({
    spanProcessors: sessionProcessor
      ? [sessionProcessor, processor]
      : [processor],
  });

  sdk.start();
  log("info", `OTEL tracing initialized → ${baseUrl}`);

  return {
    config: async (config) => {
      if (!config.experimental?.openTelemetry) {
        log(
          "warn",
          "OpenTelemetry experimental feature is disabled in Opencode config - tracing disabled"
        );
      }
    },
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        log("info", "Flushing OTEL spans before idle");
        await processor.forceFlush(); // Flushes the trace to Langfuse
      }

      if (event.type === "server.instance.disposed") await sdk.shutdown(); // Flushes the trace to Langfuse
    },
  };
};

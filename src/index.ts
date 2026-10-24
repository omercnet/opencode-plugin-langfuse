import { LangfuseSpanProcessor } from "@langfuse/otel";
import type { Plugin } from "@opencode-ai/plugin";
import type { SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeSDK } from "@opentelemetry/sdk-node";

const CONTENT_ATTRIBUTE_PATTERNS = [
  /^langfuse\.(?:observation|trace)\.(?:input|output)$/,
  /^gen_ai\.(?:input\.messages|output\.messages|prompt|completion)(?:\.|$)/,
  /^gen_ai\.tool\.call\.(?:arguments|result)$/,
  /^gen_ai\.(?:system_instructions|tool\.definitions)(?:\.|$)/,
  /^(?:input|output)\.value$/,
  /^ai\.toolCall\.(?:args|result)(?:\.|$)/,
  /^ai\.prompt(?:\.|$)/,
  /^ai\.response\.(?:text|object|toolCalls|toolResults)(?:\.|$)/,
  /^llm\.(?:input_messages|output_messages|prompts|completions)(?:\.|$)/,
];

const createContentRedactionProcessor = (): SpanProcessor => ({
  onStart: () => {},
  onEnd: (span) => {
    for (const key of Object.keys(span.attributes)) {
      if (CONTENT_ATTRIBUTE_PATTERNS.some((pattern) => pattern.test(key))) {
        span.attributes[key] = "[REDACTED]";
      }
    }
  },
  forceFlush: async () => {},
  shutdown: async () => {},
});

export const LangfusePlugin: Plugin = async ({ client }) => {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASEURL ?? "https://cloud.langfuse.com";
  const environment = process.env.LANGFUSE_ENVIRONMENT ?? "development";
  const captureContent =
    process.env.LANGFUSE_CAPTURE_CONTENT?.trim().toLowerCase() !== "false";

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

  const sdk = new NodeSDK({
    spanProcessors: captureContent
      ? [processor]
      : [createContentRedactionProcessor(), processor],
  });

  sdk.start();
  log(
    "info",
    `OTEL tracing initialized → ${baseUrl} (content capture ${captureContent ? "enabled" : "disabled"})`
  );

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

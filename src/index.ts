import { LangfuseSpanProcessor } from "@langfuse/otel";
import type { Plugin } from "@opencode-ai/plugin";
import { NodeSDK } from "@opentelemetry/sdk-node";

export const LangfusePlugin: Plugin = async ({ client }) => {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASEURL ?? "https://cloud.langfuse.com";

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
    shouldExportSpan: (span) => {
      return true;
    },
  });

  const sdk = new NodeSDK({
    spanProcessors: [processor],
  });

  sdk.start();
  log("warn", `OTEL tracing initialized → ${baseUrl}`);

  const shutdown = async () => {
    await processor.shutdown();
    log("warn", "OTEL tracing shutdown complete");
  };

  process.on("beforeExit", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return {};
};

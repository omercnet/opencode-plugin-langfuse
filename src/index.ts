import { LangfuseSpanProcessor } from "@langfuse/otel";
import type { Plugin } from "@opencode-ai/plugin";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { resolveConfig } from "./config";
import type { LangfusePluginOptions } from "./config";

export type { LangfusePluginOptions } from "./config";

export const LangfusePlugin: Plugin = async (
  { client },
  options?: LangfusePluginOptions
) => {
  const config = resolveConfig(options);

  const log = (level: "info" | "warn" | "error", message: string) => {
    client.app.log({
      body: { service: "langfuse-otel", level, message },
    });
  };

  if (!config.publicKey || !config.secretKey) {
    log(
      "warn",
      "Missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY - tracing disabled"
    );
    return {};
  }

  const processor = new LangfuseSpanProcessor(config);

  const sdk = new NodeSDK({
    spanProcessors: [processor],
  });

  sdk.start();
  log("info", `OTEL tracing initialized → ${config.baseUrl}`);

  return {
    config: async (cfg) => {
      if (!cfg.experimental?.openTelemetry) {
        log(
          "warn",
          "OpenTelemetry experimental feature is disabled in Opencode config - tracing disabled"
        );
      }
    },
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        log("info", "Flushing OTEL spans before idle");
        try {
          await processor.forceFlush();
        } catch (error) {
          log(
            "error",
            `Failed to flush OTEL spans: ${(error as Error).message}`
          );
        }
      }

      if (event.type === "server.instance.disposed") await sdk.shutdown();
    },
  };
};

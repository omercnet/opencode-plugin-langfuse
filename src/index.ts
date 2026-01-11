import { Langfuse } from "langfuse";
import type { Plugin, Hooks, PluginInput } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk";

export interface LangfusePluginConfig {
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
  promptVersion?: string;
  metadata?: Record<string, string | number | boolean>;
  debug?: boolean;
}

interface MessageState {
  text: string;
  startTime?: Date;
  endTime?: Date;
  model?: string;
  providerId?: string;
  input?: string;
}

interface ToolExecution {
  startTime: Date;
  tool: string;
  args?: unknown;
}

interface TraceState {
  trace: ReturnType<Langfuse["trace"]>;
  sessionId: string;
  startTime: number;
  messageCount: number;
  toolCallCount: number;
  messages: Map<string, MessageState>;
  toolExecutions: Map<string, ToolExecution>;
  lastUserInput?: string;
}

export function createLangfusePlugin(
  config: LangfusePluginConfig = {}
): Plugin {
  return async (_input: PluginInput): Promise<Hooks> => {
    const publicKey = config.publicKey ?? process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = config.secretKey ?? process.env.LANGFUSE_SECRET_KEY;
    const baseUrl =
      config.baseUrl ??
      process.env.LANGFUSE_BASEURL ??
      "https://cloud.langfuse.com";
    const promptVersion = config.promptVersion ?? process.env.PROMPT_VERSION;
    const debug = config.debug ?? false;

    if (!publicKey || !secretKey) {
      if (debug) {
        console.warn(
          "[Langfuse Plugin] Credentials not configured. Skipping tracing."
        );
      }
      return {};
    }

    const langfuse = new Langfuse({
      publicKey,
      secretKey,
      baseUrl,
    });

    const traces = new Map<string, TraceState>();

    const log = (...args: unknown[]) => {
      if (debug) {
        console.log("[Langfuse Plugin]", ...args);
      }
    };

    const recordSessionScores = (state: TraceState) => {
      const durationMs = Date.now() - state.startTime;

      state.trace.score({
        name: "messages-count",
        value: state.messageCount,
      });

      state.trace.score({
        name: "tools-count",
        value: state.toolCallCount,
      });

      state.trace.score({
        name: "duration-ms",
        value: durationMs,
      });

      log(
        `Scores recorded (session: ${state.sessionId}): ${durationMs}ms, ${state.messageCount} messages, ${state.toolCallCount} tools`
      );
    };

    const flushPendingMessages = (state: TraceState) => {
      for (const [messageId, msg] of state.messages) {
        if (msg.text) {
          state.trace.generation({
            name: "ai-response",
            model: msg.model || "unknown",
            input: msg.input || state.lastUserInput,
            output: msg.text,
            metadata: {
              messageId,
              providerId: msg.providerId,
            },
            startTime: msg.startTime,
            endTime: msg.endTime || new Date(),
          });
          log(`Flushed pending message: ${messageId}`);
        }
      }
      state.messages.clear();
    };

    const handlers: Hooks = {
      event: async ({ event }: { event: Event }) => {
        switch (event.type) {
          case "session.created": {
            const session = event.properties.info;
            const sessionId = session.id;
            log(`Session created: ${sessionId}`);

            const trace = langfuse.trace({
              id: sessionId,
              name: session.title || "OpenCode Session",
              metadata: {
                promptVersion,
                directory: session.directory,
                version: session.version,
                ...config.metadata,
              },
              tags: ["opencode", promptVersion].filter(Boolean) as string[],
            });

            traces.set(sessionId, {
              trace,
              sessionId,
              startTime: Date.now(),
              messageCount: 0,
              toolCallCount: 0,
              messages: new Map(),
              toolExecutions: new Map(),
            });
            break;
          }

          case "message.part.updated": {
            const part = event.properties.part;
            const sessionId = part.sessionID;
            const state = traces.get(sessionId);
            if (!state) break;

            if (part.type === "text") {
              const messageId = part.messageID;
              const existing = state.messages.get(messageId) || { text: "" };

              existing.text = part.text;

              if (part.time?.start && !existing.startTime) {
                existing.startTime = new Date(part.time.start);
              }
              if (part.time?.end) {
                existing.endTime = new Date(part.time.end);

                state.messageCount++;

                state.trace.generation({
                  name: "ai-response",
                  model: existing.model || "unknown",
                  input: existing.input || state.lastUserInput,
                  output: existing.text,
                  metadata: {
                    messageId,
                    partId: part.id,
                    providerId: existing.providerId,
                    synthetic: part.synthetic,
                    ignored: part.ignored,
                  },
                  startTime: existing.startTime,
                  endTime: existing.endTime,
                });

                log(
                  `Generation created for completed message: ${messageId} (${existing.text.slice(0, 50)}...)`
                );

                state.messages.delete(messageId);
              } else {
                state.messages.set(messageId, existing);
              }
            }
            break;
          }

          case "session.error": {
            const sessionId = event.properties.sessionID;
            if (!sessionId) break;

            const state = traces.get(sessionId);
            if (!state) break;

            const error = event.properties.error;
            log(`Session error (session: ${sessionId}):`, error);

            state.trace.event({
              name: "session-error",
              level: "ERROR",
              output: error
                ? {
                    type: error.name || "unknown",
                    data: error.data,
                  }
                : undefined,
            });

            await langfuse.flushAsync();
            break;
          }

          case "session.idle": {
            const sessionId = event.properties.sessionID;
            const state = traces.get(sessionId);
            if (!state) break;

            log(`Session idle: ${sessionId}`);

            flushPendingMessages(state);
            recordSessionScores(state);

            await langfuse.flushAsync();
            traces.delete(sessionId);

            log(`Trace flushed for session: ${sessionId}`);
            break;
          }

          case "session.deleted": {
            const session = event.properties.info;
            const sessionId = session.id;
            const state = traces.get(sessionId);
            if (!state) break;

            log(`Session deleted: ${sessionId}`);

            flushPendingMessages(state);
            recordSessionScores(state);

            await langfuse.flushAsync();
            traces.delete(sessionId);
            break;
          }

          case "session.status": {
            const sessionId = event.properties.sessionID;
            const state = traces.get(sessionId);
            if (!state) break;

            const status = event.properties.status;
            log(`Session status (session: ${sessionId}):`, status);

            state.trace.event({
              name: "status-update",
              level: "DEFAULT",
              output: { status },
            });
            break;
          }
        }
      },

      "chat.message": async (input, output) => {
        const sessionId = input.sessionID;
        const state = traces.get(sessionId);
        if (!state) return;

        const role = output.message.role;

        if (role === "user") {
          const textParts = output.parts
            ?.filter((p) => p.type === "text")
            .map((p) => (p as { type: "text"; text: string }).text)
            .join("\n");
          if (textParts) {
            state.lastUserInput = textParts;
            log(`User input captured: ${textParts.slice(0, 50)}...`);
          }
        } else if (role === "assistant" && input.model) {
          const messageId = input.messageID;
          if (messageId) {
            const existing = state.messages.get(messageId) || { text: "" };
            existing.model = input.model.modelID;
            existing.providerId = input.model.providerID;
            existing.input = state.lastUserInput;
            state.messages.set(messageId, existing);
            log(
              `Model info captured for ${messageId}: ${input.model.modelID} (${input.model.providerID})`
            );
          }
        }
      },

      "tool.execute.before": async (input, output) => {
        const sessionId = input.sessionID;
        const state = traces.get(sessionId);
        if (!state) return;

        state.toolExecutions.set(input.callID, {
          startTime: new Date(),
          tool: input.tool,
          args: output.args,
        });

        log(`Tool starting (session: ${sessionId}): ${input.tool}`);
      },

      "tool.execute.after": async (input, output) => {
        const sessionId = input.sessionID;
        const state = traces.get(sessionId);
        if (!state) return;

        state.toolCallCount++;

        const execution = state.toolExecutions.get(input.callID);
        const startTime = execution?.startTime || new Date();
        const endTime = new Date();

        state.toolExecutions.delete(input.callID);

        log(
          `Tool executed (session: ${sessionId}): ${input.tool} (${endTime.getTime() - startTime.getTime()}ms)`
        );

        state.trace.span({
          name: `tool.${input.tool}`,
          input: execution?.args,
          output: output.output,
          startTime,
          endTime,
          metadata: {
            tool: input.tool,
            sessionId: input.sessionID,
            callId: input.callID,
            title: output.title,
            ...output.metadata,
          },
        });
      },
    };

    return handlers;
  };
}

export default createLangfusePlugin;

import { LangfuseSpanProcessor } from "@langfuse/otel";
import { SpanProcessor, Span } from "@opentelemetry/sdk-trace-base";
import { Context } from "@opentelemetry/api";

/**
 * A span processor wrapper that adds userId as a span attribute to all spans
 * before passing them to the underlying LangfuseSpanProcessor.
 */
export class UserIdSpanProcessor implements SpanProcessor {
  private processor: LangfuseSpanProcessor;
  private userId?: string;

  constructor(processor: LangfuseSpanProcessor, userId?: string) {
    this.processor = processor;
    this.userId = userId;
  }

  forceFlush(): Promise<void> {
    return this.processor.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.processor.shutdown();
  }

  onStart(span: Span, parentContext: Context): void {
    // Add userId as a span attribute if provided
    if (this.userId) {
      span.setAttribute("langfuse.user.id", this.userId);
    }
    this.processor.onStart(span, parentContext);
  }

  onEnd(span: Span): void {
    this.processor.onEnd(span);
  }
}

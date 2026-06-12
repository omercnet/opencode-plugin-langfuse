import { describe, it, expect } from "bun:test";
import { resolveConfig } from "./config";

describe("resolveConfig", () => {
  it("returns empty strings when both keys missing", () => {
    const result = resolveConfig({}, {});
    expect(result.publicKey).toBe("");
    expect(result.secretKey).toBe("");
  });

  it("returns empty secretKey when only public key present", () => {
    const result = resolveConfig({}, { LANGFUSE_PUBLIC_KEY: "pk-123" });
    expect(result.secretKey).toBe("");
  });

  it("returns empty publicKey when only secret key present", () => {
    const result = resolveConfig({}, { LANGFUSE_SECRET_KEY: "sk-123" });
    expect(result.publicKey).toBe("");
  });

  it("returns both keys when present in env", () => {
    const result = resolveConfig(
      {},
      { LANGFUSE_PUBLIC_KEY: "pk-123", LANGFUSE_SECRET_KEY: "sk-123" }
    );
    expect(result.publicKey).toBe("pk-123");
    expect(result.secretKey).toBe("sk-123");
  });

  it("returns both keys when present in options", () => {
    const result = resolveConfig(
      {
        env: {
          LANGFUSE_PUBLIC_KEY: "pk-opt",
          LANGFUSE_SECRET_KEY: "sk-opt",
        },
      },
      {}
    );
    expect(result.publicKey).toBe("pk-opt");
    expect(result.secretKey).toBe("sk-opt");
  });

  it("options take precedence over env", () => {
    const result = resolveConfig(
      {
        env: {
          LANGFUSE_PUBLIC_KEY: "pk-opt",
          LANGFUSE_SECRET_KEY: "sk-opt",
          LANGFUSE_BASEURL: "https://from-option.langfuse.com",
        },
      },
      {
        LANGFUSE_PUBLIC_KEY: "pk-env",
        LANGFUSE_SECRET_KEY: "sk-env",
        LANGFUSE_BASEURL: "https://from-env.langfuse.com",
      }
    );
    expect(result.publicKey).toBe("pk-opt");
    expect(result.secretKey).toBe("sk-opt");
    expect(result.baseUrl).toBe("https://from-option.langfuse.com");
  });

  it("uses default baseUrl when not provided", () => {
    const result = resolveConfig(
      {},
      { LANGFUSE_PUBLIC_KEY: "pk-123", LANGFUSE_SECRET_KEY: "sk-123" }
    );
    expect(result.baseUrl).toBe("https://cloud.langfuse.com");
  });

  it("uses custom baseUrl from env", () => {
    const result = resolveConfig(
      {},
      {
        LANGFUSE_PUBLIC_KEY: "pk-123",
        LANGFUSE_SECRET_KEY: "sk-123",
        LANGFUSE_BASEURL: "https://custom.langfuse.com",
      }
    );
    expect(result.baseUrl).toBe("https://custom.langfuse.com");
  });

  it("uses default environment when not provided", () => {
    const result = resolveConfig(
      {},
      { LANGFUSE_PUBLIC_KEY: "pk-123", LANGFUSE_SECRET_KEY: "sk-123" }
    );
    expect(result.environment).toBe("development");
  });

  it("uses custom environment from env", () => {
    const result = resolveConfig(
      {},
      {
        LANGFUSE_PUBLIC_KEY: "pk-123",
        LANGFUSE_SECRET_KEY: "sk-123",
        LANGFUSE_ENVIRONMENT: "production",
      }
    );
    expect(result.environment).toBe("production");
  });
});

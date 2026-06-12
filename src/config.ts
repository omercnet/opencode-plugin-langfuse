export type LangfusePluginOptions = {
  env?: {
    LANGFUSE_PUBLIC_KEY?: string;
    LANGFUSE_SECRET_KEY?: string;
    LANGFUSE_BASEURL?: string;
    LANGFUSE_ENVIRONMENT?: string;
  };
};

const DEFAULTS = {
  baseUrl: "https://cloud.langfuse.com",
  environment: "development",
} as const;

export const resolveConfig = (
  options?: LangfusePluginOptions,
  env: Record<string, string | undefined> = process.env
) => {
  const pluginEnv = options?.env ?? {};
  const publicKey = pluginEnv.LANGFUSE_PUBLIC_KEY ?? env.LANGFUSE_PUBLIC_KEY;
  const secretKey = pluginEnv.LANGFUSE_SECRET_KEY ?? env.LANGFUSE_SECRET_KEY;
  const baseUrl =
    pluginEnv.LANGFUSE_BASEURL ?? env.LANGFUSE_BASEURL ?? DEFAULTS.baseUrl;
  const environment =
    pluginEnv.LANGFUSE_ENVIRONMENT ??
    env.LANGFUSE_ENVIRONMENT ??
    DEFAULTS.environment;

  return {
    publicKey: publicKey ?? "",
    secretKey: secretKey ?? "",
    baseUrl,
    environment,
  };
};

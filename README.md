# OpenCode Langfuse Plugin

[![npm version](https://badge.fury.io/js/opencode-plugin-langfuse.svg)](https://www.npmjs.com/package/opencode-plugin-langfuse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Automatic LLM observability for OpenCode using Langfuse via OpenTelemetry.**

Zero-config tracing of sessions, messages, tool calls, costs, and performance.

---

## Installation

```bash
npm install opencode-plugin-langfuse
# or
bun add opencode-plugin-langfuse
```

---

## Setup

### 1. Get Langfuse Credentials

Sign up at [cloud.langfuse.com](https://cloud.langfuse.com) and create a project.

Go to **Settings → API Keys** and copy your keys.

### 2. Configure Environment

```bash
export LANGFUSE_PUBLIC_KEY="pk-lf-..."
export LANGFUSE_SECRET_KEY="sk-lf-..."
export LANGFUSE_BASEURL="https://cloud.langfuse.com"  # Optional
```

### 3. Enable Plugin + OTEL

In `.opencode/opencode.json`:

```json
{
  "experimental": {
    "openTelemetry": true
  },
  "plugin": ["opencode-plugin-langfuse"]
}
```

### 4. Run OpenCode

That's it! All traces appear automatically in your Langfuse dashboard.

---

## How It Works

This plugin initializes a `LangfuseSpanProcessor` that captures all OpenTelemetry spans emitted by OpenCode when `experimental.openTelemetry` is enabled.

```
OpenCode (OTEL spans) → LangfuseSpanProcessor → Langfuse Dashboard
```

---

## Environment Variables

| Variable              | Required | Default                      | Description            |
| --------------------- | -------- | ---------------------------- | ---------------------- |
| `LANGFUSE_PUBLIC_KEY` | Yes      | -                            | Langfuse public key    |
| `LANGFUSE_SECRET_KEY` | Yes      | -                            | Langfuse secret key    |
| `LANGFUSE_BASEURL`    | No       | `https://cloud.langfuse.com` | Self-hosted instance   |

---

## Self-Hosting

```bash
export LANGFUSE_BASEURL="https://langfuse.yourcompany.com"
```

See [Langfuse self-hosting docs](https://langfuse.com/docs/deployment/self-host).

---

## Troubleshooting

### No traces appearing

1. Verify `experimental.openTelemetry: true` is set
2. Check credentials: `echo $LANGFUSE_PUBLIC_KEY`
3. Check Langfuse health: `curl https://cloud.langfuse.com/api/public/health`

### Plugin not loading

- Ensure `opencode-plugin-langfuse` is in `dependencies` (not `devDependencies`)
- Verify `.opencode/opencode.json` syntax

---

## License

MIT © omercnet

---

## Related

- [OpenCode](https://opencode.ai/)
- [Langfuse](https://langfuse.com/)
- [Langfuse OTEL Integration](https://langfuse.com/docs/integrations/opentelemetry)

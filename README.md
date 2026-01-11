# OpenCode Langfuse Plugin

[![npm version](https://badge.fury.io/js/opencode-plugin-langfuse.svg)](https://www.npmjs.com/package/opencode-plugin-langfuse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Automatic LLM observability for OpenCode using Langfuse.**

Traces sessions, messages, tool calls, costs, and performance with zero manual instrumentation.

---

## Features

✅ **Automatic Deep Tracing** - Captures everything OpenCode does  
✅ **Session Lifecycle** - Tracks creation, idle, errors, deletion  
✅ **Message Generations** - Logs AI responses with model info  
✅ **Tool Executions** - Records tool calls as spans  
✅ **Cost Tracking** - Token usage and API costs  
✅ **Prompt Versioning** - A/B test prompts via `PROMPT_VERSION` env var  
✅ **Zero Code Changes** - Just install and configure  
✅ **Graceful Degradation** - Works with or without credentials

---

## Installation

```bash
npm install opencode-plugin-langfuse
# or
bun add opencode-plugin-langfuse
```

---

## Usage

### 1. Get Langfuse Credentials

Sign up at [cloud.langfuse.com](https://cloud.langfuse.com) and create a project.

Go to **Settings → API Keys** and copy:

- Public Key (`pk-lf-...`)
- Secret Key (`sk-lf-...`)

### 2. Configure Environment Variables

```bash
export LANGFUSE_PUBLIC_KEY="pk-lf-..."
export LANGFUSE_SECRET_KEY="sk-lf-..."
export LANGFUSE_BASEURL="https://cloud.langfuse.com"  # Optional, defaults to cloud
export PROMPT_VERSION="2025-01-baseline"              # Optional, for A/B testing
```

### 3. Enable Plugin

**Option A: In `.opencode/opencode.json`**

```json
{
  "plugin": ["opencode-plugin-langfuse"]
}
```

**Option B: Programmatically**

```typescript
import { LangfusePlugin } from "opencode-plugin-langfuse";

const config = {
  plugin: [
    LangfusePlugin({
      publicKey: "pk-lf-...",
      secretKey: "sk-lf-...",
      baseUrl: "https://cloud.langfuse.com",
      promptVersion: "2025-01-baseline",
      metadata: {
        environment: "production",
        team: "ai-team",
      },
      debug: false,
    }),
  ],
};
```

### 4. Run OpenCode

That's it! All traces appear automatically in your Langfuse dashboard.

---

## What Gets Traced?

| Event           | Langfuse Type | Data Captured                                    |
| --------------- | ------------- | ------------------------------------------------ |
| Session created | `trace`       | Session ID, title, user, project, prompt version |
| AI response     | `generation`  | Model, input, output, timestamps                 |
| Tool execution  | `span`        | Tool name, arguments, result, duration           |
| Session error   | `event`       | Error message, stack trace                       |
| Session idle    | `score`       | Message count, tool count, duration              |

---

## Configuration

### Environment Variables

| Variable              | Required | Default                      | Description                              |
| --------------------- | -------- | ---------------------------- | ---------------------------------------- |
| `LANGFUSE_PUBLIC_KEY` | Yes      | -                            | Langfuse public API key                  |
| `LANGFUSE_SECRET_KEY` | Yes      | -                            | Langfuse secret API key                  |
| `LANGFUSE_BASEURL`    | No       | `https://cloud.langfuse.com` | Langfuse instance URL (for self-hosting) |
| `PROMPT_VERSION`      | No       | -                            | Prompt version for A/B testing           |

### Plugin Options

```typescript
interface LangfusePluginConfig {
  publicKey?: string; // Or use LANGFUSE_PUBLIC_KEY
  secretKey?: string; // Or use LANGFUSE_SECRET_KEY
  baseUrl?: string; // Or use LANGFUSE_BASEURL
  promptVersion?: string; // Or use PROMPT_VERSION
  metadata?: Record<string, string | number | boolean>; // Extra metadata
  debug?: boolean; // Enable debug logging (default: false)
}
```

---

## Prompt Versioning & A/B Testing

Track different prompt versions to optimize performance over time.

### Example Workflow

**1. Collect Baseline Data**

```bash
PROMPT_VERSION="2025-01-baseline" opencode
```

**2. Analyze in Langfuse Dashboard**

- Filter traces by `promptVersion` tag
- Check success rates, costs, latency
- Identify patterns in failures

**3. Test Experimental Version**

```bash
PROMPT_VERSION="2025-02-experimental" opencode
```

**4. Compare Results**

- Filter by version in Langfuse
- Compare metrics side-by-side
- Promote winner to default

---

## Self-Hosting Langfuse

Deploy your own Langfuse instance:

```bash
# Docker Compose
docker-compose up -d

# Point plugin to your instance
export LANGFUSE_BASEURL="https://langfuse.yourcompany.com"
```

See [Langfuse self-hosting docs](https://langfuse.com/docs/deployment/self-host) for details.

---

## Example Traces

### Session Trace

```
📊 Trace: "OpenCode Session"
├─ 🤖 Generation: ai-response (model: claude-sonnet-4)
│   Input: "What files changed?"
│   Output: "Here are the modified files..."
├─ 🔧 Span: tool.git-diff
│   Input: { path: "." }
│   Output: { files: [...] }
├─ 🤖 Generation: ai-response
│   Output: "I've analyzed the changes..."
└─ 📈 Scores:
    - messages-count: 4
    - tools-count: 2
    - duration-ms: 5432
```

---

## Debugging

Enable debug logging to see what the plugin is doing:

```typescript
LangfusePlugin({
  debug: true,
});
```

Or via environment:

```bash
# No env var for debug yet, use config
```

Output:

```
[Langfuse Plugin] Session created: ses_abc123
[Langfuse Plugin] Tool starting (session: ses_abc123): git-diff
[Langfuse Plugin] Tool executed (session: ses_abc123): git-diff
[Langfuse Plugin] Message part updated (session: ses_abc123): Here are the modified files...
[Langfuse Plugin] Session idle (session: ses_abc123): 5432ms, 4 messages, 2 tools
[Langfuse Plugin] Trace flushed for session: ses_abc123
```

---

## Integration with GitHub Actions

Perfect for CI/CD workflows:

```yaml
name: Shuni AI Agent
on:
  workflow_dispatch:

jobs:
  run-agent:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run OpenCode with Langfuse
        env:
          LANGFUSE_PUBLIC_KEY: ${{ secrets.LANGFUSE_PUBLIC_KEY }}
          LANGFUSE_SECRET_KEY: ${{ secrets.LANGFUSE_SECRET_KEY }}
          LANGFUSE_BASEURL: ${{ secrets.LANGFUSE_BASEURL || 'https://cloud.langfuse.com' }}
          PROMPT_VERSION: ${{ github.event.inputs.prompt_version || '2025-01-baseline' }}
        run: |
          opencode run --prompt "Fix the issue"
```

---

## Comparison with Manual SDK

| Approach             | Code Changes                   | Depth                | Maintenance           |
| -------------------- | ------------------------------ | -------------------- | --------------------- |
| **Manual SDK**       | High (wrap every call)         | Shallow              | High (manual updates) |
| **This Plugin**      | **Zero**                       | **Deep (automatic)** | **Zero**              |
| **OTEL Integration** | Zero (when OpenCode adds OTEL) | Deepest              | Zero                  |

**This plugin bridges the gap until OpenCode has native OTEL support.**

---

## Troubleshooting

### Plugin doesn't load

- Check that `opencode-plugin-langfuse` is in `dependencies` (not `devDependencies`)
- Verify `.opencode/opencode.json` syntax
- Run with `debug: true` to see initialization errors

### No traces in Langfuse

- Verify credentials are correct: `echo $LANGFUSE_PUBLIC_KEY`
- Check Langfuse project exists
- Enable debug mode to see if plugin is active
- Check network: `curl https://cloud.langfuse.com/api/public/health`

### Traces incomplete

- Ensure session completes (reaches `session.idle` event)
- Check for errors in debug logs
- Langfuse has flush delay - wait 10-30 seconds

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Clone repo
git clone https://github.com/omercnet/opencode-plugin-langfuse.git

# Install dependencies
bun install

# Build
bun run build

# Test locally
cd example-project
bun link opencode-plugin-langfuse
```

---

## License

MIT © omercnet

---

## Related

- [OpenCode](https://opencode.ai/) - AI coding agent framework
- [Langfuse](https://langfuse.com/) - LLM observability platform

---

## Support

- 🐛 [Report bugs](https://github.com/omercnet/opencode-plugin-langfuse/issues)
- 💡 [Request features](https://github.com/omercnet/opencode-plugin-langfuse/issues)
- 💬 [Discussions](https://github.com/omercnet/opencode-plugin-langfuse/discussions)

---

<p align="center">
  <sub>Built with ❤️ by omercnet</sub>
</p>

# ToolTruth

ToolTruth is a WebMCP verification workbench that compares what a website's tools claim to do with what they actually do in an isolated browser session.

## Features

- Discovers registered WebMCP tools and their contracts
- Verifies one tool or every detected tool
- Captures timelines, browser state changes, network activity, logs, screenshots, and statistics
- Produces deterministic and AI-assisted contract analysis with clear pass, fail, or inconclusive results
- Supports local browser sessions and optional Browserbase live view and replay
- Includes URL safeguards, disposable sessions, and password-protected inspections

## Run locally

Requires Node.js 20.9+ and pnpm.

Install the dependencies:

```bash
pnpm install
```

Create a `.env.local` file:

```env
TOOLTRUTH_ACCESS_PASSWORD=choose-a-password
STAGEHAND_ENV=local
```

Optionally add `OPENROUTER_API_KEY=your-openrouter-key` to enable AI-generated inputs, evidence summaries, and semantic contract evaluation. Without it, ToolTruth falls back to deterministic analysis.

Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), enter a public WebMCP application URL and the password from `.env.local`, then run the detected tool verifications.

## Optional Browserbase setup

To use hosted browser sessions with live view and replay, update `.env.local`:

```env
STAGEHAND_ENV=browserbase
BROWSERBASE_API_KEY=your-api-key
BROWSERBASE_PROJECT_ID=your-project-id
```

For production, run `pnpm build` followed by `pnpm start`, configure the same environment variables on your hosting provider, and set `TOOLTRUTH_BLOCKED_HOSTNAMES` to the app's own comma-separated hostnames.

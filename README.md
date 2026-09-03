This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Inspection browser

Tool Truth uses the local isolated browser by default. Browserbase can inspect any
publicly resolvable HTTP or HTTPS application URL:

```bash
STAGEHAND_ENV=browserbase
BROWSERBASE_API_KEY=...
BROWSERBASE_PROJECT_ID=...
```

Inspection requests are protected by a server-only password. Set it in the local
environment and in the deployment environment before starting the app:

```bash
TOOLTRUTH_ACCESS_PASSWORD=use-a-long-unique-password
```

The app rejects inspection requests when this variable is missing or the submitted
password does not match. Do not prefix it with `NEXT_PUBLIC_`; it must never be
included in the browser bundle. After changing it on Vercel, redeploy the app so the
new value is available to the server.

Every Browserbase navigation, redirect, iframe, and HTTP(S) subresource request is
validated before it continues. Local, private, reserved, metadata, and explicitly
blocked ToolTruth destinations are rejected without requiring a static domain
allowlist.

ToolTruth can also reject its own public hostnames so it cannot recursively inspect
its workbench tools. Configure a comma-separated list of hostnames without schemes,
ports, or paths:

```bash
TOOLTRUTH_BLOCKED_HOSTNAMES=tooltruth.example.com,www.tooltruth.example.com
```

Browserbase discovery and verification sessions are disposable. Discovery closes
its session as soon as the tool contracts are captured, and verification closes
its session as soon as the runtime evidence is captured, before contract analysis.
Hosted sessions also have a five-minute maximum as a cleanup safety limit.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

import "server-only";

import {
  createServer,
  request as httpRequest,
  type ClientRequest,
  type ServerResponse,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { connect as connectSocket, type Socket } from "node:net";

import {
  UnsafeInspectionUrlError,
  validateInspectionUrl,
} from "@/features/inspect/server/validate-inspection-url";

const UPSTREAM_TIMEOUT_MS = 20_000;
const HOP_BY_HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

export type InspectionNetworkProxy = {
  url: string;
  close: () => Promise<void>;
};

const withoutHopByHopHeaders = (
  headers: Record<string, string | string[] | undefined>,
) => {
  const forwarded = { ...headers };
  for (const header of HOP_BY_HOP_HEADERS) delete forwarded[header];
  return forwarded;
};

const sendProxyError = (
  response: ServerResponse,
  error: unknown,
) => {
  if (response.destroyed) return;
  if (response.headersSent) {
    response.destroy();
    return;
  }

  response.writeHead(error instanceof UnsafeInspectionUrlError ? 403 : 502, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(
    error instanceof UnsafeInspectionUrlError
      ? "Blocked unsafe browser destination."
      : "The browser destination could not be reached.",
  );
};

export const startInspectionNetworkProxy = async () => {
  const clientSockets = new Set<Socket>();
  const upstreamRequests = new Set<ClientRequest>();
  const upstreamSockets = new Set<Socket>();
  let closing = false;
  const server = createServer((incoming, outgoing) => {
    let cancelled = incoming.destroyed || outgoing.destroyed;
    const markCancelled = () => {
      cancelled = true;
    };
    incoming.once("aborted", markCancelled);
    outgoing.once("close", markCancelled);

    void (async () => {
      try {
        const target = await validateInspectionUrl(incoming.url ?? "");
        if (closing || cancelled || incoming.destroyed || outgoing.destroyed) {
          return;
        }

        const targetUrl = new URL(target.url);
        const address = target.resolvedAddresses[0];
        if (!address) {
          throw new UnsafeInspectionUrlError(
            "The hostname did not resolve to a public address.",
          );
        }

        const headers = withoutHopByHopHeaders(incoming.headers);
        headers.host = targetUrl.host;
        const requestTarget = {
          hostname: address,
          port:
            targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
          path: `${targetUrl.pathname}${targetUrl.search}`,
          method: incoming.method,
          headers,
          servername: targetUrl.hostname,
          timeout: UPSTREAM_TIMEOUT_MS,
        };
        const requestUpstream =
          targetUrl.protocol === "https:" ? httpsRequest : httpRequest;
        const upstream = requestUpstream(requestTarget, (upstreamResponse) => {
          outgoing.writeHead(
            upstreamResponse.statusCode ?? 502,
            upstreamResponse.statusMessage,
            withoutHopByHopHeaders(upstreamResponse.headers),
          );
          upstreamResponse.pipe(outgoing);
        });
        upstreamRequests.add(upstream);
        upstream.once("close", () => upstreamRequests.delete(upstream));

        upstream.on("timeout", () => {
          upstream.destroy(new Error("The browser destination timed out."));
        });
        upstream.on("error", (error) => {
          if (!cancelled) sendProxyError(outgoing, error);
        });
        incoming.on("aborted", () => upstream.destroy());
        outgoing.on("close", () => {
          if (!outgoing.writableFinished) upstream.destroy();
        });
        incoming.pipe(upstream);
      } catch (error) {
        if (!cancelled) sendProxyError(outgoing, error);
      }
    })();
  });

  server.on("connection", (socket) => {
    clientSockets.add(socket);
    socket.once("close", () => clientSockets.delete(socket));
  });
  server.on("connect", (request, clientSocket, head) => {
    let cancelled = clientSocket.destroyed;
    clientSocket.once("close", () => {
      cancelled = true;
    });

    void (async () => {
      try {
        const authority = new URL(`https://${request.url ?? ""}/`);
        const target = await validateInspectionUrl(authority.toString());
        if (closing || cancelled || clientSocket.destroyed) return;

        const address = target.resolvedAddresses[0];
        if (!address) {
          throw new UnsafeInspectionUrlError(
            "The hostname did not resolve to a public address.",
          );
        }

        const upstreamSocket = connectSocket({
          host: address,
          port: authority.port ? Number(authority.port) : 443,
        });
        upstreamSockets.add(upstreamSocket);
        upstreamSocket.once("close", () => {
          upstreamSockets.delete(upstreamSocket);
        });
        upstreamSocket.setTimeout(UPSTREAM_TIMEOUT_MS);
        upstreamSocket.once("connect", () => {
          clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          if (head.length > 0) upstreamSocket.write(head);
          clientSocket.pipe(upstreamSocket);
          upstreamSocket.pipe(clientSocket);
        });
        upstreamSocket.once("timeout", () => upstreamSocket.destroy());
        upstreamSocket.once("error", () => clientSocket.destroy());
        clientSocket.once("error", () => upstreamSocket.destroy());
        clientSocket.once("close", () => upstreamSocket.destroy());
      } catch {
        clientSocket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      }
    })();
  });
  server.on("clientError", (_error, socket) => {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("The inspection network proxy did not start.");
  }

  const close = async () => {
    if (closing) return;
    closing = true;
    for (const request of upstreamRequests) request.destroy();
    for (const socket of upstreamSockets) socket.destroy();
    for (const socket of clientSockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return {
    url: `http://127.0.0.1:${address.port}`,
    close,
  } satisfies InspectionNetworkProxy;
};

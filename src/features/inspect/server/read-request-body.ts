import "server-only";

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("The request body is too large.");
    this.name = "RequestBodyTooLargeError";
  }
}

export const readRequestBodyWithLimit = async (
  request: Request,
  maximumBytes: number,
) => {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RequestBodyTooLargeError();
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let bodyText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    byteLength += value.byteLength;
    if (byteLength > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new RequestBodyTooLargeError();
    }

    bodyText += decoder.decode(value, { stream: true });
  }

  return bodyText + decoder.decode();
};

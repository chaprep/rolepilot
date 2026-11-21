import "server-only";

export const MAX_RESEARCH_RESPONSE_BYTES = 5 * 1024 * 1024;

export class ResponseTooLarge extends Error {}

/** Cap decoded response bytes, including chunked and compressed bodies. */
export function boundedResponse(response: Response): Response {
  if (!response.body) return response;
  if (Number(response.headers.get("content-length")) > MAX_RESEARCH_RESPONSE_BYTES) {
    void response.body.cancel().catch(() => {});
    throw new ResponseTooLarge();
  }
  let bytes = 0;
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > MAX_RESEARCH_RESPONSE_BYTES) throw new ResponseTooLarge();
      controller.enqueue(chunk);
    },
  }));
  return new Response(body, { headers: response.headers, status: response.status, statusText: response.statusText });
}

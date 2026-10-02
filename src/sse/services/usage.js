import { saveRequestUsage } from "@/lib/usageDb.js";

// Record a successful non-chat request (TTS/STT/image/video/search/fetch) in
// usageHistory so per-user stats include non-chat traffic. These endpoints
// pass provider responses through without a token usage field — rows carry
// 0 tokens and simply count as requests (cost stays 0). Fail-open: never
// throws into the request path.
export function recordEndpointUsage({ provider, model, connectionId, userId, apiKey, endpoint, status = "ok" }) {
  try {
    saveRequestUsage({
      provider: provider || "unknown",
      model: model || "unknown",
      connectionId: connectionId || undefined,
      userId: userId || undefined,
      apiKey: apiKey || undefined,
      endpoint: endpoint || undefined,
      tokens: { prompt_tokens: 0, completion_tokens: 0 },
      status,
    }).catch(() => {});
  } catch {
    /* fail-open */
  }
}

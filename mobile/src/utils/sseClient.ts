/** React Native 兼容的 SSE 读取（fetch.body 不可用时降级 XHR） */

import type { GenerateProgressEvent } from "@travel-guide/shared";

function parseSSEChunk(text: string, onEvent: (evt: GenerateProgressEvent) => void) {
  const lines = text.split("\n");
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6).trim();
    if (!data) continue;
    try {
      onEvent(JSON.parse(data) as GenerateProgressEvent);
    } catch {
      /* ignore */
    }
  }
}

export async function readGenerateSSE(
  url: string,
  headers: Record<string, string>,
  onEvent: (evt: GenerateProgressEvent) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const res = await fetch(url, { headers, signal });
    const reader = res.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) parseSSEChunk(part, onEvent);
      }
      if (buffer) parseSSEChunk(buffer, onEvent);
      return true;
    }
  } catch {
    /* fallback below */
  }

  return readGenerateSSXHR(url, headers, onEvent, signal);
}

function readGenerateSSXHR(
  url: string,
  headers: Record<string, string>,
  onEvent: (evt: GenerateProgressEvent) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let lastLen = 0;
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    xhr.open("GET", url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(lastLen);
      lastLen = xhr.responseText.length;
      parseSSEChunk(chunk, onEvent);
    };
    xhr.onload = () => finish(true);
    xhr.onerror = () => finish(false);
    xhr.onabort = () => finish(false);

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        finish(false);
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send();
  });
}

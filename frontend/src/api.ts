const apiBase = (window.GRANT_ANALYST_CONFIG?.apiBase || "http://localhost:10000").replace(/\/$/, "");
const sessionKey = "grant-analyst-session-v1";

function browserSession() {
  let value = localStorage.getItem(sessionKey);
  if (!value) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    value = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem(sessionKey, value);
  }
  return value;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "x-grant-session": browserSession(),
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}

export async function download(path: string, filename: string) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { "x-grant-session": browserSession() },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || "Download failed.");
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export { apiBase };

const internalOrigin = "https://pact-internal.invalid";

export function safeNextPath(
  value: string | null,
  fallback = "/agreements/new",
) {
  if (!value?.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const target = new URL(value, internalOrigin);
    if (target.origin !== internalOrigin) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

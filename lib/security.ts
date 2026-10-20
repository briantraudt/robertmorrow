import { NextResponse } from "next/server";

type RateBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateBucket>();
let nextCleanup = 0;

export function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwarded ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimit(req: Request, name: string, max: number, windowMs: number) {
  const now = Date.now();
  if (now >= nextCleanup || buckets.size > 10000) {
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
    nextCleanup = now + 60000;
    // Bound memory even when many unique clients arrive in one warm instance.
    if (buckets.size > 10000) return { ok: false, retryAfter: 60 };
  }
  const key = `${name}:${clientIp(req)}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  bucket.count += 1;
  if (bucket.count <= max) return { ok: true, retryAfter: 0 };

  return {
    ok: false,
    retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
  };
}

export function rateLimitResponse(retryAfter: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: { "retry-after": String(retryAfter) },
    },
  );
}

export function isSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";

  const allowed = new Set<string>();
  try {
    allowed.add(new URL(req.url).origin);
  } catch {
    // Ignore malformed request URLs and rely on configured site URL below.
  }
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      allowed.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin);
    } catch {
      // Ignore malformed env value.
    }
  }

  return allowed.has(origin);
}

export function forbiddenOriginResponse() {
  return NextResponse.json({ error: "Forbidden." }, { status: 403 });
}

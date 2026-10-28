import { NextResponse } from "next/server";

// Offers are discontinued. Keep historical offer records, review links,
// and existing Stripe payment flows unchanged elsewhere in the app.
export async function POST() {
  return NextResponse.json(
    { error: "Offers are no longer accepted." },
    { status: 410 },
  );
}

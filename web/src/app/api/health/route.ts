// Liveness only. Database readiness belongs to a later phase.
export function GET() {
  return Response.json(
    { status: "ok", service: "pos-web" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ b: process.env.NEXT_PUBLIC_BUILD ?? '' }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}

import { errorResponse, requirePermission } from '@/lib/actions/guard';
import { containsText, prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/search?q=usb - product lookup for the command palette.
 * Guarded like every server action: 401 without a session, 403 without product:view.
 */
export async function GET(request: Request) {
  try {
    await requirePermission('product:view');
    const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 100);
    if (!q) return Response.json({ products: [] });

    const products = await prisma.product.findMany({
      where: { archived: false, OR: [{ name: containsText(q) }, { sku: containsText(q) }] },
      select: { id: true, sku: true, name: true, quantity: true, reorderLevel: true },
      orderBy: { name: 'asc' },
      take: 8,
    });
    return Response.json({ products }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

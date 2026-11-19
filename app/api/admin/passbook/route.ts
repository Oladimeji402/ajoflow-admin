import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/api/auth';
import { parsePagination, sanitizeSearch } from '@/lib/api/pagination';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/passbook?page=&pageSize=&search=&status=all|activated|not_activated
 * Paginated users with passbook activation status, plus overall stats.
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult.error || !authResult.user) {
    return authResult.error!;
  }

  const url = new URL(req.url);
  const { page, pageSize, from, to } = parsePagination(url);
  const search = sanitizeSearch(url.searchParams.get('search'));
  const status = url.searchParams.get('status') ?? 'all';

  const adminSupabase = createSupabaseAdminClient();

  try {
    let query = adminSupabase
      .from('profiles')
      .select('id, name, email, phone, passbook_activated, passbook_activated_at, wallet_balance, created_at', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status === 'activated') query = query.eq('passbook_activated', true);
    if (status === 'not_activated') query = query.neq('passbook_activated', true);
    if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);

    const [{ data: users, error: usersError, count }, totalRes, activatedRes] = await Promise.all([
      query,
      adminSupabase.from('profiles').select('id', { count: 'exact', head: true }),
      adminSupabase.from('profiles').select('id', { count: 'exact', head: true }).eq('passbook_activated', true),
    ]);

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 400 });
    }

    const totalAll = totalRes.count ?? 0;
    const activatedAll = activatedRes.count ?? 0;

    return NextResponse.json({
      data: users || [],
      pagination: {
        page,
        pageSize,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
      stats: {
        total: totalAll,
        activated: activatedAll,
        notActivated: Math.max(totalAll - activatedAll, 0),
      },
    });
  } catch (error) {
    console.error('Admin passbook fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch passbook data' }, { status: 500 });
  }
}

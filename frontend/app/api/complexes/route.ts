import { NextRequest, NextResponse } from 'next/server';
import { callBackend, requireEmail, UnauthorizedError } from '@/lib/backend';

export async function GET(request: NextRequest) {
  try {
    const email = await requireEmail();
    const areaGroup = request.nextUrl.searchParams.get('area_group');
    const qs = areaGroup ? `?area_group=${encodeURIComponent(areaGroup)}` : '';

    const res = await callBackend(`/api/complexes${qs}`, email);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ detail: e.message }, { status: 401 });
    }
    throw e;
  }
}

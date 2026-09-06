import { NextResponse } from 'next/server';
import { callBackend, requireEmail, UnauthorizedError } from '@/lib/backend';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const email = await requireEmail();
    const { id } = await params;
    const res = await callBackend(`/api/complexes/${encodeURIComponent(id)}`, email);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ detail: e.message }, { status: 401 });
    }
    throw e;
  }
}

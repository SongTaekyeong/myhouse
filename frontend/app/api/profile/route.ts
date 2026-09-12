import { NextResponse } from 'next/server';
import { callBackend, requireEmail, UnauthorizedError } from '@/lib/backend';

export async function GET() {
  try {
    const email = await requireEmail();
    const res = await callBackend('/api/profile', email);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ detail: e.message }, { status: 401 });
    }
    throw e;
  }
}

export async function POST(request: Request) {
  try {
    const email = await requireEmail();
    const body = await request.json();
    const res = await callBackend('/api/profile', email, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ detail: e.message }, { status: 401 });
    }
    throw e;
  }
}

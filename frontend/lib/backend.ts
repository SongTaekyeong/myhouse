// Next.js 서버(라우트 핸들러)에서만 쓰는 FastAPI 호출 헬퍼.
// 브라우저는 절대 이 파일을 import 하지 않는다 — 항상 서버 사이드에서만 실행됨.

import { auth } from '@/auth';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8001';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';

export class UnauthorizedError extends Error {}

/** 세션 확인 후 이메일을 반환. 세션 없으면 UnauthorizedError. */
export async function requireEmail(): Promise<string> {
  const session = await auth();
  if (!session?.user?.email) {
    throw new UnauthorizedError('인증이 필요합니다.');
  }
  return session.user.email;
}

/** FastAPI 호출. 내부 전용 비밀값 + 사용자 이메일을 헤더로 실어 보낸다. */
export async function callBackend(
  path: string,
  email: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      'X-Internal-Secret': INTERNAL_API_SECRET,
      'X-User-Email': email,
    },
  });
}

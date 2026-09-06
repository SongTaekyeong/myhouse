"""세션 검사. /api/health 외 전 엔드포인트에서 씀 (SPEC.md §10).

실제 Google OAuth 세션 검증은 Next.js(BFF)의 Auth.js가 담당한다.
FastAPI는 Next.js 서버가 보내는 요청만 신뢰하면 되므로, 여기서는
내부 전용 비밀값(X-Internal-Secret)과 이메일 화이트리스트만 확인한다.
브라우저가 이 비밀값을 알 방법은 없다 — Next.js 서버 프로세스에만 존재.
"""

import os

from fastapi import HTTPException, Request

AUTH_DISABLED = os.getenv("AUTH_DISABLED", "false").lower() == "true"
APP_ENV = os.getenv("APP_ENV", "development")
INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "")
ALLOWED_EMAILS = {e.strip() for e in os.getenv("ALLOWED_EMAILS", "").split(",") if e.strip()}


def _guard_auth_disabled_in_production() -> None:
    """운영에서 AUTH_DISABLED=true면 부팅 실패시킨다."""
    if AUTH_DISABLED and APP_ENV == "production":
        raise RuntimeError("AUTH_DISABLED=true 는 production 환경에서 금지된다 (SPEC.md §10).")


_guard_auth_disabled_in_production()


def require_session(request: Request) -> str:
    """세션 검사 후 로그인한 이메일을 반환한다. 실패하면 401/403."""
    if AUTH_DISABLED:
        return "dev@localhost"

    if request.headers.get("x-internal-secret") != INTERNAL_API_SECRET:
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")

    email = request.headers.get("x-user-email", "")
    if email not in ALLOWED_EMAILS:
        raise HTTPException(status_code=403, detail="허용되지 않은 계정입니다.")

    return email

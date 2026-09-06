"""단지 하드필터 + 스코어링. DB 접근 없는 순수 함수만 둔다 (SPEC.md §7)."""

import math

# --- 스코어링 상수 (튜닝 지점) ---
PRICE_IDEAL_LOW = 0.65   # price_recent / budget_cap 이 이 구간 안이면 만점
PRICE_IDEAL_HIGH = 0.95
COMMUTE_IDEAL_MINUTES = 15  # 이 시간 이하면 통근 만점
HOUSEHOLDS_FLOOR = 300      # 세대수 로그 스케일 하한
HOUSEHOLDS_CEIL = 3000      # 세대수 로그 스케일 상한


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def apply_hard_filters(complex_data: dict, profile: dict) -> list[str]:
    """걸리는 하드필터 사유를 전부 리스트로 반환 (없으면 빈 리스트)."""
    reasons = []

    if (complex_data.get("trade_cnt_12m") or 0) == 0:
        reasons.append("no_trade")

    price_recent = complex_data.get("price_recent")
    if price_recent is not None and price_recent > profile["budget_cap"]:
        reasons.append("budget")

    if (complex_data.get("total_households") or 0) < profile["min_households"]:
        reasons.append("households")

    commutes = complex_data.get("commutes", {})
    for dest in profile["destinations"]:
        t = commutes.get(dest["dest_id"])
        if t is not None and t > dest["max_minutes"]:
            reasons.append("commute")
            break

    return reasons


def score_commute(commutes: dict, destinations: list[dict]) -> float | None:
    """목적지별 clamp((max_min-t)/(max_min-15), 0, 1) 의 최솟값."""
    scores = []
    for dest in destinations:
        t = commutes.get(dest["dest_id"])
        if t is None:
            continue
        max_min = dest["max_minutes"]
        scores.append(clamp((max_min - t) / (max_min - COMMUTE_IDEAL_MINUTES)))
    return min(scores) if scores else None


def score_price(price_recent: float, budget_cap: float) -> float:
    """r = price_recent/budget_cap. [0.65, 0.95] 구간이면 1.0, 밖은 선형 감쇠.

    budget_cap 초과분은 하드필터(budget)에서 이미 걸러지므로 r<=1만 들어온다.
    """
    r = price_recent / budget_cap
    if PRICE_IDEAL_LOW <= r <= PRICE_IDEAL_HIGH:
        return 1.0
    if r < PRICE_IDEAL_LOW:
        return clamp(r / PRICE_IDEAL_LOW)
    return clamp(1 - (r - PRICE_IDEAL_HIGH) / (1 - PRICE_IDEAL_HIGH))


def score_households(total_households: float) -> float:
    return clamp(
        math.log10(total_households / HOUSEHOLDS_FLOOR)
        / math.log10(HOUSEHOLDS_CEIL / HOUSEHOLDS_FLOOR)
    )


def score_complex(complex_data: dict, profile: dict) -> dict:
    """단지 하나에 대한 점수/컴포넌트/제외사유/통근상태를 계산한다.

    complex_data: {
        "total_households": int,
        "price_recent": float | None,
        "trade_cnt_12m": int,
        "commutes": {dest_id: est_minutes | None},
    }
    """
    excluded_by = apply_hard_filters(complex_data, profile)

    commutes = complex_data.get("commutes", {})
    commute_status = (
        "pending"
        if any(commutes.get(d["dest_id"]) is None for d in profile["destinations"])
        else "ok"
    )

    price_recent = complex_data.get("price_recent")
    total_households = complex_data.get("total_households")

    components = {
        "commute": None if commute_status == "pending" else score_commute(commutes, profile["destinations"]),
        "price": score_price(price_recent, profile["budget_cap"]) if price_recent is not None else None,
        "households": score_households(total_households) if total_households else None,
    }

    # 사용 불가한 컴포넌트는 가중치에서 빼고 나머지로 재정규화
    weights = {k: w for k, w in profile["weights"].items() if components.get(k) is not None}
    weight_sum = sum(weights.values())

    if excluded_by or weight_sum == 0:
        score = None
    else:
        score = sum(components[k] * w for k, w in weights.items()) / weight_sum * 100

    return {
        "score": score,
        "components": components,
        "excluded_by": excluded_by,
        "commute_status": commute_status,
    }

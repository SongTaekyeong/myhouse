// backend/scoring.py 의 가중합 공식과 반드시 동일하게 유지할 것 (CLAUDE.md).
// 슬라이더/예산 입력은 이 파일로 클라이언트에서 재계산 — API 재호출 없음.

export const PRICE_IDEAL_LOW = 0.65;
export const PRICE_IDEAL_HIGH = 0.95;

export interface Components {
  commute: number | null;
  price: number | null;
  households: number | null;
}

export interface Weights {
  commute: number;
  price: number;
  households: number;
}

function clamp(value: number, low = 0, high = 1): number {
  return Math.max(low, Math.min(high, value));
}

/** backend scoring.py의 score_price와 동일한 공식. */
export function scorePrice(priceRecent: number, budgetCap: number): number {
  const r = priceRecent / budgetCap;
  if (r >= PRICE_IDEAL_LOW && r <= PRICE_IDEAL_HIGH) return 1.0;
  if (r < PRICE_IDEAL_LOW) return clamp(r / PRICE_IDEAL_LOW);
  return clamp(1 - (r - PRICE_IDEAL_HIGH) / (1 - PRICE_IDEAL_HIGH));
}

/** 컴포넌트 중 null(계산 불가)은 가중치에서 빼고 재정규화 — scoring.py의 score_complex와 동일. */
export function computeScore(components: Components, weights: Weights): number | null {
  const keys = (Object.keys(weights) as (keyof Weights)[]).filter(
    (k) => components[k] !== null
  );
  const weightSum = keys.reduce((sum, k) => sum + weights[k], 0);
  if (weightSum === 0) return null;

  const weighted = keys.reduce(
    (sum, k) => sum + (components[k] as number) * weights[k],
    0
  );
  return (weighted / weightSum) * 100;
}

/** 예산 입력이 바뀔 때 price 컴포넌트와 budget 하드필터를 다시 계산한다. */
export function recomputeForBudget(
  priceRecent: number | null,
  budgetCap: number,
  baseComponents: Components,
  excludedByWithoutBudget: string[]
): { components: Components; excludedBy: string[] } {
  if (priceRecent === null) {
    return {
      components: { ...baseComponents, price: null },
      excludedBy: excludedByWithoutBudget,
    };
  }

  const excludedBy = [...excludedByWithoutBudget];
  if (priceRecent > budgetCap) {
    excludedBy.push('budget');
  }

  return {
    components: { ...baseComponents, price: scorePrice(priceRecent, budgetCap) },
    excludedBy,
  };
}

export function scoreColor(score: number | null): string {
  if (score === null) return '#9ca3af'; // 회색 — 제외됨
  if (score >= 85) return '#166534'; // 진초록
  if (score >= 70) return '#4ade80'; // 연초록
  if (score >= 55) return '#facc15'; // 노랑
  return '#9ca3af'; // 회색
}

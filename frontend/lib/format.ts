/** 금액(원)을 "23억 5,000" 형태로 표시 (CLAUDE.md: 금액은 원 정수 저장, 표시만 억/만원). */
export function formatPriceKrw(won: number): string {
  const eok = Math.floor(won / 100_000_000);
  const remainderMan = Math.round((won % 100_000_000) / 10_000);
  if (eok === 0) return `${remainderMan.toLocaleString()}만`;
  if (remainderMan === 0) return `${eok}억`;
  return `${eok}억 ${remainderMan.toLocaleString()}`;
}

/** YYYYMM -> "2008년 7월" */
export function formatBuiltYm(ym: string | null): string {
  if (!ym || ym.length !== 6) return '준공년월 미상';
  const year = ym.slice(0, 4);
  const month = parseInt(ym.slice(4, 6), 10);
  return `${year}년 ${month}월`;
}

export function formatMinutes(min: number | null): string {
  if (min === null) return '확인 중';
  return `${Math.round(min)}분`;
}

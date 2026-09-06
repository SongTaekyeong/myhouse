export interface ComplexItem {
  complex_id: string;
  name: string;
  lat: number;
  lng: number;
  total_households: number;
  total_dongs: number;
  built_ym: string;
  price_recent: number | null;
  commutes: Record<string, number | null>;
  score: number | null;
  components: {
    commute: number | null;
    price: number | null;
    households: number | null;
  };
  excluded_by: string[];
  commute_status: 'ok' | 'pending';
}

export interface ComplexesResponse {
  complexes: ComplexItem[];
  shown: number;
  excluded: number;
}

export interface Destination {
  dest_id: string;
  label: string;
  lat: number;
  lng: number;
  max_minutes: number;
}

export interface Profile {
  destinations: Destination[];
  budget_cap: number;
  min_households: number;
  area_group: string;
  weights: { commute: number; price: number; households: number };
}

// 브라우저는 항상 같은 origin의 Next.js 라우트 핸들러(/api/...)만 호출한다.
// 실제 FastAPI 백엔드 호출은 그 라우트 핸들러 안(서버 사이드)에서 일어난다 — lib/backend.ts 참고.

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`API 요청 실패: ${path} (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function fetchComplexes(areaGroup?: string): Promise<ComplexesResponse> {
  const qs = areaGroup ? `?area_group=${encodeURIComponent(areaGroup)}` : '';
  return apiFetch<ComplexesResponse>(`/api/complexes${qs}`);
}

export const AREA_GROUPS = ['~20', '20-25', '25-30', '30-40', '40~'] as const;

export function fetchProfile(): Promise<Profile> {
  return apiFetch<Profile>('/api/profile');
}

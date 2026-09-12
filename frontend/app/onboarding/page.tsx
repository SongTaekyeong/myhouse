'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AREA_GROUPS, fetchProfile, saveProfile, saveDestination, deleteDestination, type Weights } from '@/lib/api';
import { geocodeAddress, reverseGeocode } from '@/lib/kakao';

interface DestinationInput {
  id: string;
  label: string;
  address: string;
  maxMinutes: number;
  status: 'idle' | 'checking' | 'ok' | 'error';
  lat?: number;
  lng?: number;
  resolvedAddress?: string;
  fromDb?: boolean; // 이미 dim_destination에 저장돼 있던 것 (삭제 시 실제 DELETE 필요)
}

const DEFAULT_WEIGHTS: Weights = { commute: 0.4, price: 0.35, households: 0.25 };

function newDestination(): DestinationInput {
  return {
    id: `dest_${Math.random().toString(36).slice(2, 9)}`,
    label: '',
    address: '',
    maxMinutes: 40,
    status: 'idle',
  };
}

export default function OnboardingPage() {
  const router = useRouter();
  const [destinations, setDestinations] = useState<DestinationInput[]>([newDestination()]);
  const [budgetEok, setBudgetEok] = useState(12);
  const [minHouseholds, setMinHouseholds] = useState(500);
  const [areaGroup, setAreaGroup] = useState<string>('25-30');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);

  useEffect(() => {
    let cancelled = false;

    fetchProfile()
      .then(async (p) => {
        if (cancelled) return;
        if (!p.has_profile) {
          setLoaded(true);
          return;
        }
        setIsEditing(true);
        setBudgetEok(p.budget_cap / 100_000_000);
        setMinHouseholds(p.min_households);
        setAreaGroup(p.area_group);
        setWeights(p.weights);

        if (p.destinations.length > 0) {
          const filled = await Promise.all(
            p.destinations.map(async (d) => {
              const address = await reverseGeocode(d.lat, d.lng);
              return {
                id: d.dest_id,
                label: d.label,
                address: address ?? '',
                maxMinutes: d.max_minutes,
                status: 'ok' as const,
                lat: d.lat,
                lng: d.lng,
                resolvedAddress: address ?? '등록된 위치',
                fromDb: true,
              };
            })
          );
          if (!cancelled) setDestinations(filled);
        }
        if (!cancelled) setLoaded(true);
      })
      .catch(() => setLoaded(true));

    return () => {
      cancelled = true;
    };
  }, []);

  function updateDest(id: string, patch: Partial<DestinationInput>) {
    setDestinations((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  async function handleCheckAddress(id: string) {
    const dest = destinations.find((d) => d.id === id);
    if (!dest || !dest.address.trim()) return;

    updateDest(id, { status: 'checking' });
    const result = await geocodeAddress(dest.address.trim());
    if (result) {
      updateDest(id, {
        status: 'ok',
        lat: result.lat,
        lng: result.lng,
        resolvedAddress: result.addressName,
      });
    } else {
      updateDest(id, { status: 'error', lat: undefined, lng: undefined });
    }
  }

  function addDestination() {
    setDestinations((prev) => [...prev, newDestination()]);
  }

  function removeDestination(id: string) {
    const target = destinations.find((d) => d.id === id);
    setDestinations((prev) => prev.filter((d) => d.id !== id));
    if (target?.fromDb) {
      deleteDestination(id).catch(() => {
        setError('목적지 삭제에 실패했어요. 새로고침 후 다시 시도해주세요.');
      });
    }
  }

  const validDestinations = destinations.filter((d) => d.status === 'ok' && d.label.trim());
  const canSubmit = validDestinations.length > 0 && !submitting;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      for (const dest of validDestinations) {
        await saveDestination({
          dest_id: dest.id,
          label: dest.label.trim(),
          lat: dest.lat as number,
          lng: dest.lng as number,
          max_minutes: dest.maxMinutes,
        });
      }
      await saveProfile({
        budget_cap: Math.round(budgetEok * 100_000_000),
        min_households: minHouseholds,
        area_group: areaGroup,
        weights,
      });
      router.push('/');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했어요. 다시 시도해주세요.');
      setSubmitting(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <span className="text-sm text-gray-400">불러오는 중…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {isEditing ? '설정 수정하기' : '내집 시작하기'}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {isEditing
              ? '목적지·예산·세대수·평형을 다시 설정할 수 있어요.'
              : '조건을 입력하면, 딱 맞는 단지만 지도에 보여드려요. 가중치는 지도 화면에서 바로 조정할 수 있어요.'}
          </p>
          {isEditing && (
            <Link href="/" className="mt-2 inline-block text-xs font-medium text-blue-600 hover:text-blue-700">
              ← 지도로 돌아가기
            </Link>
          )}
        </div>

        <div className="space-y-5">
          {/* 목적지 */}
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
            <h2 className="text-base font-semibold text-gray-900">통근 목적지</h2>
            <p className="mt-1 text-sm text-gray-500">
              직장 등 자주 가는 곳의 주소와, 그곳까지 허용할 수 있는 통근시간을 알려주세요.
            </p>

            <div className="mt-4 space-y-4">
              {destinations.map((dest, idx) => (
                <div key={dest.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-400">목적지 {idx + 1}</span>
                    {destinations.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDestination(dest.id)}
                        className="text-xs text-gray-400 transition hover:text-gray-700"
                      >
                        삭제
                      </button>
                    )}
                  </div>

                  <input
                    type="text"
                    placeholder="이름 (예: 본인 직장)"
                    value={dest.label}
                    onChange={(e) => updateDest(dest.id, { label: e.target.value })}
                    className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />

                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      placeholder="도로명 주소 검색 (예: 테헤란로 152)"
                      value={dest.address}
                      onChange={(e) => updateDest(dest.id, { address: e.target.value, status: 'idle' })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCheckAddress(dest.id);
                        }
                      }}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleCheckAddress(dest.id)}
                      disabled={dest.status === 'checking' || !dest.address.trim()}
                      className="shrink-0 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {dest.status === 'checking' ? '확인 중…' : '주소 확인'}
                    </button>
                  </div>

                  {dest.status === 'ok' && (
                    <p className="mt-2 flex items-center gap-1 text-xs font-medium text-green-600">
                      <span aria-hidden>✓</span> {dest.resolvedAddress}
                    </p>
                  )}
                  {dest.status === 'error' && (
                    <p className="mt-2 text-xs font-medium text-red-500">
                      주소를 찾을 수 없어요. 철자를 확인하고 다시 시도해주세요.
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-3">
                    <label className="w-20 shrink-0 text-xs text-gray-500">허용 통근시간</label>
                    <input
                      type="range"
                      min={15}
                      max={90}
                      step={5}
                      value={dest.maxMinutes}
                      onChange={(e) => updateDest(dest.id, { maxMinutes: Number(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-700">
                      {dest.maxMinutes}분
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addDestination}
              className="mt-3 text-sm font-medium text-blue-600 transition hover:text-blue-700"
            >
              + 목적지 추가
            </button>
          </section>

          {/* 예산 */}
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
            <h2 className="text-base font-semibold text-gray-900">예산 상한</h2>
            <p className="mt-1 text-sm text-gray-500">이 금액을 넘는 단지는 지도에서 자동으로 제외돼요.</p>
            <div className="mt-4 flex items-center gap-2">
              <input
                type="number"
                min={1}
                step={0.5}
                value={budgetEok}
                onChange={(e) => setBudgetEok(Number(e.target.value))}
                className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-500">억원까지</span>
            </div>
          </section>

          {/* 세대수 */}
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
            <h2 className="text-base font-semibold text-gray-900">최소 세대수</h2>
            <p className="mt-1 text-sm text-gray-500">너무 작은 단지는 빼고 보고 싶다면 기준을 올려주세요.</p>
            <div className="mt-4 flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={100}
                value={minHouseholds}
                onChange={(e) => setMinHouseholds(Number(e.target.value))}
                className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-500">세대 이상</span>
            </div>
          </section>

          {/* 평형 */}
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
            <h2 className="text-base font-semibold text-gray-900">관심 평형 (전용면적)</h2>
            <select
              value={areaGroup}
              onChange={(e) => setAreaGroup(e.target.value)}
              className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {AREA_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}㎡
                </option>
              ))}
            </select>
          </section>
        </div>

        {error && <p className="mt-4 text-center text-sm font-medium text-red-500">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="mt-6 w-full rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? '저장 중…' : isEditing ? '저장하고 지도로 돌아가기' : '지도 보러 가기'}
        </button>

        {validDestinations.length === 0 && (
          <p className="mt-2 text-center text-xs text-gray-400">
            목적지를 하나 이상 등록하고 &quot;주소 확인&quot;까지 마쳐야 시작할 수 있어요.
          </p>
        )}
      </div>
    </div>
  );
}

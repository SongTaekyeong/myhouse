'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { fetchComplexes, fetchProfile, AREA_GROUPS, type ComplexItem, type Profile } from '@/lib/api';
import { computeScore, recomputeForBudget, type Weights } from '@/lib/score';
import WeightPanel from '@/components/WeightPanel';

// 카카오맵은 브라우저 SDK를 로드하므로 서버 렌더링 대상에서 제외 (CLAUDE.md).
const Map = dynamic(() => import('@/components/Map'), { ssr: false });

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rawComplexes, setRawComplexes] = useState<ComplexItem[]>([]);
  const [weights, setWeights] = useState<Weights | null>(null);
  const [budgetCap, setBudgetCap] = useState<number | null>(null);
  const [areaGroup, setAreaGroup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile()
      .then((p) => {
        setProfile(p);
        setWeights(p.weights);
        setBudgetCap(p.budget_cap);
        setAreaGroup(p.area_group);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (areaGroup === null) return;

    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const res = await fetchComplexes(areaGroup as string);
        if (!cancelled) setRawComplexes(res.complexes);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();

    return () => {
      cancelled = true;
    };
  }, [areaGroup]);

  // 가중치/예산 변경은 API 재호출 없이 여기서 클라이언트 재계산 (CLAUDE.md).
  const complexes = useMemo<ComplexItem[]>(() => {
    if (!weights || budgetCap === null) return rawComplexes;

    return rawComplexes.map((item) => {
      const baseExcludedBy = item.excluded_by.filter((r) => r !== 'budget');
      const { components, excludedBy } = recomputeForBudget(
        item.price_recent,
        budgetCap,
        item.components,
        baseExcludedBy
      );
      const score = excludedBy.length === 0 ? computeScore(components, weights) : null;
      return { ...item, components, excluded_by: excludedBy, score };
    });
  }, [rawComplexes, weights, budgetCap]);

  const shownCount = complexes.filter((c) => c.excluded_by.length === 0).length;
  const excludedCount = complexes.length - shownCount;

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="absolute left-4 top-4 z-10 flex items-center gap-3 rounded-lg bg-white/95 px-4 py-2 text-sm shadow-lg backdrop-blur">
        <span className="font-semibold">
          표시 {shownCount} · 제외 {excludedCount}
        </span>
        {areaGroup && (
          <select
            value={areaGroup}
            onChange={(e) => setAreaGroup(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          >
            {AREA_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}㎡
              </option>
            ))}
          </select>
        )}
        {loading && <span className="text-xs text-gray-400">불러오는 중…</span>}
      </div>

      {profile && weights && budgetCap !== null && (
        <WeightPanel
          weights={weights}
          budgetCap={budgetCap}
          onWeightsChange={setWeights}
          onBudgetChange={setBudgetCap}
        />
      )}

      <Map complexes={complexes} destinations={profile?.destinations ?? []} />
    </div>
  );
}

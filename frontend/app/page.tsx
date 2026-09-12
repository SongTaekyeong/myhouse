'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchComplexes, fetchProfile, saveProfile, AREA_GROUPS, type ComplexItem, type Profile } from '@/lib/api';
import { computeScore, recomputeForBudget, type Weights } from '@/lib/score';
import WeightPanel from '@/components/WeightPanel';

// 카카오맵은 브라우저 SDK를 로드하므로 서버 렌더링 대상에서 제외 (CLAUDE.md).
const Map = dynamic(() => import('@/components/Map'), { ssr: false });

export default function Home() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rawComplexes, setRawComplexes] = useState<ComplexItem[]>([]);
  const [weights, setWeights] = useState<Weights | null>(null);
  const [budgetCap, setBudgetCap] = useState<number | null>(null);
  const [areaGroup, setAreaGroup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const skipNextSave = useRef(true);

  useEffect(() => {
    fetchProfile()
      .then((p) => {
        if (!p.has_profile) {
          router.replace('/onboarding');
          return;
        }
        setProfile(p);
        setWeights(p.weights);
        setBudgetCap(p.budget_cap);
        setAreaGroup(p.area_group);
      })
      .catch((e) => setError(String(e)));
  }, [router]);

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

  // 가중치/예산/평형 조정은 화면 재계산과는 별개로, 디바운스해서 profiles에 저장해둔다 —
  // 그래야 "설정" 화면을 오가거나 다시 로그인해도 값이 유지된다.
  useEffect(() => {
    if (skipNextSave.current) {
      // 최초 로드(프로필을 막 받아온 시점)는 저장할 필요 없음
      if (weights && budgetCap !== null && areaGroup && profile) {
        skipNextSave.current = false;
      }
      return;
    }
    if (!weights || budgetCap === null || !areaGroup || !profile) return;

    const timer = setTimeout(() => {
      saveProfile({
        budget_cap: budgetCap,
        min_households: profile.min_households,
        area_group: areaGroup,
        weights,
      }).catch(() => {
        // 자동 저장 실패는 조용히 무시 — 다음 변경 때 다시 시도됨
      });
    }, 600);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weights, budgetCap, areaGroup]);

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
      <div className="flex h-screen items-center justify-center bg-gray-50 text-sm font-medium text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-100">
      <div className="absolute left-4 top-4 z-10 flex items-center gap-3 rounded-xl bg-white/95 px-4 py-2.5 shadow-lg ring-1 ring-black/5 backdrop-blur">
        <span className="text-sm font-semibold tabular-nums text-gray-900">
          표시 {shownCount} · 제외 {excludedCount}
        </span>
        <span className="h-4 w-px bg-gray-200" aria-hidden />
        {areaGroup && (
          <select
            value={areaGroup}
            onChange={(e) => setAreaGroup(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 transition hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {AREA_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}㎡
              </option>
            ))}
          </select>
        )}
        {loading && <span className="text-xs text-gray-400">불러오는 중…</span>}
        <span className="h-4 w-px bg-gray-200" aria-hidden />
        <Link
          href="/onboarding"
          className="text-xs font-medium text-gray-500 underline decoration-gray-300 decoration-dotted underline-offset-4 transition hover:text-gray-800 hover:decoration-gray-500"
        >
          설정
        </Link>
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

'use client';

import type { Weights } from '@/lib/score';

interface WeightPanelProps {
  weights: Weights;
  budgetCap: number;
  onWeightsChange: (weights: Weights) => void;
  onBudgetChange: (budget: number) => void;
}

const LABELS: Record<keyof Weights, string> = {
  commute: '통근',
  price: '가격',
  households: '세대수',
};

const DESCRIPTIONS: Record<keyof Weights, string> = {
  commute: '값을 올릴수록 통근이 가까운 단지의 점수가 더 크게 올라가요',
  price: '값을 올릴수록 예산 대비 가격이 적당한 단지의 점수가 더 크게 올라가요',
  households: '값을 올릴수록 세대수가 많은 단지의 점수가 더 크게 올라가요',
};

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className="h-3.5 w-3.5 shrink-0 cursor-help text-gray-400 transition hover:text-gray-600"
        aria-hidden
      >
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="8" cy="5.2" r="0.9" fill="currentColor" />
        <rect x="7.3" y="7.2" width="1.4" height="4.4" rx="0.7" fill="currentColor" />
      </svg>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-44 -translate-x-1/2 rounded-lg bg-gray-900 px-2.5 py-1.5 text-[11px] leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
      >
        {text}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
      </span>
    </span>
  );
}

export default function WeightPanel({
  weights,
  budgetCap,
  onWeightsChange,
  onBudgetChange,
}: WeightPanelProps) {
  function handleSlider(key: keyof Weights, value: number) {
    onWeightsChange({ ...weights, [key]: value });
  }

  const weightSum = weights.commute + weights.price + weights.households;

  return (
    <div className="absolute bottom-4 left-4 z-10 w-72 rounded-2xl bg-white/95 p-5 shadow-lg ring-1 ring-black/5 backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">가중치</span>
        <span className="text-[11px] tabular-nums text-gray-400">합 {weightSum.toFixed(2)}</span>
      </div>

      <div className="space-y-3.5">
        {(Object.keys(LABELS) as (keyof Weights)[]).map((key) => (
          <div key={key} className="flex items-center gap-2.5">
            <span className="flex w-16 shrink-0 items-center gap-1 text-xs font-medium text-gray-700">
              {LABELS[key]}
              <InfoTooltip text={DESCRIPTIONS[key]} />
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={weights[key]}
              onChange={(e) => handleSlider(key, Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer accent-blue-600"
            />
            <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-900">
              {weights[key].toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-gray-200 pt-4">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
          예산 상한
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step={0.5}
            value={budgetCap / 100_000_000}
            onChange={(e) => onBudgetChange(Number(e.target.value) * 100_000_000)}
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm font-medium text-gray-900 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="shrink-0 text-xs font-medium text-gray-500">억원</span>
        </div>
      </div>
    </div>
  );
}

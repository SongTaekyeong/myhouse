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

export default function WeightPanel({
  weights,
  budgetCap,
  onWeightsChange,
  onBudgetChange,
}: WeightPanelProps) {
  function handleSlider(key: keyof Weights, value: number) {
    onWeightsChange({ ...weights, [key]: value });
  }

  return (
    <div className="absolute bottom-4 left-4 z-10 w-64 rounded-lg bg-white/95 p-4 shadow-lg backdrop-blur">
      <div className="mb-3 text-xs font-semibold text-gray-500">가중치</div>
      {(Object.keys(LABELS) as (keyof Weights)[]).map((key) => (
        <div key={key} className="mb-2 flex items-center gap-2">
          <span className="w-14 text-xs text-gray-600">{LABELS[key]}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={weights[key]}
            onChange={(e) => handleSlider(key, Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-8 text-right text-xs tabular-nums text-gray-500">
            {weights[key].toFixed(2)}
          </span>
        </div>
      ))}

      <div className="mt-3 border-t border-gray-200 pt-3">
        <label className="mb-1 block text-xs font-semibold text-gray-500">
          예산 상한 (억원)
        </label>
        <input
          type="number"
          min={0}
          step={0.5}
          value={budgetCap / 100_000_000}
          onChange={(e) => onBudgetChange(Number(e.target.value) * 100_000_000)}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </div>
    </div>
  );
}

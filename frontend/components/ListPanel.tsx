'use client';

import { useState } from 'react';
import type { ComplexItem } from '@/lib/api';
import { scoreColor } from '@/lib/score';
import { formatPriceKrw } from '@/lib/format';

interface ListPanelProps {
  complexes: ComplexItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function ListPanel({ complexes, selectedId, onSelect }: ListPanelProps) {
  const [query, setQuery] = useState('');

  const shown = complexes
    .filter((c) => c.excluded_by.length === 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const filtered = query.trim()
    ? shown.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : shown;

  return (
    <div className="absolute bottom-4 right-4 top-4 z-10 flex w-72 flex-col overflow-hidden rounded-2xl bg-white/95 shadow-lg ring-1 ring-black/5 backdrop-blur">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 pt-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">점수순</span>
        <span className="text-[11px] tabular-nums text-gray-400">
          {query.trim() ? `${filtered.length} / ${shown.length}개` : `${shown.length}개`}
        </span>
      </div>

      <div className="px-4 py-3">
        <div className="relative">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
            aria-hidden
          >
            <circle cx="6.8" cy="6.8" r="5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="단지명 검색"
            className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-7 text-sm font-medium text-gray-900 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="검색어 지우기"
              className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto border-t border-gray-100">
        {filtered.map((item, i) => (
          <li key={item.complex_id}>
            <button
              onClick={() => onSelect(item.complex_id)}
              className={`flex w-full items-center gap-2.5 border-b border-gray-50 px-4 py-2.5 text-left transition hover:bg-gray-50 ${
                selectedId === item.complex_id ? 'bg-blue-50 hover:bg-blue-50' : ''
              }`}
            >
              <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-gray-300">{i + 1}</span>
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                style={{ background: scoreColor(item.score) }}
              >
                {item.score !== null ? Math.round(item.score) : '–'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-gray-900">{item.name}</span>
                <span className="block text-[11px] tabular-nums text-gray-500">
                  {item.price_recent !== null ? `${formatPriceKrw(item.price_recent)}원` : '거래 없음'}
                </span>
              </span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-center text-xs text-gray-400">
            {query.trim() ? '검색 결과가 없어요' : '조건에 맞는 단지가 없어요'}
          </li>
        )}
      </ul>
    </div>
  );
}

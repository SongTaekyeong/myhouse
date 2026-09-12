'use client';

import { useEffect, useRef } from 'react';
import type { ComplexItem, Destination } from '@/lib/api';
import { scoreColor } from '@/lib/score';
import { formatPriceKrw, formatBuiltYm, formatMinutes } from '@/lib/format';
import { loadKakaoSdk } from '@/lib/kakao';

const SONGPA_CENTER = { lat: 37.5145, lng: 127.1059 }; // 송파구 중심 근사값

interface MapProps {
  complexes: ComplexItem[];
  destinations: Destination[];
  focus?: { id: string; nonce: number } | null;
}

function buildBadge(item: ComplexItem): HTMLDivElement {
  const badge = document.createElement('div');
  badge.textContent = item.score !== null ? String(Math.round(item.score)) : '–';
  badge.style.cssText = `
    display:flex;align-items:center;justify-content:center;
    width:34px;height:34px;border-radius:50%;
    background:${scoreColor(item.score)};
    color:white;font-weight:700;font-size:12px;
    border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);
    cursor:pointer;
  `;
  return badge;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

const COMPONENT_LABELS = { commute: '통근 점수', price: '가격 점수', households: '세대수 점수' } as const;

function buildInfoCard(item: ComplexItem, destinations: Destination[]): HTMLDivElement {
  const price = item.price_recent !== null ? `${formatPriceKrw(item.price_recent)}원` : '거래 없음';
  const color = scoreColor(item.score);

  const componentRows = (Object.keys(COMPONENT_LABELS) as (keyof typeof COMPONENT_LABELS)[])
    .map((k) => {
      const v = item.components[k];
      const pct = v === null ? 0 : Math.round(v * 100);
      return `
        <div class="flex items-center gap-2 py-0.5">
          <span class="w-16 shrink-0 text-[11px] text-gray-500">${COMPONENT_LABELS[k]}</span>
          <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
            <span class="block h-full rounded-full" style="width:${pct}%;background:${v === null ? '#d1d5db' : color}"></span>
          </span>
          <span class="w-7 shrink-0 text-right text-[11px] font-semibold tabular-nums text-gray-700">${v === null ? '—' : pct}</span>
        </div>
      `;
    })
    .join('');

  const commuteRows = destinations
    .map((d) => {
      const min = item.commutes[d.dest_id];
      return `
        <div class="flex items-center justify-between py-0.5 text-xs">
          <span class="text-gray-500">${escapeHtml(d.label)}</span>
          <span class="font-semibold tabular-nums text-gray-800">${formatMinutes(min)}</span>
        </div>
      `;
    })
    .join('');

  const card = document.createElement('div');
  card.style.cssText = `color-scheme:light;box-shadow:0 8px 24px rgba(0,0,0,0.18);`;
  card.className = 'relative w-64 rounded-2xl bg-white p-4 text-gray-900 ring-1 ring-black/5';
  card.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <div class="text-[15px] font-bold leading-snug text-gray-900">${escapeHtml(item.name)}</div>
      <button
        class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        aria-label="닫기"
      >✕</button>
    </div>

    <div class="mt-2 flex items-center gap-2">
      <span
        class="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
        style="background:${color}"
      >${item.score !== null ? Math.round(item.score) : '–'}</span>
      <div class="text-xs text-gray-500">
        종합 점수
        <div class="text-[11px] text-gray-400">가중치 슬라이더로 즉시 재계산돼요</div>
      </div>
    </div>

    <div class="my-3 space-y-1 border-y border-gray-100 py-3">${componentRows}</div>

    <div class="grid grid-cols-2 gap-y-1 text-xs">
      <span class="text-gray-500">세대수</span>
      <span class="text-right font-medium tabular-nums text-gray-800">${item.total_households.toLocaleString()}세대</span>
      <span class="text-gray-500">준공</span>
      <span class="text-right font-medium text-gray-800">${formatBuiltYm(item.built_ym)}</span>
      <span class="text-gray-500">중위가</span>
      <span class="text-right font-medium tabular-nums text-gray-800">${price}</span>
    </div>

    ${commuteRows ? `<div class="mt-3 space-y-0.5 border-t border-gray-100 pt-3">${commuteRows}</div>` : ''}
  `;
  return card;
}

export default function Map({ complexes, destinations, focus }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const markerOverlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  const infoOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const itemsByIdRef = useRef<Record<string, { item: ComplexItem; position: kakao.maps.LatLng }>>({});
  const destinationsRef = useRef<Destination[]>(destinations);
  useEffect(() => {
    destinationsRef.current = destinations;
  }, [destinations]);

  function openInfoCard(item: ComplexItem, position: kakao.maps.LatLng) {
    const map = mapRef.current;
    if (!map) return;

    infoOverlayRef.current?.setMap(null);

    const card = buildInfoCard(item, destinationsRef.current);
    const infoOverlay = new window.kakao.maps.CustomOverlay({
      position,
      content: card,
      map,
      yAnchor: 1.25,
      zIndex: 100,
    });

    card.querySelector('button')?.addEventListener('click', () => {
      infoOverlay.setMap(null);
    });

    infoOverlayRef.current = infoOverlay;
  }

  useEffect(() => {
    let cancelled = false;

    loadKakaoSdk().then(() => {
      if (cancelled || !containerRef.current) return;
      mapRef.current = new window.kakao.maps.Map(containerRef.current, {
        center: new window.kakao.maps.LatLng(SONGPA_CENTER.lat, SONGPA_CENTER.lng),
        level: 7,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    const map = mapRef.current;

    markerOverlaysRef.current.forEach((o) => o.setMap(null));
    markerOverlaysRef.current = [];
    infoOverlayRef.current?.setMap(null);
    infoOverlayRef.current = null;

    const shown = complexes.filter((c) => c.excluded_by.length === 0);
    itemsByIdRef.current = {};

    for (const item of shown) {
      const position = new window.kakao.maps.LatLng(item.lat, item.lng);
      itemsByIdRef.current[item.complex_id] = { item, position };
      const badge = buildBadge(item);

      badge.addEventListener('click', () => openInfoCard(item, position));

      const markerOverlay = new window.kakao.maps.CustomOverlay({
        position,
        content: badge,
        map,
        yAnchor: 0.5,
        zIndex: 1,
      });
      markerOverlaysRef.current.push(markerOverlay);
    }
  }, [complexes]);

  useEffect(() => {
    if (!focus || !mapRef.current) return;
    const entry = itemsByIdRef.current[focus.id];
    if (!entry) return;

    const map = mapRef.current;
    // 도심 전체 줌(레벨 7)에서는 마커가 붙어 있어 카드가 다른 단지 배지와 겹쳐 보인다.
    // 선택한 단지가 확실히 분리되도록 충분히 당겨서 본다 (이미 더 당겨져 있으면 유지).
    map.setLevel(Math.min(map.getLevel(), 4));
    map.panTo(entry.position);
    openInfoCard(entry.item, entry.position);
  }, [focus]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

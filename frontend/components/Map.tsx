'use client';

import { useEffect, useRef } from 'react';
import type { ComplexItem, Destination } from '@/lib/api';
import { scoreColor } from '@/lib/score';
import { formatPriceKrw, formatBuiltYm, formatMinutes } from '@/lib/format';

const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? '';
const SONGPA_CENTER = { lat: 37.5145, lng: 127.1059 }; // 송파구 중심 근사값

interface MapProps {
  complexes: ComplexItem[];
  destinations: Destination[];
}

function loadKakaoSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false`;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () => reject(new Error('카카오맵 SDK 로드 실패'));
    document.head.appendChild(script);
  });
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

function buildInfoCard(item: ComplexItem, destinations: Destination[]): HTMLDivElement {
  const price = item.price_recent !== null ? `${formatPriceKrw(item.price_recent)}원` : '거래 없음';

  const commuteLines = destinations
    .map((d) => `<div>${d.label}: ${formatMinutes(item.commutes[d.dest_id])}</div>`)
    .join('');

  const labels = { commute: '통근', price: '가격', households: '세대수' } as const;
  const componentLines = (Object.keys(labels) as (keyof typeof labels)[])
    .map((k) => {
      const v = item.components[k];
      return `<div>${labels[k]} 기여도: ${v === null ? '—' : Math.round(v * 100) + '점'}</div>`;
    })
    .join('');

  const card = document.createElement('div');
  card.style.cssText = `
    background:white;color:#111827;border-radius:8px;padding:10px 14px 12px;
    font-size:13px;line-height:1.55;min-width:200px;
    box-shadow:0 4px 16px rgba(0,0,0,0.2);position:relative;
    color-scheme:light;
  `;
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:start;gap:8px;">
      <div style="font-weight:700;font-size:14px;">${item.name}</div>
      <button style="border:none;background:none;cursor:pointer;font-size:14px;color:#888;line-height:1;" aria-label="닫기">✕</button>
    </div>
    <div style="font-weight:600;color:${scoreColor(item.score)};margin:2px 0 6px;">
      점수 ${item.score !== null ? Math.round(item.score) : '—'}
    </div>
    ${componentLines}
    <div style="margin-top:6px;">세대수: ${item.total_households.toLocaleString()}세대</div>
    <div>준공: ${formatBuiltYm(item.built_ym)}</div>
    <div>중위가: ${price}</div>
    <div style="margin-top:6px;">${commuteLines}</div>
  `;
  return card;
}

export default function Map({ complexes, destinations }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const markerOverlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  const infoOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);

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

    for (const item of shown) {
      const position = new window.kakao.maps.LatLng(item.lat, item.lng);
      const badge = buildBadge(item);

      badge.addEventListener('click', () => {
        infoOverlayRef.current?.setMap(null);

        const card = buildInfoCard(item, destinations);
        const infoOverlay = new window.kakao.maps.CustomOverlay({
          position,
          content: card,
          map,
          yAnchor: 1.25,
        });

        card.querySelector('button')?.addEventListener('click', () => {
          infoOverlay.setMap(null);
        });

        infoOverlayRef.current = infoOverlay;
      });

      const markerOverlay = new window.kakao.maps.CustomOverlay({
        position,
        content: badge,
        map,
        yAnchor: 0.5,
      });
      markerOverlaysRef.current.push(markerOverlay);
    }
  }, [complexes, destinations]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

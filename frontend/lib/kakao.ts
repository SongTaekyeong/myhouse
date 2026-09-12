'use client';

const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? '';

let loadPromise: Promise<void> | null = null;

/** 카카오맵 JS SDK를 한 번만 로드한다 (지도 화면·온보딩 화면이 공유). */
export function loadKakaoSdk(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&libraries=services&autoload=false`;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () => reject(new Error('카카오맵 SDK 로드 실패'));
    document.head.appendChild(script);
  });

  return loadPromise;
}

/** 주소 문자열 -> {lat, lng}. 매칭 실패 시 null. */
export function geocodeAddress(address: string): Promise<{ lat: number; lng: number; addressName: string } | null> {
  return loadKakaoSdk().then(
    () =>
      new Promise((resolve) => {
        const geocoder = new window.kakao.maps.services.Geocoder();
        geocoder.addressSearch(address, (result, status) => {
          if (status === window.kakao.maps.services.Status.OK && result.length > 0) {
            resolve({
              lat: parseFloat(result[0].y),
              lng: parseFloat(result[0].x),
              addressName: result[0].address_name,
            });
          } else {
            resolve(null);
          }
        });
      })
  );
}

/** {lat, lng} -> 사람이 읽을 주소 문자열. 실패 시 null. */
export function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  return loadKakaoSdk().then(
    () =>
      new Promise((resolve) => {
        const geocoder = new window.kakao.maps.services.Geocoder();
        geocoder.coord2Address(lng, lat, (result, status) => {
          if (status === window.kakao.maps.services.Status.OK && result.length > 0) {
            resolve(result[0].road_address?.address_name ?? result[0].address?.address_name ?? null);
          } else {
            resolve(null);
          }
        });
      })
  );
}

// 카카오맵 JS SDK 최소 타입 선언 (공식 타입 패키지 없이 직접 필요한 만큼만).

declare namespace kakao.maps {
  class LatLng {
    constructor(lat: number, lng: number);
  }

  class Map {
    constructor(container: HTMLElement, options: { center: LatLng; level: number });
    setCenter(latlng: LatLng): void;
    panTo(latlng: LatLng): void;
    setLevel(level: number): void;
    getLevel(): number;
  }

  class Marker {
    constructor(options: { position: LatLng; map?: Map; image?: MarkerImage });
    setMap(map: Map | null): void;
  }

  class MarkerImage {
    constructor(src: string, size: Size, options?: { offset?: Point });
  }

  class Size {
    constructor(width: number, height: number);
  }

  class Point {
    constructor(x: number, y: number);
  }

  class CustomOverlay {
    constructor(options: {
      position: LatLng;
      content: HTMLElement | string;
      map?: Map;
      yAnchor?: number;
      zIndex?: number;
    });
    setMap(map: Map | null): void;
  }

  class InfoWindow {
    constructor(options: { content: string; removable?: boolean });
    open(map: Map, marker: Marker): void;
    close(): void;
  }

  namespace event {
    function addListener(
      target: Marker | Map,
      type: string,
      handler: () => void
    ): void;
  }

  function load(callback: () => void): void;

  namespace services {
    interface AddressSearchResult {
      address_name: string;
      x: string; // 경도
      y: string; // 위도
    }

    type StatusType = 'OK' | 'ZERO_RESULT' | 'ERROR';

    const Status: { OK: 'OK'; ZERO_RESULT: 'ZERO_RESULT'; ERROR: 'ERROR' };

    interface Coord2AddressResult {
      address: { address_name: string } | null;
      road_address: { address_name: string } | null;
    }

    class Geocoder {
      addressSearch(
        address: string,
        callback: (result: AddressSearchResult[], status: StatusType) => void
      ): void;
      coord2Address(
        lng: number,
        lat: number,
        callback: (result: Coord2AddressResult[], status: StatusType) => void
      ): void;
    }
  }
}

interface Window {
  kakao: typeof kakao;
}

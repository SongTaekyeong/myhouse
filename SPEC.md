# SPEC.md — 내집 (MyHome)

> **현재 구현 스펙.** `ROADMAP.md`는 나중에 붙일 기능 목록이고 코드 근거가 아니다.

---

## 0. 목표

이 프로젝트는 목표가 두 개다. 둘 다 진짜 목표이고, 충돌할 때는 **학습 쪽이 우선**이다.

1. **결과물**: 우리 부부 조건에 맞는 아파트 단지를 지도에서 점수로 보는 개인용 웹앱
2. **학습**: dbt, Airflow, PostGIS, 그리고 실제 배포까지 한 사이클 완주

> 그래서 "200행에 Postgres는 과하다" 같은 판단은 여기서 적용하지 않는다. 과한 게 연습 대상이다.
> 대신 **앱 UI는 의도적으로 작게 유지**한다. 화면을 키우면 파이프라인에 쓸 시간이 사라진다.

## 1. 학습 목표 ↔ 컴포넌트

| 배우려는 것 | 이 프로젝트에서 만나는 지점 |
|---|---|
| dbt | staging → intermediate → mart 3레이어, incremental 모델, 스키마 테스트, 커스텀 테스트, seed, docs |
| Airflow | DAG 4개, 태스크 의존성, 재시도, 백필(과거 실거래 수집), 센서 없이 스케줄만으로 |
| PostGIS | 좌표 저장, GiST 인덱스, `ST_Distance` 통근 거리, 나중에 학구도 폴리곤 `ST_Contains` |
| 배포 | Docker Compose, 리버스 프록시(HTTPS), 환경 분리, GitHub Actions, 로컬→운영 DB 동기화 |
| 데이터 품질 | 외부 API의 결측·중복·이상치 처리, 엔티티 매칭, 계약 테스트 |

## 2. 범위

| 항목 | v1 범위 | 확장 방법 |
|---|---|---|
| 지역 | **송파구(11710) + 강동구(11740)** | `config/regions.yml`에 시군구 코드 추가 후 백필 |
| 거래 | 매매만 | 전월세 DAG 추가 |
| 기간 | 최근 24개월 | 백필 파라미터 |
| 통근 | **직선거리 추정** (외부 경로 API 안 씀) | `mart_commute` 계산 방식만 교체 |
| 단지 수 | 약 200개 | — |

**의도적으로 뺀 것**: 학구도/초품아 · 지하철 · 전세가율 · 저장/비교함 · 실거래 추이 차트 · 청약 정보 · 호가 크롤링

> 온보딩 화면은 2026-09-12 결정으로 범위에 포함됐다 (§7, §9 참고). 다회원·다프로필은 여전히 범위 밖 — 화이트리스트 계정 전체가 프로필 하나를 공유한다.

## 3. 아키텍처

```
[로컬 — 개발 & 파이프라인]                    [VM — 상시 가동]
┌──────────────────────────────┐             ┌────────────────────┐
│ Airflow (LocalExecutor)      │             │ Caddy (HTTPS)      │
│   └ ingest → dbt → sync      │             │ Frontend (Next.js) │
│ PostgreSQL + PostGIS         │  mart만     │ Backend (FastAPI)  │
│   raw / staging / int / mart │ ──push──▶   │ PostgreSQL+PostGIS │
│ dbt                          │             │   mart + app       │
└──────────────────────────────┘             └────────────────────┘
```

**왜 Airflow는 로컬인가**: 작은 VM에 Airflow까지 올리면 메모리가 버겁고, 배포 학습의 초점이 흐려진다. 파이프라인은 로컬에서 돌리고 결과만 밀어 올린다. VM 메모리가 4GB 이상이면 나중에 올려도 된다.

**동기화 방향**
- 로컬 → 운영: `mart_*` 테이블 (매일)
- 운영 → 로컬: `dim_destination` (사용자가 앱에서 등록한 직장 좌표)

## 4. 데이터 소스

| 데이터 | 출처 | 주기 | 용도 |
|---|---|---|---|
| 아파트 매매 실거래 | 공공데이터포털 — 국토교통부 아파트 매매 실거래가 | 일 | 시세 |
| 공동주택 단지 정보 | K-apt 계열 단지 정보 API | 월 | 세대수·동수·준공년월 |
| 도로명/지번 주소 | 도로명주소 개발자센터 | 월 | 조인키 |
| 좌표 | 카카오 주소검색 API | 필요 시 | 지오코딩 |
| 지도 표시 | 카카오맵 JS SDK | — | 프론트 |

> 엔드포인트·파라미터는 포털에서 최신 스펙 직접 확인. 실거래 API는 개편 이력이 있어 구버전 문서가 돌아다닌다.

## 5. 데이터 레이어 & dbt 모델

```
raw/                        ← Airflow 수집 태스크가 적재 (dbt 밖)
  raw_apt_trade             (시군구×계약월, API 응답 거의 원본 + _ingested_at)
  raw_complex_info
  raw_address

staging/                    ← dbt, view
  stg_apt_trade             타입 캐스팅, 컬럼명 정규화, 해제거래 제외, 중복 제거
  stg_complex_info
  stg_address

intermediate/               ← dbt, table
  int_complex_key           (법정동+지번) → complex_id 부여
  int_complex_geocoded      주소 조인 → 좌표, match_method/match_confidence
  int_trade_cleaned         전용면적 → area_group, 이상치(±40%) 플래그

mart/                       ← dbt, table / incremental
  mart_complex
  mart_price                incremental (unique_key: complex_id+area_group+ym)
  mart_price_latest         최근 12개월 거래건수 가중평균
  mart_commute              PostGIS ST_Distance 기반 추정
  dim_destination           ← 앱이 쓰는 테이블 (dbt source로만 참조)
```

**dbt 학습 포인트**
- `stg_*`는 view, `mart_*`는 table → materialization 차이 체감
- `mart_price`는 incremental로. 매일 최근 3개월만 재처리하는 패턴
- `int_complex_key`는 **seed**로 수동 보정 매핑 CSV를 두고 조인 (`seeds/complex_manual_fix.csv`)
- `dbt docs generate`로 리니지 그래프 확인
- 커스텀 테스트: 좌표 매칭률 95% 미만이면 실패

## 6. mart 스키마 (앱과의 계약)

### `mart_complex`
`complex_id` PK · `name` · `sigungu_cd` · `address_jibun` · `address_road` · `lat` · `lng` · `geom geometry(Point,4326)` · `built_ym` · `total_households` · `total_dongs` · `updated_at`

### `mart_price`
PK `(complex_id, area_group, ym)` · `trade_cnt` · `price_median` · `price_p25` · `price_p75` · `unit_price_per_pyeong`

`area_group`: `~20` / `20-25` / `25-30` / `30-40` / `40~` (전용면적 기준)

### `mart_price_latest`
PK `(complex_id, area_group)` · `price_recent` (최근 12개월 거래건수 가중평균) · `trade_cnt_12m` · `last_trade_ym`

### `mart_commute`
PK `(complex_id, dest_id)` · `distance_km` · `est_minutes`

```sql
-- 계산식 (dbt 모델 안에서)
distance_km = ST_Distance(c.geom::geography, d.geom::geography) / 1000
est_minutes = (distance_km / 25.0) * 60 + 10
```

> UI에는 반드시 **"예상 이동시간(직선거리 기준)"** 으로 표기. 나중에 경로 API로 교체할 때 이 모델만 바꾸면 된다.

### 앱 소유 테이블 (dbt가 건드리지 않음)
`profiles` · `dim_destination` · `users`

### `profiles`
싱글턴(항상 `id = 'default'` 한 행만 존재 — 화이트리스트 계정 전체가 이 프로필 하나를 공유, 다회원 아님)

`id` PK(고정값 `'default'`) · `budget_cap` · `min_households` · `area_group` · `weights jsonb` · `updated_at`

## 7. 스코어링

조건은 `profiles` 테이블(싱글턴) + `dim_destination`에서 읽는다. `config/profile.json`은 **`profiles`에 아직 행이 없을 때 온보딩 화면이 보여줄 기본값**으로만 쓴다(시드 성격, 실제 서빙엔 안 씀).

```jsonc
// config/profile.json — 온보딩 기본값 예시
{
  "destinations": [
    { "dest_id": "me",     "label": "본인 직장",   "lat": 37.4979, "lng": 127.0276, "max_minutes": 50 },
    { "dest_id": "spouse", "label": "배우자 직장", "lat": 37.5100, "lng": 127.1000, "max_minutes": 40 }
  ],
  "budget_cap": 1200000000,
  "min_households": 500,
  "area_group": "25-30",
  "weights": { "commute": 0.4, "price": 0.35, "households": 0.25 }
}
```

**하드 필터** (걸리면 지도에서 숨김, 카운트만 표시)
- `price_recent > budget_cap` → `budget`
- 목적지 중 하나라도 `est_minutes > max_minutes` → `commute`
- `total_households < min_households` → `households`
- 해당 `area_group` 최근 12개월 거래 0건 → `no_trade`

**스코어** (0~1 정규화 후 가중합 × 100)

| 항목 | 계산 |
|---|---|
| `commute` | 목적지별 `clamp((max_min − t)/(max_min − 15), 0, 1)` 의 **최솟값** |
| `price` | `r = price_recent / budget_cap`. `0.65 ≤ r ≤ 0.95` 면 1.0, 밖은 선형 감쇠 |
| `households` | `clamp(log10(h/300) / log10(3000/300), 0, 1)` |

응답에 가중치 적용 전 `components`를 함께 내려보낸다 → 프론트 슬라이더가 API 재호출 없이 재계산.
**백엔드 `scoring.py`와 프론트 `lib/score.ts`의 가중합 공식은 반드시 동일하게 유지.**

## 8. API

```
GET  /api/complexes            전체 목록 + 점수 + components + excluded_by
GET  /api/complexes/{id}       단지 상세 + mart_price 최근 24개월
GET  /api/profile              profiles 싱글턴 (없으면 config/profile.json 기본값 반환, has_profile: false)
POST /api/profile              온보딩/설정 저장 → profiles 싱글턴 upsert (budget_cap, min_households, area_group, weights)
POST /api/destinations         직장 등록 → dim_destination (다음 파이프라인 실행 때 반영)
GET  /api/health               인증 예외
```

단지 200개라 bbox 쿼리·페이지네이션 없이 전체를 한 번에 내려준다.
`mart_commute`에 해당 `dest_id` 행이 아직 없으면 `commute_status: "pending"`으로 응답.

## 9. 화면 (2개)

### `/onboarding` — 최초 설정 + 재설정
`GET /api/profile`이 `has_profile: false`를 반환하면(=`profiles`에 행이 없으면) 지도 화면 대신 이 화면으로 보낸다. 지도 화면 상단바의 "설정" 링크로 **언제든 다시 들어와 값을 고칠 수도 있다** — 이 경우 기존 값을 미리 채워서 보여준다.

- 입력: 목적지(주소 검색 → 카카오 Geocoder로 좌표 변환, 목적지별 허용 통근시간), 예산 상한, 최소 세대수, 관심 평형
- 저장 순서: 목적지는 `POST /api/destinations`, 나머지는 `POST /api/profile` → 완료되면 `/`로 이동
- 가중치(3개 슬라이더)만 지도 화면 좌측 하단에서 바로 조정 가능 — 나머지 항목은 이 화면에서

### `/` — 지도. 데스크톱 우선.

- 카카오맵, 초기 중심 송파구 (`dynamic import`, `ssr: false`)
- 마커 색상: 85+ 진초록 / 70+ 연초록 / 55+ 노랑 / 이하 회색, 점수 숫자 표시
- 마커 클릭 → 인포윈도우: 단지명, 점수, 항목별 점수(통근/가격/세대수) 3줄, 세대수, 준공년, 중위가, 목적지별 예상 이동시간
- 좌측 하단: 가중치 슬라이더 3개(항목별 설명 툴팁 포함) + 예산 입력 → 즉시 재채색
- 상단: "표시 43 · 제외 128", 평형 드롭다운

## 10. 인증

공개 인터넷에 뜨고 **직장 주소·예산이 들어가므로** 필수.

- NextAuth + Google OAuth, 허용 이메일 화이트리스트 2개 (`ALLOWED_EMAILS` 환경변수)
- 화이트리스트 밖은 로그인 성공해도 403
- `/api/health` 외 전 엔드포인트 세션 검사
- 개발 중에는 `AUTH_DISABLED=true`로 우회. **운영에서 이 값이 true면 부팅 실패시킬 것**

## 11. 배포

| 항목 | 선택 |
|---|---|
| 호스팅 🔺 | Oracle Cloud Free Tier 또는 Lightsail $5~10 |
| 구성 | `docker-compose.prod.yml` — caddy / frontend / backend / postgres |
| HTTPS | Caddy 자동 인증서 (도메인 필요) |
| CI/CD | GitHub Actions: main 푸시 → 이미지 빌드 → VM에서 pull & up |
| 환경 분리 | `.env.local` / `.env.prod`, 둘 다 `.gitignore` |
| 백업 | `pg_dump` 앱 테이블만 주 1회 (mart는 로컬에서 재생성 가능) |

**동기화 스크립트** (`scripts/sync_mart.sh`)
```bash
pg_dump -d naejip -t 'mart_*' --clean --if-exists --no-owner | psql "$PROD_DB_URL"
```
- **앱 테이블(`profiles`, `dim_destination`, `users`)은 절대 포함하지 말 것.** `--clean`이 사용자 데이터를 날린다
- 적재 후 행 수 검증, 로컬 대비 ±5% 벗어나면 롤백
- PostGIS GiST 인덱스는 적재 후 재생성

## 12. Airflow DAG

| DAG | 스케줄 | 태스크 |
|---|---|---|
| `ingest_apt_trade` | 매일 06:00 | 시군구 × 최근 3개월 루프 → `raw_apt_trade` upsert |
| `ingest_complex_info` | 매월 1일 | 단지 정보 갱신 → `raw_complex_info` |
| `dbt_build` | 매일 07:00 | `dbt run` → `dbt test` (실패 시 다음 태스크 중단) |
| `sync_to_prod` | 매일 07:30 | `pull_destinations` → `push_mart` → `verify` |

- LocalExecutor, 메타DB는 **앱 DB와 분리된 별도 Postgres 컨테이너**
- 백필 연습: `airflow dags backfill`로 과거 24개월 실거래 수집
- 실패 재시도 3회, 지수 백오프
- dbt 실행은 `BashOperator`로 시작 → 익숙해지면 태스크 분할 검토

## 13. 단계 계획

| Phase | 기간 | 내용 | 완료 조건 |
|---|---|---|---|
| **P1 인프라** | 1주 | docker-compose(postgres+postgis, airflow), 실거래 수집 스크립트 1개 | `raw_apt_trade`에 송파 3개월치 적재됨 |
| **P2 dbt** | 1~1.5주 | staging→int→mart 전 모델, 좌표 매칭, 테스트, docs | `dbt build` 통과, `mart_complex` 200행 |
| **P3 앱** | 1주 | FastAPI + Next.js 지도 + 스코어링 | 로컬에서 지도에 점수 마커가 뜸 |
| **P4 Airflow** | 3~4일 | DAG 4개, 백필로 24개월 채우기 | 하루 방치해도 데이터가 갱신됨 |
| **P5 배포** | 3~4일 | VM, Caddy, 인증, 동기화, Actions | 배우자가 휴대폰으로 접속 |

**P3를 P2 뒤에 둔 이유**: mart가 나오기 전에 앱을 만들면 결국 가짜 데이터로 두 번 작업하게 된다. 다만 P2가 길어지면 지치니, P2 중간에 `mart_complex`만 나온 시점에 지도에 마커 찍어보는 걸 권한다.

## 14. 역할 분담

| 영역 | 담당 |
|---|---|
| `pipeline/`, `dbt/`, `airflow/` | **송송** — Claude Code는 코드 작성 금지, 리뷰·설명·디버깅만 |
| `backend/`, `frontend/` | Claude Code |
| `docker-compose*.yml`, `Caddyfile`, `.github/` | Claude Code 초안 → 송송이 이해하고 수정 |
| `schema/`, `config/` | 공동, 변경 시 상호 확인 |

## 15. 리포 구조

```
naejip/
├── SPEC.md  CLAUDE.md  DE_GUIDE.md  ROADMAP.md
├── docker-compose.yml          # 로컬: postgres, postgis, airflow
├── docker-compose.prod.yml     # 운영: caddy, frontend, backend, postgres
├── Caddyfile
├── config/
│   ├── regions.yml
│   └── profile.json
├── pipeline/                   # ⛔ 송송 담당
│   ├── ingest/
│   └── scripts/sync_mart.sh
├── dbt/                        # ⛔ 송송 담당
│   ├── models/{staging,intermediate,mart}/
│   ├── seeds/complex_manual_fix.csv
│   └── tests/
├── airflow/dags/               # ⛔ 송송 담당
├── backend/
│   ├── main.py  db.py  scoring.py  auth.py
│   └── test_scoring.py
└── frontend/
    ├── app/page.tsx
    ├── components/{Map,InfoWindow,WeightPanel}.tsx
    └── lib/score.ts
```

## 16. 남은 결정 (🔺)

1. VM 제공자 (Oracle Free vs Lightsail) 및 도메인
2. 백필 기간 — 24개월 vs 36개월
3. Airflow를 나중에 VM으로 올릴지 여부

# 내집 (MyHome) — 실거래가 데이터 파이프라인 + 조건 기반 아파트 추천 지도

공공데이터 아파트 실거래가·단지정보를 매일 수집해 dbt로 정제하고, 통근거리·예산·세대수 조건으로 점수를 매겨 지도에서 비교하는 개인용 웹앱입니다.

앱을 완성하는 것보다 **수집 → 정제 → 서빙으로 이어지는 데이터 엔지니어링 사이클을 혼자 끝까지 돌려보는 것**이 1차 목표인 1인 프로젝트입니다.

- 대상 지역: 서울 25개 구 + 경기 5개 시·구 (총 30개 시군구, `config/regions.yml`)
- 규모: 단지 약 3,100개 (`mart_complex`)
- 스택: Airflow · dbt · PostgreSQL/PostGIS · FastAPI · Next.js(TypeScript) · Docker Compose · Caddy · GitHub Actions

## 아키텍처

```
공공데이터포털 API ─┐
(실거래가·단지정보)  │   Airflow (LocalExecutor)
카카오 주소검색 API ─┴─▶ ingest ──▶ raw_*  ──▶ dbt run ──▶ dbt test
                                    │
                    Postgres + PostGIS (raw → staging → intermediate → mart)
                                    │
                              FastAPI (스코어링) ──▶ Next.js + 카카오맵
```

로컬 파이프라인 스택은 `docker-compose.yml` 하나로 뜹니다. Airflow 메타 DB는 앱 DB와 별도 Postgres 컨테이너로 분리했습니다.

## 데이터 파이프라인

### 수집 (`pipeline/ingest/`)

| 스크립트 | 소스 | 적재 테이블 |
|---|---|---|
| `apt_trade.py` | 국토교통부 아파트 매매 실거래가 API | `raw_apt_trade` |
| `complex_info.py` | 공동주택 단지 목록·기본정보 API | `raw_complex_info` |
| `address.py` | 카카오 로컬 주소검색 API (도로명주소 → 좌표) | `raw_address` |

- raw 계층은 **append-only**입니다. API 응답을 문자열 그대로, 적재 시각(`_ingested_at`)과 함께 쌓습니다.
- 실거래 신고는 최대 30일까지 지연되므로 매일 최근 3개월을 다시 수집합니다. 이때 생기는 중복은 staging에서 제거합니다.
- 수집 대상 지역은 `config/regions.yml`에서만 관리합니다. 지역 추가는 YAML 수정 + 백필로 끝나고 코드 변경이 없습니다.

### 변환 (`dbt/models/`)

| 계층 | materialization | 모델 | 역할 |
|---|---|---|---|
| staging | view | `stg_apt_trade`, `stg_complex_info`, `stg_address` | 타입 캐스팅, 금액 원 단위 변환, 중복 제거(`row_number`), 해제 거래 제외 |
| intermediate | table | `int_complex_key` | 실거래 ↔ 단지정보 엔티티 매칭 |
| | | `int_complex_geocoded` | 단지 좌표 결합, 매칭 신뢰도(`match_confidence`) 부여 |
| | | `int_trade_cleaned` | 평형 그룹핑, 중위가 대비 ±40% 이상치 플래그 |
| mart | table | `mart_complex` | 단지 마스터 (세대수, 준공연월, PostGIS `geom`) |
| | incremental | `mart_price` | 단지 × 평형 × 월 중위가·사분위·평당가 |
| | table | `mart_price_latest` | 최근 12개월 거래량 가중 평균가 |
| | table | `mart_commute` | 단지 → 목적지 직선거리 기반 예상 이동시간 |

### 설계하면서 부딪힌 문제

**1. 공통 ID가 없는 두 소스의 매칭**
실거래 API는 단지 코드를 주지 않고 `시군구코드 + 법정동명 + 지번`만 줍니다. 단지정보의 지번주소를 파싱해 같은 키로 조인하고, 단지정보의 `kapt_code`를 `complex_id`로 사용합니다. 단지명 문자열 매칭은 표기 변형이 심해 쓰지 않았습니다.

**2. 지역 확장 시 드러난 동명 충돌**
8개 지역까지는 `법정동명 + 지번`만으로 유일했지만, 서울 25개 구로 넓히자 도봉동(강북구/도봉구)과 봉천동(관악구/동작구)처럼 같은 동 이름이 여러 구에 걸쳐 나타나 `complex_id`당 행이 중복됐습니다. 단지정보의 법정동코드 앞 5자리에서 시군구코드를 뽑아 조인 키에 추가해 해결했습니다. ([a00accd](https://github.com/SongTaekyeong/myhouse/commit/a00accd))

**3. 매일 재수집하는 구조에서의 재계산 비용**
`mart_price`는 `(complex_id, area_group, ym)`을 unique key로 하는 incremental 모델이고, 증분 실행 시 최근 3개월 거래만 다시 집계합니다. 신고 지연분은 반영하면서 전체 기간 재계산은 피합니다.

**4. 통근시간 추정**
외부 경로 API 대신 PostGIS `ST_Distance`(geography 캐스팅)로 직선거리를 구하고 `거리 / 25km/h + 10분`으로 추정합니다. 추정치라는 점은 UI에 명시합니다. 경로 API로 바꿀 때는 `mart_commute` 모델 하나만 교체하면 됩니다.

### 오케스트레이션 (`airflow/dags/`)

| DAG | 스케줄 | 내용 |
|---|---|---|
| `ingest_apt_trade` | 매일 06:00 | 30개 시군구 × 최근 3개월 실거래 수집 |
| `ingest_complex_info` | 매월 1일 06:00 | 단지 목록·기본정보 갱신 |
| `dbt_build` | 매일 07:00 | `dbt run` → `dbt test` (run 실패 시 test 미실행) |

Airflow 이미지는 공식 `apache/airflow:2.9.3`에 `dbt-postgres`만 얹어 빌드합니다(`airflow/Dockerfile`). 신규 지역의 과거 데이터는 `python pipeline/ingest/apt_trade.py`로 60개월치를 백필합니다.

## 앱

- **스코어링 (`backend/scoring.py`)**: DB 접근이 없는 순수 함수로 분리해 단위 테스트(`test_scoring.py`)가 가능합니다. 예산·세대수·통근 하드필터로 먼저 거른 뒤, 세 항목을 0~1로 정규화해 가중합합니다.
- **가중치 슬라이더**: 서버가 항목별 원점수(`components`)를 함께 내려주고, 프론트(`frontend/lib/score.ts`)가 같은 공식으로 즉시 재계산합니다. 슬라이더 조작에 API 재호출이 없습니다.
- **인증**: NextAuth + Google OAuth + 이메일 화이트리스트. 운영 환경에서 `AUTH_DISABLED=true`면 백엔드가 부팅에 실패하도록 막았습니다. 직장 좌표·예산은 POST body로만 전달합니다.

## 배포 (진행 중)

- `docker-compose.prod.yml`: Caddy · Next.js · FastAPI · Postgres(PostGIS) 구성. 운영 VM에는 Airflow와 dbt를 올리지 않고 서비스 컨테이너만 띄웁니다. DB 포트는 `127.0.0.1`에만 바인딩합니다.
- `Caddyfile`: Let's Encrypt 인증서 자동 발급·갱신, HSTS 등 보안 헤더.
- `.github/workflows/deploy.yml`: 이미지 빌드 → GHCR push → VM에서 pull & up (현재는 VM·Secrets가 준비되지 않아 수동 실행(`workflow_dispatch`)으로 막아둠).
- 파이프라인은 로컬에서 돌리고 `mart_*` 테이블만 운영 DB로 보내는 구조로 설계했습니다. 수집용 API 키가 운영 서버에 올라가지 않습니다. 동기화 스크립트는 아직 없습니다.

## 실행

```bash
cp .env.local.example .env.local     # API 키와 비밀번호 채우기
docker compose --env-file .env.local up -d
```

- Airflow UI: http://localhost:8081
- Postgres: `localhost:5433`
- 필요한 키: 공공데이터포털 서비스 키, 카카오 REST API 키

직장 좌표와 예산이 들어가는 `config/profile.json`은 커밋되지 않습니다. `config/profile.json.example`을 복사해 만듭니다.

## 진행 상태

| 영역 | 상태 |
|---|---|
| 로컬 인프라 (Postgres+PostGIS, Airflow) | 완료 |
| 수집 스크립트 3종, 30개 시군구 백필 | 완료 |
| dbt staging → intermediate → mart | 완료 |
| Airflow DAG 3개 | 완료 |
| FastAPI + Next.js 지도, 스코어링, 온보딩, 리스트 패널 | 완료 |
| 좌표 매칭률 커스텀 테스트, 수동 보정 seed | 예정 |
| 배포 설정 (운영 compose, Caddyfile, GitHub Actions 워크플로) | 초안 작성 |
| 로컬 → 운영 `mart_*` 동기화 스크립트·DAG | 예정 |

## 알려진 한계

- raw 적재는 upsert가 아닌 append이고 중복 제거를 staging에 맡깁니다. raw 테이블이 계속 커지므로 파티셔닝 또는 적재 단계 upsert로 바꿀 계획입니다.
- 수집 스크립트에 API 재시도·rate limit 처리가 없습니다.
- dbt 테스트는 현재 `stg_apt_trade`의 unique/not_null만 있습니다.
- 통근시간은 직선거리 추정이라 한강·산 같은 지형을 반영하지 못합니다.

## 문서

- `SPEC.md` — 앱 구현 스펙
- `DE_GUIDE.md` — 파이프라인 설계 메모와 체크리스트 (초기 계획 문서, 실제 구현과 일부 다름)
- `ROADMAP.md` — 나중에 붙일 기능 목록

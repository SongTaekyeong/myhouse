# DE_GUIDE.md — 데이터 파이프라인 가이드

> 구현은 송송이 직접. 이 문서는 **설계 가이드와 체크리스트**만 제공한다.
> 최종 산출물은 `PRD_내집.md` §8의 `mart_*` 스키마다. 그 스키마만 맞으면 내부 구현은 자유.

## 0. 확정 전제

- **대상 지역**: 송파구(11710) + 강동구(11740)로 시작. `config/regions.yml`에서 관리하고, 확장은 코드 수정 없이 YAML + 백필로
- **DB**: 로컬 PostgreSQL + PostGIS에 raw~mart 전 레이어. 운영 VM에는 `mart_*`만 동기화
- **통근시간**: 외부 경로 API를 쓰지 않는다. PostGIS `ST_Distance` 직선거리 추정 (dbt 모델)
- **파이프라인은 로컬에서만 돈다.** VM에서는 수집·dbt를 돌리지 않는다
- **이 영역은 학습이 목적이다.** Claude에게 코드를 대신 짜게 하지 말고, 막혔을 때 설명·리뷰만 받는다

```yaml
# config/regions.yml
sigungu:
  - { code: "11710", name: 송파구 }
  - { code: "11740", name: 강동구 }
```

---

## 1. 데이터 소스

| 데이터 | 출처 | 갱신 주기 | 비고 |
|---|---|---|---|
| 아파트 매매 실거래 | 공공데이터포털 — 국토교통부 아파트 매매 실거래가 자료 | 일 1회 | 법정동코드 × 계약월 루프 |
| 아파트 전월세 실거래 | 공공데이터포털 — 국토교통부 아파트 전월세 자료 | 일 1회 | 전세가율 계산용 |
| 단지 기본정보 (세대수/동수/준공) | 공동주택 단지 정보 API 또는 K-apt(공동주택관리정보시스템) | 월 1회 | 실거래 API에는 세대수가 없다. 별도 소스 필요 |
| 법정동 코드 | 행정표준코드관리시스템 | 분기 | 마스터 |
| 도로명주소 / 건물관리번호 | 도로명주소 개발자센터 | 월 1회 | 좌표 매칭의 핵심 |
| 학교 기본정보 | 나이스 교육정보 개방포털 | 분기 | 학교명·좌표·학생수 |
| 초등학교 학구도 | 학구도안내서비스 | 연 1회 | 초품아 판정용 폴리곤 |
| 지하철역 좌표 | 국가교통DB / 서울열린데이터광장 | 연 1회 | |
| 통근 경로 | ODsay LAB(대중교통) / 카카오모빌리티(자동차) | 온디맨드 | 쿼터 주의 |

**작업 전 확인**: 각 API의 엔드포인트·파라미터·인증 방식은 포털에서 최신 스펙을 직접 확인할 것. 실거래 API는 개편 이력이 있어 구버전 문서가 돌아다닌다.

## 2. 레이어 구조

```
raw/          ← API 응답 원본 (파싱 최소, 적재 시각 기록)
  ├── raw_apt_trade          (법정동×계약월×건)
  ├── raw_apt_rent
  ├── raw_complex_info
  ├── raw_school
  └── raw_address            (도로명주소 마스터)

staging/      ← 타입 캐스팅, 컬럼명 정규화, 중복 제거
  ├── stg_apt_trade
  ├── stg_apt_rent
  └── stg_complex

intermediate/ ← 매칭·집계 로직
  ├── int_complex_geocoded   (좌표 매칭 결과 + 매칭 신뢰도)
  ├── int_complex_school     (학구도 공간조인)
  ├── int_complex_subway     (최근접 역)
  └── int_grid_assignment    (단지 → 격자)

mart/         ← 앱이 읽는 최종 계약
  ├── mart_complex
  ├── mart_price
  ├── mart_commute
  ├── dim_grid
  └── dim_school
```

dbt 사용 시: `raw`는 dbt 밖(수집 스크립트), `staging` 이후를 dbt 모델로. `staging`은 view, `intermediate`/`mart`는 table 또는 incremental.

## 3. 좌표 매칭 (가장 어려운 부분)

실거래 API는 **법정동 + 단지명 + 지번**만 준다. 좌표가 없다. 단지명은 표기 요동이 심하다.

### 권장 파이프라인

```
1차: 지번주소(법정동코드 + 본번 + 부번) → 도로명주소 마스터 조인 → 건물관리번호(bdMgtSn) 확보
2차: bdMgtSn → 좌표 (도로명주소 API의 좌표제공 서비스)
3차: 1~2차 실패 건만 → 카카오/네이버 지오코딩 API로 보정
4차: 그래도 실패 → 수동 매핑 테이블(seed CSV)에 등록
```

> 지번 기반 조인을 1차로 두는 이유: 단지명 문자열 매칭은 `래미안○○` / `래미안 ○○ 1차` / `○○래미안` 같은 변형에 취약하다. 지번은 안정적이다.

### 단지 식별자(`complex_id`) 설계

- 단지 하나가 여러 동을 가지므로 건물 단위 키를 그대로 쓰면 안 된다.
- 권장: **`법정동코드 + 지번본번(+부번)`** 조합 해시. 또는 단지 대표 건물의 관리번호에서 단지 레벨 키를 추출.
- 실거래 데이터의 `(법정동코드, 단지명, 지번)` 조합을 distinct 뽑아 단지 후보 리스트를 만들고, 여기에 ID를 부여한 뒤 **수동 검수**하는 게 현실적이다. 서울 25개구 아파트 단지는 4천~5천 개 수준이라 검수 가능한 규모다.
- 한 번 부여한 `complex_id`는 **절대 바꾸지 않는다.** 앱의 저장 단지·비교함이 이 키를 참조한다.

### 검증

- 매칭률 목표 95% 이상, 매칭 실패 건은 별도 테이블에 남겨 추적
- `int_complex_geocoded`에 `match_method`(jibun / geocode / manual)와 `match_confidence` 컬럼을 남길 것
- 좌표가 해당 법정동 경계 밖이면 이상치로 플래그

## 4. 통근시간 — 직선거리 추정 (dbt 모델)

외부 경로 API를 쓰지 않는다. 송파·강동은 가로세로 8km 안쪽이라 단지 간 통근시간 차이가 크지 않고, API 키 발급·쿼터·재시도 처리 비용 대비 얻는 변별력이 적다.

```sql
-- models/mart/mart_commute.sql (개념)
select
  c.complex_id,
  d.dest_id,
  st_distance(c.geom::geography, d.geom::geography) / 1000        as distance_km,
  (st_distance(c.geom::geography, d.geom::geography) / 1000 / 25.0) * 60 + 10
                                                                  as est_minutes
from {{ ref('mart_complex') }} c
cross join {{ source('app', 'dim_destination') }} d
```

- 25km/h + 10분은 도심 평균 이동속도와 도보·대기시간을 뭉뚱그린 값. 상수는 모델 상단에 변수로 빼둘 것
- **PostGIS 학습 포인트**: `geography` 캐스팅을 해야 미터 단위가 나온다. `geometry`끼리 `ST_Distance`는 도(degree) 단위라 무의미한 값이 나오니 주의
- `dim_destination`은 앱이 쓰는 테이블이므로 dbt에서 `source`로만 참조하고 절대 만들지 않는다
- 나중에 경로 API로 바꾸려면 이 모델 하나만 교체하면 된다. 그때 단지가 1,000개를 넘어가면 그제서야 격자 묶기를 고려

## 5. 시세 집계 (`mart_price`)

```sql
-- 개념 (실제 구현은 dbt 모델로)
complex_id, area_group, ym 별로
  count(*)                             as trade_cnt,
  percentile_cont(0.5) ... deal_amount as price_median,
  percentile_cont(0.25) / (0.75)       as p25 / p75
```

주의점:

- **해제 거래 제외**: 실거래 API는 계약해제 여부 필드를 제공한다. 반드시 필터링.
- **이상치**: 직거래·특수관계 거래로 시세와 동떨어진 건이 섞인다. 동일 단지·평형 최근 12개월 중위가 대비 ±40% 밖은 제외 검토.
- **평형 그룹핑**: 전용면적 기준. `84.98`, `84.92` 같은 미세 차이가 많으므로 그룹으로 묶어야 한다.
- **거래 희소**: 월 1건짜리 중위가는 신뢰도가 낮다. `trade_cnt`를 그대로 노출해서 앱이 판단하게 할 것.
- **전세가율**: 같은 단지·평형·분기 기준으로 매매 중위 / 전세 중위. 분기 단위로 완화해야 데이터가 잡힌다.

## 6. 학군 판정 (`is_chopoma`)

```
1. 학구도 폴리곤 적재 (PostGIS geometry)
2. 단지 좌표 → ST_Contains 로 배정 학구 판정
3. 해당 학구의 초등학교 좌표 → 단지와의 거리 계산
4. is_chopoma = (학구 일치) AND (거리 <= 500m)
```

- 학구도 데이터가 없는 지역은 "최근접 초등학교 거리"로 폴백하고 `is_chopoma = NULL`.
- 직선거리와 실제 도보거리는 다르다(도로·건널목). MVP는 직선거리로 가되, 상세 화면에서만 도보 경로 API 호출을 검토.

## 7. 오케스트레이션

| 잡 | 주기 | 내용 |
|---|---|---|
| `ingest_trade` | 매일 06:00 | 최근 3개월치 재수집 (신고 지연 반영) |
| `ingest_rent` | 매일 06:20 | 동일 |
| `dbt run` | 매일 07:00 | staging → mart |
| `dbt test` | 매일 07:30 | 계약 검증 |
| `refresh_complex_info` | 매월 1일 | 단지 정보 갱신 |
| `calc_commute` | 온디맨드 + 분기 | 신규 목적지 또는 90일 경과 |
| `pull_destinations` | 매일 07:40 | 클라우드 `dim_destination` → 로컬 (역방향) |
| `push_mart` | 매일 07:50 | 로컬 `mart_*` → 클라우드 (§7.1) |

개인 프로젝트 규모면 cron + Python 스크립트로 충분하다. Airflow는 잡이 10개를 넘거나 의존성이 복잡해질 때 도입.

### 7.1 로컬 → 클라우드 mart 동기화

노트북이 꺼져 있어도 앱은 살아 있어야 한다. 그래서 서빙용 DB는 클라우드에 따로 둔다.

```bash
# 개념 스크립트
pg_dump -h localhost -d naejip \
  -t 'mart_complex' -t 'mart_price' -t 'mart_commute' \
  -t 'dim_grid' -t 'dim_school' \
  --clean --if-exists --no-owner \
  | psql "$CLOUD_DB_URL"
```

주의점:

- **앱 소유 테이블(`profiles`, `saved_complexes`, `dim_destination`)은 절대 덮어쓰지 말 것.** `-t` 로 mart 계열만 명시적으로 지정한다. `--clean`이 앱 데이터를 날리면 저장 단지가 사라진다
- 트랜잭션 안에서 교체하거나, `mart_complex_new` 로 적재 후 `ALTER TABLE ... RENAME` 스왑 방식을 쓰면 무중단
- 실패 시 앱은 **이전 데이터로 계속 동작**해야 한다. 동기화 실패가 서비스 다운으로 이어지면 안 됨
- 동기화 후 클라우드에서 행 수 검증 → 로컬 대비 ±5% 벗어나면 롤백 + 알림
- PostGIS 인덱스(`geom` GiST)는 적재 후 재생성 필요. 덤프에 포함시키거나 후처리 스크립트로

## 8. 필수 dbt 테스트 (계약 보증)

```yaml
mart_complex:
  - complex_id: unique, not_null
  - lat/lng: not_null, 범위 (33~39, 124~132)
  - total_households: not_null, > 0
  - grid_id: relationships → dim_grid

mart_price:
  - (complex_id, area_group, ym): unique 조합
  - price_median: > 0
  - complex_id: relationships → mart_complex

mart_commute:
  - (grid_id, dest_id, mode): unique 조합
  - minutes: 0 < x < 300
```

추가로 **커스텀 테스트**: 좌표 매칭률 95% 미만이면 실패, `mart_complex` 행 수가 전일 대비 ±10% 벗어나면 경고.

## 9. 학습 순서 제안

막히는 지점을 미리 알고 가면 덜 지친다.

| 순서 | 작업 | 예상 난관 |
|---|---|---|
| 1 | Docker로 postgres+postgis 띄우기, `CREATE EXTENSION postgis` | 이미지 선택(`postgis/postgis`), 볼륨 영속화 |
| 2 | 실거래 API 수집 스크립트 1개 (송파, 최근 3개월) | XML 응답 파싱, 페이징, 컬럼명 공백/한글 |
| 3 | `raw_apt_trade` 적재 + 재실행 시 중복 방지 | upsert 키 설계 |
| 4 | dbt 프로젝트 초기화, `stg_apt_trade` 하나만 | `profiles.yml` 연결, `dbt debug` |
| 5 | 단지 정보 수집 → `int_complex_key` 로 complex_id 부여 | 지번 조인, 단지명 변형 |
| 6 | 좌표 지오코딩 → `geom` 컬럼 + GiST 인덱스 | SRID 4326 지정, geography 캐스팅 |
| 7 | `mart_*` 전 모델 + 스키마 테스트 | incremental 설정, unique 키 |
| 8 | Airflow 띄우고 위 단계를 DAG로 옮기기 | 메타DB 분리, `dbt` 실행 경로, 타임존 |
| 9 | 백필로 24개월 채우기 | API 쿼터, 재시도 |

**병행 팁**: 4번까지 끝나면 `mart_complex`만 임시로 만들어서 앱 개발을 먼저 시작해도 된다. 시세가 없어도 지도에 마커는 찍힌다.

## 10. 체크리스트

**환경**
- [ ] 공공데이터포털 API 키 (실거래)
- [ ] 단지 정보 API 키
- [ ] 카카오 개발자 앱 등록 (지도 JS 키 + REST 키)
- [ ] Docker: postgres+postgis 기동, PostGIS 확장 설치
- [ ] `config/regions.yml` 작성

**수집 (P1)**
- [ ] 실거래 수집 스크립트, 재실행 안전(upsert)
- [ ] 단지 정보 수집
- [ ] `raw_*` 적재 확인

**dbt (P2)**
- [ ] dbt 프로젝트 초기화, `dbt debug` 통과
- [ ] staging 모델 (view)
- [ ] `complex_id` 부여 규칙 확정 및 문서화 — **한 번 정하면 절대 바꾸지 않는다**
- [ ] 좌표 매칭, 매칭률 측정 (목표 95%)
- [ ] `mart_*` 전 모델, `mart_price`는 incremental
- [ ] 스키마 테스트 + 커스텀 테스트(매칭률)
- [ ] `dbt docs generate` 로 리니지 확인

**Airflow (P4)**
- [ ] Airflow 기동 (LocalExecutor, 메타DB 분리)
- [ ] DAG 4개
- [ ] 백필 24개월
- [ ] 실패 알림 (Slack 웹훅이면 회사에서 쓰던 방식 재활용 가능)

**배포 (P5)**
- [ ] VM + 도메인 + Caddy HTTPS
- [ ] 운영 DB 프로비저닝 + PostGIS 확장
- [ ] `sync_mart.sh` — **앱 테이블 제외 확인 필수**
- [ ] `pull_destinations` 역방향
- [ ] GitHub Actions 배포 파이프라인

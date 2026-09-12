"""수집 대상 시군구 목록. config/regions.yml을 읽는다.

apt_trade.py, complex_info.py, 각 Airflow DAG가 공유하는 유일한 소스.
새 지역 추가는 config/regions.yml만 고치면 된다 (코드 변경 불필요).
"""

import yaml


def load_region_codes() -> list[str]:
    with open("config/regions.yml", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return [r["code"] for r in data["regions"]]

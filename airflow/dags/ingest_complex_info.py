from airflow.decorators import dag, task
from datetime import datetime, date


@dag(
    schedule="0 6 1 * *",   # 매일 06:00 (cron 문법)
    start_date=datetime(2025, 1, 1),
    catchup=False,
)
def ingest_complex_info():

    @task
    def run_ingest():
        import sys
        import os

        sys.path.insert(0, "/opt/airflow/pipeline/ingest")
        sys.path.insert(0, "/opt/airflow/pipeline")
        os.chdir("/opt/airflow")  # apt_trade.py의 load_dotenv(".env.local")가 찾을 수 있게

        from complex_info import (
            fetch_sigungu_apt_list,
            extract_kapt_codes,
            fetch_complex_detail,
            parse_complex_detail,
            get_connection,
            create_table,
            save_records,
        )
        from regions import load_region_codes

        conn = get_connection()
        create_table(conn)

        for sgg_cd in load_region_codes():
            list_json = fetch_sigungu_apt_list(sgg_cd)
            kapt_codes = extract_kapt_codes(list_json)

            records = []

            for kapt_code in kapt_codes:
                detail_json = fetch_complex_detail(kapt_code)
                record = parse_complex_detail(detail_json)
                records.append(record)

            save_records(conn, records)

    run_ingest()


ingest_complex_info()

from airflow.decorators import dag, task
from datetime import datetime, date


@dag(
    schedule="0 6 * * *",   # 매일 06:00 (cron 문법)
    start_date=datetime(2025, 1, 1),
    catchup=False,
)
def ingest_apt_trade():

    @task
    def run_ingest():
        import sys
        import os

        sys.path.insert(0, "/opt/airflow/pipeline/ingest")
        os.chdir("/opt/airflow")  # apt_trade.py의 load_dotenv(".env.local")가 찾을 수 있게

        from apt_trade import (
            fetch_apt_trade,
            parse_apt_trade,
            get_connection,
            create_table,
            save_records,
        )

        conn = get_connection()
        create_table(conn)

        today = date.today()

        for sgg_cd in ["11710", "11740"]:
            year, month = today.year, today.month
            for _ in range(3):
                deal_ymd = f"{year}{month:02d}"
                xml_text = fetch_apt_trade(sgg_cd, deal_ymd)
                records = parse_apt_trade(xml_text)
                save_records(conn, records)

                month -= 1
                if month == 0:
                    month = 12
                    year -= 1

    run_ingest()


ingest_apt_trade()

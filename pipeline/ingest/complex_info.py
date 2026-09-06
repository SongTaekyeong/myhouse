import requests
import datetime

def fetch_sigungu_apt_list(sigungu_code):
    params = {
        "sigunguCode": sigungu_code, 
        "pageNo": 1,
        "serviceKey": os.getenv("DATA_GO_KR_SERVICE_KEY"),
        "numOfRows": 200,
    }
    response = requests.get("https://apis.data.go.kr/1613000/AptListService4/getSigunguAptList4", params=params)
    return response.json()


def fetch_complex_detail(kapt_code):
    params = {
            "kaptCode": kapt_code,
            "serviceKey": os.getenv("DATA_GO_KR_SERVICE_KEY"),
        }
    response = requests.get("https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5", params=params)
    return response.json()

def parse_complex_detail(detail_json):
    item = detail_json["response"]["body"]["item"]
    record = {
        "kapt_code": item["kaptCode"],
        "kapt_name": item["kaptName"],
        "bjd_code": item["bjdCode"],
        "kapt_addr": item["kaptAddr"],
        "doro_juso": item["doroJuso"],
        "kapt_da_cnt": item["kaptdaCnt"],
        "kapt_dong_cnt": item["kaptDongCnt"],
        "kapt_usedate": item["kaptUsedate"],
        "kapt_top_floor": item["kaptTopFloor"],
        "zipcode": item["zipcode"],
    }
    return record

def extract_kapt_codes(list_json):
    items = list_json["response"]["body"]["items"]
    codes = []
    for item in items:
        codes.append(item["kaptCode"])
    return codes




from dotenv import load_dotenv ## db연결용 환경변수 가져오기
import os

load_dotenv(".env.local")
print(os.getenv("POSTGRES_PASSWORD"))

import psycopg2 ## db연결!!!

def get_connection():
    conn = psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=os.getenv("POSTGRES_PORT"),
        dbname=os.getenv("POSTGRES_DB"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
    )
    return conn


def create_table(conn):
    cur = conn.cursor()
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS raw_complex_info (
        raw_id            SERIAL PRIMARY KEY,
        kapt_code         TEXT,
        kapt_name         TEXT,
        bjd_code          TEXT,
        kapt_addr         TEXT,
        doro_juso         TEXT,
        kapt_da_cnt       TEXT,
        kapt_dong_cnt     TEXT,
        kapt_usedate      TEXT,
        kapt_top_floor    TEXT,
        zipcode           TEXT,
        _ingested_at      TIMESTAMPTZ
    );
    """

    cur.execute(create_table_sql)
    conn.commit()
    print("테이블 생성 완료")

def save_records(conn, records):
    cur = conn.cursor()
    insert_sql = """
    INSERT INTO raw_complex_info (
        kapt_code, kapt_name, bjd_code, kapt_addr, doro_juso,
        kapt_da_cnt, kapt_dong_cnt, kapt_usedate, kapt_top_floor, zipcode, _ingested_at
    ) VALUES (
        %s, %s, %s, %s, %s,
        %s, %s, %s, %s, %s, %s
    );
    """

    for record in records:
        values = (
            record["kapt_code"], record["kapt_name"], record["bjd_code"],
            record["kapt_addr"], record["doro_juso"], record["kapt_da_cnt"],
            record["kapt_dong_cnt"], record["kapt_usedate"], record["kapt_top_floor"],
            record["zipcode"], datetime.datetime.now(datetime.timezone.utc),
        )
        cur.execute(insert_sql, values)

    conn.commit()
    print(f"{len(records)}건 적재 완료")


if __name__ == "__main__":
    conn = get_connection()
    create_table(conn)

    for sigungu_code in ["11710", "11740"]:
        list_json = fetch_sigungu_apt_list(sigungu_code)
        kapt_codes = extract_kapt_codes(list_json)

        records = []
        for kapt_code in kapt_codes:
            detail_json = fetch_complex_detail(kapt_code)
            record = parse_complex_detail(detail_json)
            records.append(record)

        save_records(conn, records)

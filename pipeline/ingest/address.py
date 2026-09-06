import requests
import os
from dotenv import load_dotenv

load_dotenv(".env.local")


def fetch_address(query_address):
    response = requests.get(
        "https://dapi.kakao.com/v2/local/search/address.json",
        params={"query": query_address},
        headers={"Authorization": f"KakaoAK {os.getenv('KAKAO_REST_API_KEY')}"},
    )
    return response.json()


def parse_address(kapt_code, query_address, response_json):
    documents = response_json.get("documents", [])


    if len(documents) == 0:
        return {
            "kapt_code": kapt_code,
            "query_address": query_address,
            "address_name": None,
            "building_name": None,
            "lng": None,
            "lat": None,
            "address_type": None,
        }

    doc = documents[0]
    record = {
        "kapt_code": kapt_code,
        "query_address": query_address,
        "address_name": doc["address_name"],
        "building_name": doc.get("road_address", {}).get("building_name"),
        "lng": doc["x"],
        "lat": doc["y"],
        "address_type": doc["address_type"],
    }
    return record


import psycopg2

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
    CREATE TABLE IF NOT EXISTS raw_address (
        raw_id            SERIAL PRIMARY KEY,
        kapt_code         TEXT,
        query_address     TEXT,
        address_name      TEXT,
        building_name     TEXT,
        lng               TEXT,
        lat               TEXT,
        address_type      TEXT,
        _ingested_at      TIMESTAMPTZ
    );
    """
    cur.execute(create_table_sql)
    conn.commit()
    print("테이블 생성 완료")


def get_complex_addresses(conn):
    cur = conn.cursor()
    cur.execute("SELECT kapt_code, doro_juso FROM raw_complex_info;")
    rows = cur.fetchall()
    return rows


import datetime

def save_records(conn, records):
    cur = conn.cursor()
    insert_sql = """
    INSERT INTO raw_address (
        kapt_code, query_address, address_name, building_name, lng, lat, address_type, _ingested_at
    ) VALUES (
        %s, %s, %s, %s, %s, %s, %s, %s
    );
    """
    for record in records:
        values = (
            record["kapt_code"], record["query_address"], record["address_name"],
            record["building_name"], record["lng"], record["lat"],
            record["address_type"], datetime.datetime.now(datetime.timezone.utc),
        )
        cur.execute(insert_sql, values)

    conn.commit()
    print(f"{len(records)}건 적재 완료")


if __name__ == "__main__":
    conn = get_connection()
    create_table(conn)

    addresses = get_complex_addresses(conn)

    records = []
    for kapt_code, doro_juso in addresses:
        response_json = fetch_address(doro_juso)
        record = parse_address(kapt_code, doro_juso, response_json)
        records.append(record)

    save_records(conn, records)

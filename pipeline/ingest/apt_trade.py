import requests
import xml.etree.ElementTree as ET


def fetch_apt_trade(lawd_cd, deal_ymd):
    params = {
        "LAWD_CD": lawd_cd,
        "DEAL_YMD": deal_ymd,
        "serviceKey": os.getenv("DATA_GO_KR_SERVICE_KEY"),
        "numOfRows": 1000,
    }
    response = requests.get("https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade", params=params)
    return response.text

# print(response.status_code)
# print(response.text[:1000]) 

def parse_apt_trade(xml_text):
    root = ET.fromstring(xml_text)
    items = root.findall(".//item")

    one_item = items[0]
    value = one_item.find("aptNm").text

    records = []
    for item in items:
        record = {
        "sgg_cd": item.find("sggCd").text,
        "umd_nm": item.find("umdNm").text,
        "jibun": item.find("jibun").text,
        "apt_nm": item.find("aptNm").text,
        "apt_dong": item.find("aptDong").text,
        "exclu_use_ar": item.find("excluUseAr").text,
        "deal_year": item.find("dealYear").text,
        "deal_month": item.find("dealMonth").text,
        "deal_day": item.find("dealDay").text,
        "deal_amount": item.find("dealAmount").text,
        "floor": item.find("floor").text,
        "build_year": item.find("buildYear").text,
        "dealing_gbn": item.find("dealingGbn").text,
        "estate_agent_sgg_nm": item.find("estateAgentSggNm").text,
        "rgst_date": item.find("rgstDate").text,
        "sler_gbn": item.find("slerGbn").text,
        "buyer_gbn": item.find("buyerGbn").text,
        "land_leasehold_gbn": item.find("landLeaseholdGbn").text,
        "cdeal_type": item.find("cdealType").text,
        "cdeal_day": item.find("cdealDay").text,
    }

        records.append(record)
    return records
# print(len(records)) ## 확인용
# print(records[0])

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
    CREATE TABLE IF NOT EXISTS raw_apt_trade (
        raw_id SERIAL PRIMARY KEY,
        sgg_cd TEXT,
        umd_nm TEXT,
        jibun TEXT,
        apt_nm TEXT,
        apt_dong TEXT,
        exclu_use_ar TEXT,
        deal_year TEXT,
        deal_month TEXT,
        deal_day TEXT,
        deal_amount TEXT,
        floor TEXT,
        build_year TEXT,
        dealing_gbn TEXT,
        estate_agent_sgg_nm TEXT,
        rgst_date TEXT,
        sler_gbn TEXT,
        buyer_gbn TEXT,
        land_leasehold_gbn TEXT,
        cdeal_type TEXT,
        cdeal_day TEXT,
        _ingested_at TIMESTAMPTZ
    );
    """

    cur.execute(create_table_sql)
    conn.commit()
    print("테이블 생성 완료")

import datetime

def save_records(conn, records):
    cur = conn.cursor()
    insert_sql = """
    INSERT INTO raw_apt_trade (
        sgg_cd, umd_nm, jibun, apt_nm, apt_dong, exclu_use_ar,
        deal_year, deal_month, deal_day, deal_amount, floor, build_year,
        dealing_gbn, estate_agent_sgg_nm, rgst_date, sler_gbn, buyer_gbn,
        land_leasehold_gbn, cdeal_type, cdeal_day, _ingested_at
    ) VALUES (
        %s, %s, %s, %s, %s, %s,
        %s, %s, %s, %s, %s, %s,
        %s, %s, %s, %s, %s,
        %s, %s, %s, %s
    );
    """

    for record in records:
        values = (
            record["sgg_cd"], record["umd_nm"], record["jibun"], record["apt_nm"],
            record["apt_dong"], record["exclu_use_ar"], record["deal_year"],
            record["deal_month"], record["deal_day"], record["deal_amount"],
            record["floor"], record["build_year"], record["dealing_gbn"],
            record["estate_agent_sgg_nm"], record["rgst_date"], record["sler_gbn"],
            record["buyer_gbn"], record["land_leasehold_gbn"], record["cdeal_type"],
            record["cdeal_day"], datetime.datetime.now(datetime.timezone.utc),
        )
        cur.execute(insert_sql, values)

    conn.commit()
    print(f"{len(records)}건 적재 완료")

if __name__ == "__main__":
    conn = get_connection()
    create_table(conn)

    year = 2026
    month = 8

    for i in range(60):
        deal_ymd = f"{year}{month:02d}"
        print(deal_ymd) # 확인용

        # xml_text = fetch_apt_trade("11710", deal_ymd)#송파구
        xml_text = fetch_apt_trade("11740", deal_ymd) #강동구
        records = parse_apt_trade(xml_text)
        save_records(conn, records)
    

        month -= 1
        if month == 0:
            month = 12
            year -= 1





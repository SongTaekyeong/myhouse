# apache/airflow 공식 이미지에 dbt(postgres 어댑터)만 얹은 것.
# dbt_build DAG가 BashOperator로 "dbt run"/"dbt test"를 실행하려면 필요함.
FROM apache/airflow:2.9.3
RUN pip install --no-cache-dir dbt-postgres==1.11.0

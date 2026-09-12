from airflow.decorators import dag
from airflow.operators.bash import BashOperator
from datetime import datetime


@dag(
    schedule="0 7 * * *",   # 매일 07:00
    start_date=datetime(2025, 1, 1),
    catchup=False,
)
def dbt_build():

    dbt_run = BashOperator(
        task_id="dbt_run",
        bash_command="cd /opt/airflow/dbt && dbt run",
    )

    dbt_test = BashOperator(
        task_id="dbt_test",
        bash_command="cd /opt/airflow/dbt && dbt test",
    )

    dbt_run >> dbt_test


dbt_build()

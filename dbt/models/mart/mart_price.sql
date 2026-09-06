{{ config(
    materialized='incremental',
    unique_key=['complex_id', 'area_group', 'ym']
) }}


with trade_with_complex as (
    select
        ick.complex_id,
        itc.area_group,
        itc.deal_year || lpad(itc.deal_month, 2, '0') as ym,
        itc.deal_amount_krw,
        itc.exclu_use_ar_num
    from {{ ref('int_trade_cleaned') }} itc
    join {{ ref('int_complex_key') }} ick
        on itc.sgg_cd = ick.sgg_cd
        and itc.umd_nm = ick.umd_nm
        and itc.jibun = ick.jibun
    where itc.is_outlier = false
        {% if is_incremental() %}
        and itc.deal_date >= current_date - interval '3 months'
        {% endif %}

),

unit_priced as (
    select
        *,
        deal_amount_krw / (exclu_use_ar_num / 3.3058) as unit_price_krw
    from trade_with_complex
)

select
    complex_id,
    area_group,
    ym,
    count(*) as trade_cnt,
    percentile_cont(0.5) within group (order by deal_amount_krw) as price_median,
    percentile_cont(0.25) within group (order by deal_amount_krw) as price_p25,
    percentile_cont(0.75) within group (order by deal_amount_krw) as price_p75,
    percentile_cont(0.5) within group (order by unit_price_krw) as unit_price_per_pyeong
from unit_priced
group by complex_id, area_group, ym

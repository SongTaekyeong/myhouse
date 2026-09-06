with base as (
    select *,
        row_number() over (
            partition by sgg_cd, apt_nm, apt_dong, jibun, deal_year, deal_month, deal_day, deal_amount, floor
            order by _ingested_at desc
        ) as rn
    from {{ source('raw', 'raw_apt_trade') }}
)

select *,
    replace(deal_amount, ',', '')::bigint * 10000 as deal_amount_krw,
    concat(deal_year, '-', deal_month, '-', deal_day)::date as deal_date,
    exclu_use_ar::numeric as exclu_use_ar_num
from base
where rn = 1
    and trim(cdeal_type) = ''

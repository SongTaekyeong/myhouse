select
    complex_id,
    area_group,
    sum(price_median * trade_cnt) / sum(trade_cnt) as price_recent,
    sum(trade_cnt) as trade_cnt_12m,
    max(ym) as last_trade_ym
from {{ ref('mart_price') }}
where ym >= to_char(current_date - interval '12 months', 'YYYYMM')
group by complex_id, area_group

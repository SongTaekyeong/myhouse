with area_grouped as (
    select
        *,
        case
            when exclu_use_ar_num < 20 then '~20'
            when exclu_use_ar_num < 25 then '20-25'
            when exclu_use_ar_num < 30 then '25-30'
            when exclu_use_ar_num < 40 then '30-40'
            else '40~'
        end as area_group
    from {{ ref('stg_apt_trade') }}
),

group_medians as (
    select
        apt_nm,
        apt_dong,
        area_group,
        percentile_cont(0.5) within group (order by deal_amount_krw) as median_price_krw
    from area_grouped
    group by apt_nm, apt_dong, area_group
)

select
    area_grouped.*,
    group_medians.median_price_krw,
    case
    when deal_amount_krw > median_price_krw * 1.4 then true
    when deal_amount_krw < median_price_krw * 0.6 then true
    else false
end as is_outlier

from area_grouped
join group_medians
    on area_grouped.apt_nm = group_medians.apt_nm
    and area_grouped.apt_dong = group_medians.apt_dong
    and area_grouped.area_group = group_medians.area_group

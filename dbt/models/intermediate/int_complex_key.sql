with complex_parsed as (
    select
        kapt_code,
        kapt_name,
        split_part(kapt_addr, ' ', 3) as umd_nm,
        split_part(kapt_addr, ' ', 4) as jibun
        from {{ ref('stg_complex_info') }}

),

trade_keys as (
    select distinct sgg_cd, umd_nm, jibun
    from {{ ref('stg_apt_trade') }}
)

select
    complex_parsed.kapt_code as complex_id,
    complex_parsed.kapt_name,
    trade_keys.sgg_cd,
    trade_keys.umd_nm,
    trade_keys.jibun
from complex_parsed
join trade_keys
    on complex_parsed.umd_nm = trade_keys.umd_nm
    and complex_parsed.jibun = trade_keys.jibun

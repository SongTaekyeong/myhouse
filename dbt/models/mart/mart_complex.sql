select
    icg.complex_id,
    icg.kapt_name as name,
    icg.sgg_cd as sigungu_cd,
    rci.kapt_addr as address_jibun,
    rci.doro_juso as address_road,
    icg.lat::numeric as lat,
    icg.lng::numeric as lng,
    st_setsrid(st_makepoint(icg.lng::double precision, icg.lat::double precision), 4326) as geom,
    substring(rci.kapt_usedate, 1, 6) as built_ym,
    rci.kapt_da_cnt::numeric::integer as total_households,
    rci.kapt_dong_cnt::integer as total_dongs,
    now() as updated_at
from {{ ref('int_complex_geocoded') }} icg
join {{ source('raw', 'raw_complex_info') }} rci
    on icg.complex_id = rci.kapt_code

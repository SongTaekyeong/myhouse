select
    int_complex_key.complex_id,
    int_complex_key.kapt_name,
    int_complex_key.sgg_cd,
    int_complex_key.umd_nm,
    int_complex_key.jibun,
    raw_address.lat,
    raw_address.lng,
    raw_address.address_type as match_method,
    case
        when raw_address.lat is null then 'no_coords'
        when int_complex_key.kapt_name like '%' || raw_address.building_name || '%'
            then 'high'
        else 'medium'
    end as match_confidence
from {{ ref('int_complex_key') }}
left join {{ source('raw', 'raw_address') }}
    on int_complex_key.complex_id = raw_address.kapt_code

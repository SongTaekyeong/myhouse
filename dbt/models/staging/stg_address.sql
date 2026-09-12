with base as (
    select *,
        row_number() over (
            partition by kapt_code
            order by _ingested_at desc
        ) as rn
    from {{ source('raw', 'raw_address') }}
)

select *
from base
where rn = 1

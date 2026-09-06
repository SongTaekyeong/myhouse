select
    mc.complex_id,
    dd.dest_id,
    st_distance(mc.geom::geography, dd.geom::geography) / 1000 as distance_km,
    (st_distance(mc.geom::geography, dd.geom::geography) / 1000 / 25.0) * 60 + 10 as est_minutes
from {{ ref('mart_complex') }} mc
cross join {{ source('app', 'dim_destination') }} dd

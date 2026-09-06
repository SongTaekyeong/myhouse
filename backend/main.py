"""FastAPI 엔드포인트 (SPEC.md §8)."""

import json
import os
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from auth import require_session
from db import get_app_session, get_mart_session
from scoring import score_complex

PROFILE_PATH = Path(__file__).resolve().parent.parent / "config" / "profile.json"

app = FastAPI(title="내집 API", debug=os.getenv("APP_ENV") != "production")

_cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


def load_profile() -> dict:
    with open(PROFILE_PATH, encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/profile")
def get_profile(_: str = Depends(require_session)):
    return load_profile()


@app.get("/api/complexes")
def list_complexes(
    area_group: str | None = None,
    _: str = Depends(require_session),
    session: Session = Depends(get_mart_session),
):
    profile = load_profile()
    area_group = area_group or profile["area_group"]
    dest_ids = [d["dest_id"] for d in profile["destinations"]]

    rows = session.execute(
        text("""
            SELECT
                mc.complex_id, mc.name, mc.lat::float AS lat, mc.lng::float AS lng,
                mc.total_households, mc.total_dongs, mc.built_ym,
                mpl.price_recent, mpl.trade_cnt_12m
            FROM mart_complex mc
            LEFT JOIN mart_price_latest mpl
                ON mc.complex_id = mpl.complex_id AND mpl.area_group = :area_group
        """),
        {"area_group": area_group},
    ).mappings().all()

    complex_ids = [r["complex_id"] for r in rows]
    commute_rows = session.execute(
        text("""
            SELECT complex_id, dest_id, est_minutes
            FROM mart_commute
            WHERE complex_id = ANY(:ids)
        """),
        {"ids": complex_ids},
    ).mappings().all()

    commutes_by_complex: dict[str, dict] = {}
    for r in commute_rows:
        commutes_by_complex.setdefault(r["complex_id"], {})[r["dest_id"]] = r["est_minutes"]

    results = []
    excluded_count = 0
    for r in rows:
        known = commutes_by_complex.get(r["complex_id"], {})
        commutes = {dest_id: known.get(dest_id) for dest_id in dest_ids}

        complex_data = {
            "total_households": r["total_households"],
            "price_recent": float(r["price_recent"]) if r["price_recent"] is not None else None,
            "trade_cnt_12m": r["trade_cnt_12m"] or 0,
            "commutes": commutes,
        }
        scored = score_complex(complex_data, profile)
        if scored["excluded_by"]:
            excluded_count += 1

        results.append({
            "complex_id": r["complex_id"],
            "name": r["name"],
            "lat": r["lat"],
            "lng": r["lng"],
            "total_households": r["total_households"],
            "total_dongs": r["total_dongs"],
            "built_ym": r["built_ym"],
            "price_recent": complex_data["price_recent"],
            "commutes": commutes,
            **scored,
        })

    return {
        "complexes": results,
        "shown": len(results) - excluded_count,
        "excluded": excluded_count,
    }


@app.get("/api/complexes/{complex_id}")
def get_complex(
    complex_id: str,
    _: str = Depends(require_session),
    session: Session = Depends(get_mart_session),
):
    complex_row = session.execute(
        text("""
            SELECT complex_id, name, sigungu_cd, address_jibun, address_road,
                   lat::float AS lat, lng::float AS lng,
                   built_ym, total_households, total_dongs
            FROM mart_complex
            WHERE complex_id = :id
        """),
        {"id": complex_id},
    ).mappings().first()

    if complex_row is None:
        raise HTTPException(status_code=404, detail="단지를 찾을 수 없습니다.")

    price_history = session.execute(
        text("""
            SELECT area_group, ym, trade_cnt, price_median, price_p25, price_p75, unit_price_per_pyeong
            FROM mart_price
            WHERE complex_id = :id
            ORDER BY ym DESC
            LIMIT 24
        """),
        {"id": complex_id},
    ).mappings().all()

    commutes = session.execute(
        text("SELECT dest_id, distance_km, est_minutes FROM mart_commute WHERE complex_id = :id"),
        {"id": complex_id},
    ).mappings().all()

    return {
        "complex": dict(complex_row),
        "price_history": [dict(r) for r in price_history],
        "commutes": [dict(r) for r in commutes],
    }


@app.post("/api/destinations")
def add_destination(
    payload: dict,
    _: str = Depends(require_session),
    session: Session = Depends(get_app_session),
):
    required = {"dest_id", "label", "lat", "lng", "max_minutes"}
    missing = required - payload.keys()
    if missing:
        raise HTTPException(status_code=422, detail=f"필수 필드 누락: {missing}")

    session.execute(
        text("""
            INSERT INTO dim_destination (dest_id, label, lat, lng, geom, max_minutes, updated_at)
            VALUES (:dest_id, :label, :lat, :lng, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), :max_minutes, now())
            ON CONFLICT (dest_id) DO UPDATE SET
                label = EXCLUDED.label, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
                geom = EXCLUDED.geom, max_minutes = EXCLUDED.max_minutes, updated_at = now()
        """),
        payload,
    )
    session.commit()
    return {"status": "ok"}

from scoring import score_complex, score_price, score_households, apply_hard_filters

PROFILE = {
    "destinations": [
        {"dest_id": "me", "label": "본인 직장", "lat": 0, "lng": 0, "max_minutes": 50},
        {"dest_id": "spouse", "label": "배우자 직장", "lat": 0, "lng": 0, "max_minutes": 60},
    ],
    "budget_cap": 1_000_000_000,
    "min_households": 500,
    "area_group": "25-30",
    "weights": {"commute": 0.4, "price": 0.35, "households": 0.25},
}


def make_complex(**overrides):
    base = {
        "total_households": 1000,
        "price_recent": 800_000_000,  # r = 0.8, 만점 구간
        "trade_cnt_12m": 5,
        "commutes": {"me": 30, "spouse": 40},
    }
    base.update(overrides)
    return base


def test_normal_case_scores_and_not_excluded():
    result = score_complex(make_complex(), PROFILE)
    assert result["excluded_by"] == []
    assert result["commute_status"] == "ok"
    assert result["score"] is not None
    assert 0 <= result["score"] <= 100
    assert result["components"]["price"] == 1.0  # r=0.8 은 [0.65, 0.95] 구간


def test_budget_hard_filter():
    result = score_complex(make_complex(price_recent=1_500_000_000), PROFILE)
    assert "budget" in result["excluded_by"]
    assert result["score"] is None


def test_commute_hard_filter_when_over_max_minutes():
    result = score_complex(make_complex(commutes={"me": 60, "spouse": 40}), PROFILE)
    assert "commute" in result["excluded_by"]


def test_households_hard_filter():
    result = score_complex(make_complex(total_households=100), PROFILE)
    assert "households" in result["excluded_by"]


def test_no_trade_hard_filter():
    result = score_complex(make_complex(trade_cnt_12m=0, price_recent=None), PROFILE)
    assert "no_trade" in result["excluded_by"]


def test_commute_pending_when_dest_missing_reweights_score():
    result = score_complex(make_complex(commutes={"me": 30}), PROFILE)
    assert result["commute_status"] == "pending"
    assert result["components"]["commute"] is None
    # 가중치가 price(0.35)+households(0.25)=0.6 으로 재정규화되어도 점수는 계산됨
    assert result["excluded_by"] == []
    assert result["score"] is not None


def test_score_price_below_ideal_range_decays_linearly():
    assert score_price(500_000_000, 1_000_000_000) < 1.0  # r=0.5 < 0.65
    assert score_price(650_000_000, 1_000_000_000) == 1.0  # r=0.65, 경계


def test_score_price_above_ideal_range_decays_to_zero_at_cap():
    assert score_price(950_000_000, 1_000_000_000) == 1.0  # r=0.95, 경계
    assert score_price(1_000_000_000, 1_000_000_000) == 0.0  # r=1.0, budget_cap 그 자체


def test_score_households_monotonic_increasing():
    assert score_households(300) == 0.0
    assert score_households(3000) == 1.0
    assert 0 < score_households(1000) < 1


def test_apply_hard_filters_collects_all_matching_reasons():
    reasons = apply_hard_filters(
        make_complex(total_households=100, price_recent=2_000_000_000),
        PROFILE,
    )
    assert set(reasons) == {"budget", "households"}

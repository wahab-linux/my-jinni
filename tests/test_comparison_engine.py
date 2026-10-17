from itertools import permutations

import pytest
from pydantic import ValidationError

from app.comparison.catalog import get_scenario
from app.comparison.engine import DecisionInputError, evaluate, round_six, validate_request
from app.comparison.schemas import Dataset, DecisionRequest, Scenario, validate_dataset


def source(id):
    return {"id": id, "label": id, "is_simulated": True, "updated_at": "2040-06-01T12:00:00+00:00"}


@pytest.fixture
def scenario():
    return Scenario.model_validate(
        {
            "id": "hardware",
            "title": "Hardware choices",
            "description": "A reusable domain example.",
            "notice": "Synthetic examples only.",
            "criteria": [
                {
                    "id": "cost-pence",
                    "label": "Cost",
                    "unit": "pence",
                    "direction": "minimize",
                    "default_weight": 50,
                },
                {
                    "id": "quality-score",
                    "label": "Quality",
                    "unit": "score",
                    "direction": "maximize",
                    "default_weight": 50,
                },
            ],
            "default_request": {"scenario_id": "hardware", "weights": {}, "constraints": []},
        }
    )


@pytest.fixture
def dataset():
    return Dataset.model_validate(
        {
            "option_source": source("hardware-catalog"),
            "metric_source": source("hardware-benchmarks"),
            "options": [
                {
                    "id": id,
                    "name": "Choice " + id,
                    "description": "Synthetic device.",
                    "category": "device",
                }
                for id in "abc"
            ],
            "observations": [
                {
                    "option_id": id,
                    "available": True,
                    "metrics": {"cost-pence": cost, "quality-score": quality},
                }
                for id, cost, quality in [("a", 100, 10), ("b", 200, 20), ("c", 300, 30)]
            ],
        }
    )


def request(**changes):
    return DecisionRequest.model_validate({"scenario_id": "hardware", **changes})


def mutate_dataset(dataset, change):
    value = dataset.model_dump(mode="json")
    change(value)
    return Dataset.model_validate(value)


def test_generic_domain_defaults_and_equal_scores_are_stable(scenario, dataset):
    baseline = evaluate(scenario, dataset, request())
    assert baseline.title == "Hardware choices"
    assert baseline.recommended.id == "a"
    assert [option.score for option in baseline.ranked] == [50, 50, 50]
    assert baseline.evaluated_count == 3
    for options in permutations(dataset.options):
        for observations in permutations(dataset.observations):
            shuffled = dataset.model_copy(
                update={"options": list(options), "observations": list(observations)}
            )
            assert evaluate(scenario, shuffled, request()) == baseline


@pytest.mark.parametrize(
    ("weights", "expected"),
    [
        ({"cost-pence": 100, "quality-score": 0}, "a"),
        ({"cost-pence": 0, "quality-score": 100}, "c"),
    ],
)
def test_weight_changes_and_zero_disable_only_scoring(scenario, dataset, weights, expected):
    result = evaluate(scenario, dataset, request(weights=weights))
    assert result.recommended.id == expected
    assert result.recommended.score == 100
    assert len(result.recommended.contributions) == 1
    assert result.recommended.contributions[0].weight == 100


@pytest.mark.parametrize(
    ("operator", "limit", "expected"),
    [("lte", 100, ["a"]), ("lte", 99, []), ("gte", 300, ["c"]), ("gte", 301, [])],
)
def test_constraint_equality_passes_and_one_penny_outside_fails(
    scenario, dataset, operator, limit, expected
):
    result = evaluate(
        scenario,
        dataset,
        request(constraints=[{"criterion_id": "cost-pence", "operator": operator, "value": limit}]),
    )
    assert [option.id for option in result.ranked] == expected


def test_normalisation_uses_feasible_options_only(scenario, dataset):
    data = mutate_dataset(
        dataset, lambda value: value["observations"][2]["metrics"].update({"cost-pence": 1_000_000})
    )
    result = evaluate(
        scenario,
        data,
        request(
            weights={"cost-pence": 100, "quality-score": 0},
            constraints=[{"criterion_id": "cost-pence", "operator": "lte", "value": 200}],
        ),
    )
    assert [(option.id, option.score) for option in result.ranked] == [("a", 100), ("b", 0)]
    assert result.excluded[0].id == "c"


def test_constant_criteria_receive_full_credit_without_dividing_by_zero(scenario, dataset):
    data = dataset.model_dump(mode="json")
    for row in data["observations"]:
        row["metrics"]["quality-score"] = 7
    result = evaluate(scenario, Dataset.model_validate(data), request())
    assert [option.score for option in result.ranked] == [100, 75, 50]
    assert all(option.contributions[1].normalised == 1 for option in result.ranked)


@pytest.mark.parametrize("unknown", [None, "missing"])
def test_missing_active_metrics_are_unknown_and_never_zero(scenario, dataset, unknown):
    value = dataset.model_dump(mode="json")
    if unknown == "missing":
        del value["observations"][0]["metrics"]["cost-pence"]
    else:
        value["observations"][0]["metrics"]["cost-pence"] = None
    result = evaluate(scenario, Dataset.model_validate(value), request())
    assert "a" not in [option.id for option in result.ranked]
    assert result.excluded[0].reasons == ["Missing value for Cost."]


def test_disabled_unknown_metric_is_allowed_until_a_constraint_needs_it(scenario, dataset):
    data = mutate_dataset(
        dataset, lambda value: value["observations"][0]["metrics"].update({"quality-score": None})
    )
    weights = {"quality-score": 0, "cost-pence": 100}
    assert evaluate(scenario, data, request(weights=weights)).recommended.id == "a"
    constrained = request(
        weights=weights,
        constraints=[{"criterion_id": "quality-score", "operator": "gte", "value": 0}],
    )
    assert evaluate(scenario, data, constrained).excluded[0].reasons == [
        "Missing value for Quality."
    ]


@pytest.mark.parametrize(
    ("availability", "reason"),
    [(False, "Option is unavailable."), (None, "Availability is unknown.")],
)
def test_unavailable_or_unknown_availability_excludes_even_the_best_metric(
    scenario, dataset, availability, reason
):
    data = mutate_dataset(
        dataset, lambda value: value["observations"][0].update({"available": availability})
    )
    result = evaluate(scenario, data, request(weights={"quality-score": 0, "cost-pence": 100}))
    assert result.recommended.id == "b"
    assert result.excluded[0].reasons == [reason]


def test_missing_observation_and_empty_data_are_valid_no_fallback_cases(scenario, dataset):
    missing = dataset.model_copy(update={"observations": []})
    result = evaluate(scenario, missing, request())
    assert result.recommended is None
    assert len(result.excluded) == 3
    assert result.excluded[0].reasons == ["No measurements were provided for this option."]
    empty = dataset.model_copy(update={"options": [], "observations": []})
    assert evaluate(scenario, empty, request()).evaluated_count == 0


@pytest.mark.parametrize(
    "changes",
    [
        {"weights": {"unknown": 1}},
        {"weights": {"cost-pence": 0, "quality-score": 0}},
        {"constraints": [{"criterion_id": "unknown", "operator": "lte", "value": 1}]},
        {"constraints": [{"criterion_id": "cost-pence", "operator": "lte", "value": 1.5}]},
        {"constraints": [{"criterion_id": "cost-pence", "operator": "lte", "value": -1}]},
    ],
)
def test_contextual_request_validation_rejects_bad_criteria_or_money(scenario, changes):
    with pytest.raises(DecisionInputError):
        validate_request(scenario, request(**changes))


def test_request_and_scenario_ids_must_agree(scenario):
    with pytest.raises(DecisionInputError, match="selected scenario"):
        validate_request(scenario, DecisionRequest(scenario_id="travel"))


@pytest.mark.parametrize("bad_value", [True, float("nan"), float("inf"), 1e12 + 1, "12"])
def test_numeric_input_is_bounded_finite_and_not_boolean(dataset, bad_value):
    raw = dataset.model_dump(mode="json")
    raw["observations"][0]["metrics"]["quality-score"] = bad_value
    with pytest.raises(ValidationError):
        Dataset.model_validate(raw)


@pytest.mark.parametrize("bad_value", [1.5, 100.0, -1])
def test_money_measurements_require_nonnegative_integer_pence(scenario, dataset, bad_value):
    data = mutate_dataset(
        dataset, lambda value: value["observations"][0]["metrics"].update({"cost-pence": bad_value})
    )
    with pytest.raises(ValueError, match="integer pence"):
        validate_dataset(data, scenario.criteria)


@pytest.mark.parametrize("bad_weight", [True, -1, 101, float("nan"), float("inf")])
def test_invalid_weights_are_rejected(bad_weight):
    with pytest.raises(ValidationError):
        request(weights={"cost-pence": bad_weight})


def test_score_rounding_is_explicit_half_up_for_browser_parity():
    assert round_six(1.2345675) == 1.234568
    assert round_six(1.2345674) == 1.234567


def test_custom_domain_changes_title_criteria_and_measurements_without_rule_changes(dataset):
    original = get_scenario("custom")
    value = dataset.model_dump(mode="json")
    value["option_source"]["is_simulated"] = False
    value["metric_source"]["is_simulated"] = False
    for index, row in enumerate(value["observations"]):
        row["metrics"] = {"latency-ms": 30 - index * 10, "uptime-score": 90 + index}
    body = DecisionRequest.model_validate(
        {
            "scenario_id": "custom",
            "custom": {
                "title": "Choose a server",
                "dataset": value,
                "criteria": [
                    {
                        "id": "latency-ms",
                        "label": "Latency",
                        "unit": "ms",
                        "direction": "minimize",
                        "default_weight": 70,
                    },
                    {
                        "id": "uptime-score",
                        "label": "Uptime estimate",
                        "unit": "score",
                        "direction": "maximize",
                        "default_weight": 30,
                    },
                ],
            },
        }
    )
    result = evaluate(original, dataset, body)
    assert result.title == "Choose a server"
    assert result.recommended.id == "c"
    assert result.recommended.score == 100
    assert result.is_simulated is False
    assert "independent verification" in result.limitations[-1]


@pytest.mark.parametrize(
    "invalid", ["option-duplicate", "observation-duplicate", "unknown-observation", "same-source"]
)
def test_ambiguous_or_unknown_source_identifiers_are_rejected(dataset, invalid):
    value = dataset.model_dump(mode="json")
    if invalid == "option-duplicate":
        value["options"].append(value["options"][0])
    elif invalid == "observation-duplicate":
        value["observations"].append(value["observations"][0])
    elif invalid == "unknown-observation":
        value["observations"][0]["option_id"] = "unknown"
    else:
        value["metric_source"]["id"] = value["option_source"]["id"]
    with pytest.raises(ValidationError):
        Dataset.model_validate(value)


def test_option_limit_accepts_fifty_and_rejects_fifty_one(scenario, dataset):
    raw = dataset.model_dump(mode="json")
    option, observation = raw["options"][0], raw["observations"][0]
    raw["options"] = [{**option, "id": f"option-{index}"} for index in range(50)]
    raw["observations"] = [{**observation, "option_id": f"option-{index}"} for index in range(50)]
    result = evaluate(scenario, Dataset.model_validate(raw), request())
    assert result.evaluated_count == 50
    assert len(result.ranked) == 50
    raw["options"].append({**option, "id": "one-too-many"})
    with pytest.raises(ValidationError):
        Dataset.model_validate(raw)


def test_criterion_and_weight_limits_accept_ten_and_reject_eleven(scenario):
    raw = scenario.model_dump(mode="json")
    prototype = raw["criteria"][0]
    raw["criteria"] = [{**prototype, "id": f"criterion-{index}"} for index in range(10)]
    assert len(Scenario.model_validate(raw).criteria) == 10
    raw["criteria"].append({**prototype, "id": "one-too-many"})
    with pytest.raises(ValidationError):
        Scenario.model_validate(raw)
    assert len(request(weights={f"criterion-{index}": 1 for index in range(10)}).weights) == 10
    with pytest.raises(ValidationError):
        request(weights={f"criterion-{index}": 1 for index in range(11)})


def test_constraint_limit_accepts_twenty_and_rejects_twenty_one(scenario, dataset):
    constraint = {"criterion_id": "cost-pence", "operator": "lte", "value": 1000}
    assert len(evaluate(scenario, dataset, request(constraints=[constraint] * 20)).ranked) == 3
    with pytest.raises(ValidationError):
        request(constraints=[constraint] * 21)


def test_measurement_dictionary_is_bounded_by_ten_criteria(dataset):
    raw = dataset.model_dump(mode="json")
    raw["observations"][0]["metrics"] = {f"criterion-{index}": 1 for index in range(10)}
    assert len(Dataset.model_validate(raw).observations[0].metrics) == 10
    raw["observations"][0]["metrics"]["one-too-many"] = 1
    with pytest.raises(ValidationError):
        Dataset.model_validate(raw)


def test_duplicate_criteria_and_blank_labels_are_rejected(scenario):
    raw = scenario.model_dump(mode="json")
    raw["criteria"].append(raw["criteria"][0])
    with pytest.raises(ValidationError):
        Scenario.model_validate(raw)
    raw = scenario.model_dump(mode="json")
    raw["criteria"][0]["label"] = " "
    with pytest.raises(ValidationError):
        Scenario.model_validate(raw)

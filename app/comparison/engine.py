from math import floor

from app.comparison.schemas import (
    Contribution,
    Dataset,
    DecisionRequest,
    DecisionResult,
    ExcludedOption,
    RankedOption,
    Scenario,
    validate_dataset,
)

BASE_LIMITATIONS = [
    "Scores compare only the supplied options and chosen weights; they are not probabilities.",
    "Missing measurements and unknown availability cannot establish feasibility.",
    "Source names and simulation flags are supplied metadata, not independent verification.",
]


class DecisionInputError(ValueError):
    def __init__(self, message: str, field: str = "body"):
        super().__init__(message)
        self.field = field


def round_six(value: float) -> float:
    return floor(value * 1_000_000 + 0.5) / 1_000_000


def validate_request(scenario: Scenario, request: DecisionRequest) -> None:
    if scenario.id != request.scenario_id:
        raise DecisionInputError(
            "The request must identify the selected scenario.", "body.scenario_id"
        )
    criteria = request.custom.criteria if request.custom is not None else scenario.criteria
    by_id = {criterion.id: criterion for criterion in criteria}
    if not set(request.weights).issubset(by_id):
        raise DecisionInputError("Weights contain an unknown criterion.", "body.weights")
    if not any(
        request.weights.get(criterion.id, criterion.default_weight) > 0 for criterion in criteria
    ):
        raise DecisionInputError("Choose at least one positive criterion weight.", "body.weights")
    for constraint in request.constraints:
        if constraint.criterion_id not in by_id:
            raise DecisionInputError(
                "A constraint references an unknown criterion.", "body.constraints"
            )
        if by_id[constraint.criterion_id].unit == "pence" and (
            type(constraint.value) is not int or constraint.value < 0
        ):
            raise DecisionInputError(
                "Money constraints must use nonnegative integer pence.", "body.constraints"
            )
    if request.custom is not None:
        try:
            validate_dataset(request.custom.dataset, criteria)
        except ValueError as error:
            raise DecisionInputError(str(error), "body.custom.dataset") from error


def evaluate(scenario: Scenario, dataset: Dataset, request: DecisionRequest) -> DecisionResult:
    validate_request(scenario, request)
    criteria = scenario.criteria
    title = scenario.title
    if request.custom is not None:
        criteria = request.custom.criteria
        dataset = request.custom.dataset
        title = request.custom.title
    try:
        validate_dataset(dataset, criteria)
    except ValueError as error:
        raise DecisionInputError(str(error), "body.custom.dataset") from error
    by_id = {criterion.id: criterion for criterion in criteria}
    weights = {
        criterion.id: request.weights.get(criterion.id, criterion.default_weight)
        for criterion in criteria
    }
    active = [criterion for criterion in criteria if weights[criterion.id] > 0]
    needed = {criterion.id for criterion in active} | {
        constraint.criterion_id for constraint in request.constraints
    }
    observations = {observation.option_id: observation for observation in dataset.observations}
    feasible = []
    excluded = []
    for option in dataset.options:
        observation = observations.get(option.id)
        reasons = []
        if observation is None:
            reasons.append("No measurements were provided for this option.")
        elif observation.available is None:
            reasons.append("Availability is unknown.")
        elif not observation.available:
            reasons.append("Option is unavailable.")
        if observation is not None:
            for criterion in criteria:
                if criterion.id in needed and observation.metrics.get(criterion.id) is None:
                    reasons.append(f"Missing value for {criterion.label}.")
            for constraint in request.constraints:
                value = observation.metrics.get(constraint.criterion_id)
                if value is None:
                    continue
                label = by_id[constraint.criterion_id].label
                if constraint.operator == "lte" and value > constraint.value:
                    reasons.append(f"{label} exceeds its selected maximum.")
                elif constraint.operator == "gte" and value < constraint.value:
                    reasons.append(f"{label} is below its selected minimum.")
        if reasons:
            excluded.append(ExcludedOption(id=option.id, name=option.name, reasons=reasons))
        else:
            feasible.append((option, observation))
    ranges = (
        {
            criterion.id: (
                min(observation.metrics[criterion.id] for _, observation in feasible),
                max(observation.metrics[criterion.id] for _, observation in feasible),
            )
            for criterion in active
        }
        if feasible
        else {}
    )
    total_weight = sum(weights[criterion.id] for criterion in active)
    ranked = []
    source_ids = [dataset.option_source.id, dataset.metric_source.id]
    for option, observation in feasible:
        contributions = []
        score = 0.0
        for criterion in active:
            value = observation.metrics[criterion.id]
            lower, upper = ranges[criterion.id]
            if lower == upper:
                normalised = 1.0
            elif criterion.direction == "maximize":
                normalised = (value - lower) / (upper - lower)
            else:
                normalised = (upper - value) / (upper - lower)
            points = normalised * weights[criterion.id] / total_weight * 100
            score += points
            contributions.append(
                Contribution(
                    criterion_id=criterion.id,
                    label=criterion.label,
                    unit=criterion.unit,
                    value=value,
                    weight=weights[criterion.id],
                    normalised=normalised,
                    points=round_six(points),
                )
            )
        ranked.append(
            RankedOption(
                **option.model_dump(),
                score=round_six(score),
                metrics=observation.metrics,
                contributions=contributions,
                reasons=["Meets all hard constraints with known availability."]
                + [
                    f"For {criterion.label}, "
                    f"{'lower' if criterion.direction == 'minimize' else 'higher'} "
                    "values are preferred."
                    for criterion in active
                ],
                source_ids=source_ids,
            )
        )
    ranked.sort(key=lambda option: (-option.score, option.id))
    excluded.sort(key=lambda option: option.id)
    return DecisionResult(
        scenario_id=request.scenario_id,
        title=title,
        summary="Compared options using the selected hard constraints and weighted criteria."
        if ranked
        else "No options meet all known data and hard constraints.",
        recommended=ranked[0] if ranked else None,
        ranked=ranked,
        excluded=excluded,
        criteria=criteria,
        sources=[dataset.option_source, dataset.metric_source],
        evaluated_count=len(dataset.options),
        is_simulated=dataset.option_source.is_simulated or dataset.metric_source.is_simulated,
        limitations=[scenario.notice, *BASE_LIMITATIONS],
    )

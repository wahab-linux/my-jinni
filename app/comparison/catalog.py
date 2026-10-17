from app.comparison.schemas import Criterion, DecisionRequest, Scenario


def _criterion(id, label, unit, direction, weight):
    return Criterion(id=id, label=label, unit=unit, direction=direction, default_weight=weight)


def _scenario(id, title, description, notice, criteria, constraints=()):
    return Scenario(
        id=id,
        title=title,
        description=description,
        notice=notice,
        criteria=criteria,
        default_request=DecisionRequest(scenario_id=id, constraints=list(constraints)),
    )


SCENARIOS = (
    _scenario(
        "market",
        "Market context",
        "Compare fictional shares, ETF and digital-asset examples using illustrative measures.",
        "Fictional informational comparison only: no live prices, return prediction, "
        "buy/sell recommendation or suitability assessment.",
        [
            _criterion("fee-pence", "Illustrative fee", "pence", "minimize", 30),
            _criterion("volatility-index", "Illustrative volatility", "index", "minimize", 30),
            _criterion("liquidity-score", "Illustrative liquidity", "score", "maximize", 25),
            _criterion(
                "macro-context-score", "Illustrative macro context", "score", "maximize", 15
            ),
        ],
    ),
    _scenario(
        "travel",
        "Travel planner",
        "Compare fictional train, bus, flight, taxi and cycling journeys.",
        "Simulated costs, durations, emissions and availability; "
        "not live routing or a travel guarantee.",
        [
            _criterion("cost-pence", "Total cost", "pence", "minimize", 45),
            _criterion("duration-minutes", "Journey duration", "minutes", "minimize", 35),
            _criterion("emissions-grams", "Estimated emissions", "g CO2e", "minimize", 20),
        ],
        [
            {"criterion_id": "cost-pence", "operator": "lte", "value": 2500},
            {"criterion_id": "duration-minutes", "operator": "lte", "value": 180},
        ],
    ),
    _scenario(
        "student",
        "Student hub",
        "Compare fictional courses, societies, events and internships.",
        "Fictional opportunities and fit estimates; "
        "no verified admissions, availability or career-outcome claims.",
        [
            _criterion("cost-pence", "Participation cost", "pence", "minimize", 30),
            _criterion("commitment-hours", "Weekly time commitment", "hours", "minimize", 30),
            _criterion("fit-score", "Illustrative interest fit", "score", "maximize", 40),
        ],
        [
            {"criterion_id": "cost-pence", "operator": "lte", "value": 15000},
            {"criterion_id": "commitment-hours", "operator": "lte", "value": 8},
        ],
    ),
    _scenario(
        "sustainability",
        "Sustainable choices",
        "Compare fictional practical changes using cost, impact estimates and waiting time.",
        "Simulated environmental-impact estimates and availability; "
        "no independently verified savings or impact claims.",
        [
            _criterion("cost-pence", "Upfront cost", "pence", "minimize", 40),
            _criterion(
                "impact-reduction-score", "Estimated impact reduction", "score", "maximize", 40
            ),
            _criterion("wait-days", "Waiting time", "days", "minimize", 20),
        ],
        [{"criterion_id": "cost-pence", "operator": "lte", "value": 20000}],
    ),
    _scenario(
        "custom",
        "Your own decision",
        "Compare your own options, criteria and measurements "
        "without changing the calculation core.",
        "The default example is fictional. User-supplied measurements and source labels "
        "are not independently verified.",
        [
            _criterion("cost-pence", "Total cost", "pence", "minimize", 40),
            _criterion("time-minutes", "Time needed", "minutes", "minimize", 30),
            _criterion("quality-score", "Quality estimate", "score", "maximize", 30),
        ],
    ),
)


def get_scenario(scenario_id: str) -> Scenario | None:
    return next(
        (scenario.model_copy(deep=True) for scenario in SCENARIOS if scenario.id == scenario_id),
        None,
    )

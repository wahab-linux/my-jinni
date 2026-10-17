from math import isfinite
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    AwareDatetime,
    Field,
    StrictBool,
    StrictFloat,
    StrictInt,
    field_validator,
    model_validator,
)

from app.schemas import Model

MAX_OPTIONS = 50
MAX_CRITERIA = 10
MAX_CONSTRAINTS = 20
Slug = Annotated[str, Field(min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")]


def _nonblank(value: str) -> str:
    if not value.strip():
        raise ValueError("Text must not be blank")
    return value


Text = Annotated[str, Field(min_length=1, max_length=2000), AfterValidator(_nonblank)]
Name = Annotated[str, Field(min_length=1, max_length=200), AfterValidator(_nonblank)]
Label = Annotated[str, Field(min_length=1, max_length=100), AfterValidator(_nonblank)]
Description = Annotated[str, Field(min_length=1, max_length=1000), AfterValidator(_nonblank)]
Number = Annotated[StrictInt | StrictFloat, Field(ge=-1e12, le=1e12)]
Weight = Annotated[StrictInt | StrictFloat, Field(ge=0, le=100)]
ScenarioId = Slug


class Criterion(Model):
    id: Slug
    label: Label
    unit: Annotated[str, Field(min_length=1, max_length=40), AfterValidator(_nonblank)]
    direction: Literal["minimize", "maximize"]
    default_weight: Weight


class Constraint(Model):
    criterion_id: Slug
    operator: Literal["lte", "gte"]
    value: Number


class Provenance(Model):
    id: Slug
    label: Name
    is_simulated: StrictBool
    updated_at: AwareDatetime


class Option(Model):
    id: Slug
    name: Name
    description: Description
    category: Label


class Observation(Model):
    option_id: Slug
    available: StrictBool | None = None
    metrics: dict[Slug, Number | None] = Field(default_factory=dict, max_length=MAX_CRITERIA)


class Dataset(Model):
    option_source: Provenance
    metric_source: Provenance
    options: Annotated[list[Option], Field(max_length=MAX_OPTIONS)]
    observations: Annotated[list[Observation], Field(max_length=MAX_OPTIONS)]

    @model_validator(mode="after")
    def unambiguous_sources_and_records(self) -> "Dataset":
        if self.option_source.id == self.metric_source.id:
            raise ValueError("Option and measurement sources must have different IDs")
        option_ids = [option.id for option in self.options]
        observed_ids = [observation.option_id for observation in self.observations]
        if len(option_ids) != len(set(option_ids)) or len(observed_ids) != len(set(observed_ids)):
            raise ValueError("Option and observation IDs must be unique")
        if not set(observed_ids).issubset(option_ids):
            raise ValueError("Measurements reference an unknown option")
        return self


class CustomDecision(Model):
    title: Name
    criteria: Annotated[list[Criterion], Field(min_length=1, max_length=MAX_CRITERIA)]
    dataset: Dataset

    @field_validator("criteria")
    @classmethod
    def unique_criteria(cls, value: list[Criterion]) -> list[Criterion]:
        if len({criterion.id for criterion in value}) != len(value):
            raise ValueError("Criterion IDs must be unique")
        return value


class DecisionRequest(Model):
    scenario_id: ScenarioId
    weights: dict[Slug, Weight] = Field(default_factory=dict, max_length=MAX_CRITERIA)
    constraints: Annotated[list[Constraint], Field(max_length=MAX_CONSTRAINTS)] = Field(
        default_factory=list
    )
    custom: CustomDecision | None = None

    @model_validator(mode="after")
    def custom_only_for_custom(self) -> "DecisionRequest":
        if self.custom is not None and self.scenario_id != "custom":
            raise ValueError("Custom data is supported only for the custom scenario")
        return self


class Scenario(Model):
    id: ScenarioId
    title: Name
    description: Description
    notice: Text
    criteria: Annotated[list[Criterion], Field(min_length=1, max_length=MAX_CRITERIA)]
    default_request: DecisionRequest

    @model_validator(mode="after")
    def valid_configuration(self) -> "Scenario":
        if len({criterion.id for criterion in self.criteria}) != len(self.criteria):
            raise ValueError("Criterion IDs must be unique")
        if self.default_request.scenario_id != self.id:
            raise ValueError("The default request must identify its own scenario")
        return self


class Contribution(Model):
    criterion_id: Slug
    label: Label
    unit: str
    value: Number
    weight: Weight
    normalised: Annotated[float, Field(ge=0, le=1)]
    points: Annotated[float, Field(ge=0, le=100)]


class RankedOption(Option):
    score: Annotated[float, Field(ge=0, le=100)]
    metrics: dict[Slug, Number | None]
    contributions: list[Contribution]
    reasons: list[str]
    source_ids: list[Slug]


class ExcludedOption(Model):
    id: Slug
    name: Name
    reasons: list[str]


class DecisionResult(Model):
    scenario_id: ScenarioId
    title: Name
    method: Literal["weighted_min_max"] = "weighted_min_max"
    summary: str
    recommended: RankedOption | None
    ranked: list[RankedOption]
    excluded: list[ExcludedOption]
    criteria: list[Criterion]
    sources: list[Provenance]
    evaluated_count: Annotated[int, Field(ge=0, le=MAX_OPTIONS)]
    is_simulated: bool
    limitations: list[str]


class ScenarioList(Model):
    scenarios: list[Scenario]


class ScenarioDetail(Model):
    scenario: Scenario
    dataset: Dataset


def validate_dataset(dataset: Dataset, criteria: list[Criterion]) -> None:
    by_id = {criterion.id: criterion for criterion in criteria}
    for observation in dataset.observations:
        if not set(observation.metrics).issubset(by_id):
            raise ValueError("Measurements contain an unknown criterion")
        for criterion_id, value in observation.metrics.items():
            if value is None:
                continue
            if not isfinite(value):
                raise ValueError("Measurements must be finite numbers")
            if by_id[criterion_id].unit == "pence" and (type(value) is not int or value < 0):
                raise ValueError("Money measurements must use nonnegative integer pence")

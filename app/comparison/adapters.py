import asyncio
import math
from typing import Literal

import httpx
from pydantic import Field, ValidationError

from app.comparison.schemas import (
    Dataset,
    Number,
    Observation,
    Option,
    Provenance,
    Scenario,
    Slug,
    validate_dataset,
)
from app.schemas import Envelope, Model

SOURCE_TIMEOUT_SECONDS = 2.0


class InvalidDecisionSource(Exception):
    """The comparison feeds contain invalid or ambiguous data."""


class DecisionSourceUnavailable(Exception):
    """A required comparison feed failed or timed out."""


class OptionsFeed(Model):
    catalog_id: Slug
    source: Provenance
    items: list[Option] = Field(max_length=50)


class MetricRecord(Model):
    option: Slug
    status: Literal["available", "unavailable", "unknown"] | None = None
    values: dict[Slug, Number | None] = Field(default_factory=dict, max_length=10)


class MetricsFeed(Model):
    measurement_set: Slug
    provenance: Provenance
    records: list[MetricRecord] = Field(max_length=50)


async def _fetch(client: httpx.AsyncClient, path: str, timeout_seconds: float):
    try:
        response = await asyncio.wait_for(
            client.get(path, timeout=timeout_seconds), timeout_seconds
        )
    except (httpx.HTTPError, TimeoutError, OSError) as error:
        raise DecisionSourceUnavailable from error
    if not response.is_success:
        try:
            if response.json().get("error", {}).get("code") == "INVALID_SOURCE_DATA":
                raise InvalidDecisionSource
        except (ValueError, AttributeError, TypeError):
            pass
        raise DecisionSourceUnavailable
    try:
        envelope = Envelope[dict].model_validate(response.json())
    except (ValueError, ValidationError) as error:
        raise InvalidDecisionSource from error
    if envelope.error is not None:
        if envelope.error.code == "INVALID_SOURCE_DATA":
            raise InvalidDecisionSource
        raise DecisionSourceUnavailable
    return envelope.data


async def fetch_dataset(
    client: httpx.AsyncClient, scenario: Scenario, timeout_seconds: float = SOURCE_TIMEOUT_SECONDS
) -> Dataset:
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise ValueError("The source deadline must be positive and finite")
    tasks = [
        asyncio.create_task(
            _fetch(client, f"/mock/decisions/{scenario.id}/options", timeout_seconds)
        ),
        asyncio.create_task(
            _fetch(client, f"/mock/decisions/{scenario.id}/metrics", timeout_seconds)
        ),
    ]
    try:
        options_data, metric_data = await asyncio.gather(*tasks)
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    try:
        options = OptionsFeed.model_validate(options_data)
        metrics = MetricsFeed.model_validate(metric_data)
        if options.catalog_id != scenario.id or metrics.measurement_set != scenario.id:
            raise ValueError("Source scenario IDs do not match the selected scenario")
        dataset = Dataset(
            option_source=options.source,
            metric_source=metrics.provenance,
            options=options.items,
            observations=[
                Observation(
                    option_id=record.option,
                    available=True
                    if record.status == "available"
                    else False
                    if record.status == "unavailable"
                    else None,
                    metrics=record.values,
                )
                for record in metrics.records
            ],
        )
        validate_dataset(dataset, scenario.criteria)
    except (ValueError, ValidationError) as error:
        raise InvalidDecisionSource from error
    return dataset

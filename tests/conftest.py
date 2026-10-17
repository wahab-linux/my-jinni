import json

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import WEB_DIR


@pytest.fixture
def client():
    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.fixture
def valid_request():
    return json.loads((WEB_DIR / "fixtures" / "recommendation-request.json").read_text())

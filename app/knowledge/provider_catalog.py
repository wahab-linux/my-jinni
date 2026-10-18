from typing import Literal

ProviderId = Literal["openai", "deepseek", "gemini", "anthropic", "vertex"]

PROVIDER_CATALOG = (
    {"id": "openai", "label": "OpenAI", "default_model": "gpt-4.1-mini"},
    {"id": "deepseek", "label": "DeepSeek", "default_model": "deepseek-flash"},
    {"id": "gemini", "label": "Google Gemini", "default_model": "gemini-3.8-flash"},
    {"id": "anthropic", "label": "Anthropic Claude", "default_model": "claude-sonnet-4-6"},
    {"id": "vertex", "label": "Google Vertex AI (ADC)", "default_model": ""},
)
PROVIDER_DEFAULT_MODELS = {
    provider["id"]: provider["default_model"] for provider in PROVIDER_CATALOG
}

from app.agents.llm import auth_headers
from app.tests.conftest import make_settings

G = "https://generativelanguage.googleapis.com/v1beta/openai/"


def test_openai_key_uses_bearer():
    assert auth_headers(make_settings(openai_api_key="sk-test")) == {"Authorization": "Bearer sk-test"}


def test_google_aq_key_uses_x_goog_api_key_in_auto_mode():
    s = make_settings(openai_api_key="AQ.abc", openai_base_url=G)
    assert auth_headers(s) == {"x-goog-api-key": "AQ.abc"}


def test_google_aiza_key_stays_bearer_in_auto_mode():
    assert auth_headers(make_settings(openai_api_key="AIzaXYZ", openai_base_url=G)) == {"Authorization": "Bearer AIzaXYZ"}


def test_explicit_style_overrides_auto():
    assert auth_headers(make_settings(openai_api_key="AQ.abc", openai_base_url=G, llm_auth_style="bearer")) == {"Authorization": "Bearer AQ.abc"}
    assert auth_headers(make_settings(openai_api_key="k", llm_auth_style="x-goog-api-key")) == {"x-goog-api-key": "k"}

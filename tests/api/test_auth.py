from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_register_login_and_get_current_user() -> None:
    email = f"customer-{uuid4()}@example.com"
    register = client.post(
        "/auth/register",
        json={"name": "Test Customer", "email": email, "password": "CorrectHorseBattery1"},
    )

    assert register.status_code == 201
    registration_data = register.json()
    assert registration_data["user"]["role"] == "CUSTOMER"
    assert registration_data["user"]["email"] == email
    assert "password" not in registration_data["user"]

    token = registration_data["access_token"]
    current_user = client.get("/users/me", headers={"Authorization": f"Bearer {token}"})

    assert current_user.status_code == 200
    assert current_user.json()["email"] == email

    login = client.post(
        "/auth/login",
        json={"email": email, "password": "CorrectHorseBattery1"},
    )
    assert login.status_code == 200
    assert login.json()["token_type"] == "bearer"


def test_invalid_token_is_rejected() -> None:
    response = client.get("/users/me", headers={"Authorization": "Bearer invalid-token"})

    assert response.status_code == 401


def test_openapi_uses_http_bearer_for_protected_routes() -> None:
    schema = client.get("/openapi.json").json()

    assert schema["components"]["securitySchemes"]["HTTPBearer"] == {
        "type": "http",
        "scheme": "bearer",
    }
    assert schema["paths"]["/users/me"]["get"]["security"] == [{"HTTPBearer": []}]


def test_duplicate_registration_is_rejected() -> None:
    email = f"duplicate-{uuid4()}@example.com"
    payload = {"name": "Duplicate", "email": email, "password": "CorrectHorseBattery1"}

    assert client.post("/auth/register", json=payload).status_code == 201
    duplicate = client.post("/auth/register", json=payload)

    assert duplicate.status_code == 409

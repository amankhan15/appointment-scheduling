from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.db.database import SessionLocal
from app.db.models import ProviderProfile, User, UserRole
from app.main import app


client = TestClient(app)


def create_provider(name: str) -> tuple[int, str]:
    db = SessionLocal()
    email = f"{name.lower().replace(' ', '-')}-{uuid4()}@example.com"
    user = User(
        name=name,
        email=email,
        password_hash=hash_password("ProviderPassword1"),
        role=UserRole.PROVIDER,
    )
    db.add(user)
    db.flush()
    profile = ProviderProfile(user_id=user.id, name=name)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    token = create_access_token(user)
    provider_id = profile.id
    db.close()
    return provider_id, token


def test_provider_can_manage_schedule_and_availability_excludes_blocked_time() -> None:
    provider_id, token = create_provider("Schedule Provider")
    headers = {"Authorization": f"Bearer {token}"}

    schedule = client.post(
        f"/providers/{provider_id}/schedules",
        headers=headers,
        json={"day_of_week": 0, "start_time": "09:00:00", "end_time": "11:00:00"},
    )
    blocked = client.post(
        f"/providers/{provider_id}/blocked-periods",
        headers=headers,
        json={
            "start_datetime": "2031-01-06T09:30:00",
            "end_datetime": "2031-01-06T10:00:00",
            "reason": "Team meeting",
        },
    )
    availability = client.get(f"/providers/{provider_id}/availability?target_date=2031-01-06")

    assert schedule.status_code == 201
    assert blocked.status_code == 201
    assert availability.status_code == 200
    assert [slot["start_datetime"] for slot in availability.json()["slots"]] == [
        "2031-01-06T09:00:00",
        "2031-01-06T10:00:00",
        "2031-01-06T10:30:00",
    ]


def test_provider_cannot_modify_another_providers_schedule() -> None:
    first_provider_id, _ = create_provider("First Provider")
    second_provider_id, second_token = create_provider("Second Provider")
    headers = {"Authorization": f"Bearer {second_token}"}

    response = client.post(
        f"/providers/{first_provider_id}/schedules",
        headers=headers,
        json={"day_of_week": 1, "start_time": "09:00:00", "end_time": "10:00:00"},
    )

    assert second_provider_id != first_provider_id
    assert response.status_code == 403


def test_provider_listing_is_public() -> None:
    provider_id, _ = create_provider("Listed Provider")

    response = client.get("/providers")

    assert response.status_code == 200
    assert any(provider["id"] == provider_id for provider in response.json())

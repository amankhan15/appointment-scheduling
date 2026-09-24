from datetime import datetime
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.security import hash_password
from app.db.database import SessionLocal
from app.db.models import AuditRecord, ProviderProfile, User, UserRole
from app.main import app


client = TestClient(app)


def test_business_operations_create_audit_records() -> None:
    db = SessionLocal()
    provider_user = User(
        name="Audit Provider",
        email=f"audit-provider-{uuid4()}@example.com",
        password_hash=hash_password("ProviderPassword1"),
        role=UserRole.PROVIDER,
    )
    db.add(provider_user)
    db.flush()
    profile = ProviderProfile(user_id=provider_user.id, name="Audit Provider")
    db.add(profile)
    db.commit()
    db.refresh(profile)
    provider_id = profile.id
    db.close()

    email = f"audit-customer-{uuid4()}@example.com"
    registration = client.post(
        "/auth/register",
        json={"name": "Audit Customer", "email": email, "password": "CustomerPassword1"},
    )
    token = registration.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    appointment = client.post(
        "/appointments",
        headers=headers,
        json={
            "provider_id": provider_id,
            "start_datetime": datetime(2036, 1, 7, 10).isoformat(),
            "end_datetime": datetime(2036, 1, 7, 10, 30).isoformat(),
        },
    )
    appointment_id = appointment.json()["id"]
    client.post(f"/appointments/{appointment_id}/cancel", headers=headers)

    audit_session = SessionLocal()
    audit_actions = [
        record.action
        for record in audit_session.scalars(
            select(AuditRecord).where(AuditRecord.user_id == registration.json()["user"]["id"])
        )
    ]
    audit_session.close()

    assert appointment.status_code == 201
    assert {"USER_REGISTERED", "APPOINTMENT_BOOKED", "APPOINTMENT_CANCELLED"}.issubset(
        set(audit_actions)
    )

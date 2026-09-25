from datetime import datetime, time
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, Integer, String, Text, Time, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.database import Base


class UserRole(StrEnum):
    CUSTOMER = "CUSTOMER"
    PROVIDER = "PROVIDER"
    ADMIN = "ADMIN"


class AppointmentStatus(StrEnum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.CUSTOMER, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    provider_profile: Mapped["ProviderProfile | None"] = relationship(back_populates="user")
    customer_profile: Mapped["CustomerProfile | None"] = relationship(back_populates="user")


class CustomerProfile(Base):
    __tablename__ = "customer_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    gender: Mapped[str | None] = mapped_column(String(40))
    age: Mapped[int | None] = mapped_column(Integer)
    weight_kg: Mapped[float | None] = mapped_column()
    medical_notes: Mapped[str | None] = mapped_column(Text)

    user: Mapped[User] = relationship(back_populates="customer_profile")


class ProviderProfile(Base):
    __tablename__ = "provider_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    specialization: Mapped[str | None] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)

    user: Mapped[User] = relationship(back_populates="provider_profile")
    schedules: Mapped[list["ProviderSchedule"]] = relationship(back_populates="provider")
    blocked_periods: Mapped[list["BlockedPeriod"]] = relationship(back_populates="provider")
    appointments: Mapped[list["Appointment"]] = relationship(back_populates="provider")


class ProviderSchedule(Base):
    __tablename__ = "provider_schedules"
    __table_args__ = (
        UniqueConstraint("provider_id", "day_of_week", "start_time", name="uq_provider_schedule_start"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("provider_profiles.id"), index=True, nullable=False)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    provider: Mapped[ProviderProfile] = relationship(back_populates="schedules")


class BlockedPeriod(Base):
    __tablename__ = "blocked_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("provider_profiles.id"), index=True, nullable=False)
    start_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(255))

    provider: Mapped[ProviderProfile] = relationship(back_populates="blocked_periods")


class Appointment(TimestampMixin, Base):
    __tablename__ = "appointments"
    __table_args__ = (
        Index(
            "uq_active_provider_slot",
            "provider_id",
            "start_datetime",
            unique=True,
            sqlite_where=text("status <> 'CANCELLED'"),
            mssql_where=text("status <> 'CANCELLED'"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    provider_id: Mapped[int] = mapped_column(ForeignKey("provider_profiles.id"), index=True, nullable=False)
    start_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[AppointmentStatus] = mapped_column(
        Enum(AppointmentStatus), default=AppointmentStatus.CONFIRMED, nullable=False
    )
    cancellation_reason: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    concern: Mapped[str | None] = mapped_column(Text)
    payment_status: Mapped[str] = mapped_column(String(20), default="PAID", nullable=False)
    payment_amount: Mapped[float] = mapped_column(default=500.0, nullable=False)

    provider: Mapped[ProviderProfile] = relationship(back_populates="appointments")


class AuditRecord(Base):
    __tablename__ = "audit_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    appointment_id: Mapped[int | None] = mapped_column(ForeignKey("appointments.id"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    details: Mapped[str | None] = mapped_column(Text)

from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.db.models import AppointmentStatus


class AppointmentCreate(BaseModel):
    provider_id: int = Field(gt=0)
    start_datetime: datetime
    end_datetime: datetime
    notes: str | None = Field(default=None, max_length=1000)
    concern: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_range(self) -> "AppointmentCreate":
        if self.end_datetime <= self.start_datetime:
            raise ValueError("Appointment end must be after start")
        return self


class AppointmentReschedule(BaseModel):
    start_datetime: datetime
    end_datetime: datetime

    @model_validator(mode="after")
    def validate_range(self) -> "AppointmentReschedule":
        if self.end_datetime <= self.start_datetime:
            raise ValueError("Appointment end must be after start")
        return self


class AppointmentResponse(BaseModel):
    id: int
    customer_id: int
    provider_id: int
    start_datetime: datetime
    end_datetime: datetime
    status: AppointmentStatus
    notes: str | None
    concern: str | None
    payment_status: str
    payment_amount: float

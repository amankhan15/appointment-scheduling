from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ProviderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    specialization: str | None
    description: str | None


class ScheduleRequest(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    active: bool = True

    @model_validator(mode="after")
    def validate_range(self) -> "ScheduleRequest":
        if self.end_time <= self.start_time:
            raise ValueError("Schedule end time must be after start time")
        return self


class ScheduleResponse(ScheduleRequest):
    model_config = ConfigDict(from_attributes=True)

    id: int
    provider_id: int


class BlockedPeriodRequest(BaseModel):
    start_datetime: datetime
    end_datetime: datetime
    reason: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def validate_range(self) -> "BlockedPeriodRequest":
        if self.end_datetime <= self.start_datetime:
            raise ValueError("Blocked period end must be after start")
        return self


class BlockedPeriodResponse(BlockedPeriodRequest):
    model_config = ConfigDict(from_attributes=True)

    id: int
    provider_id: int


class SlotResponse(BaseModel):
    start_datetime: datetime
    end_datetime: datetime
    status: str = "AVAILABLE"


class AvailabilityResponse(BaseModel):
    provider_id: int
    date: date
    slots: list[SlotResponse]

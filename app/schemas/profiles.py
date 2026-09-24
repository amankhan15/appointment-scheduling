from pydantic import BaseModel, ConfigDict, Field


class CustomerProfileRequest(BaseModel):
    gender: str | None = Field(default=None, max_length=40)
    age: int | None = Field(default=None, ge=0, le=130)
    weight_kg: float | None = Field(default=None, ge=1, le=500)
    medical_notes: str | None = Field(default=None, max_length=2000)


class CustomerProfileResponse(CustomerProfileRequest):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    email: str

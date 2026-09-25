"""add appointment payment details

Revision ID: 7b1f5b9f1a2c
Revises: 40f931fff647
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "7b1f5b9f1a2c"
down_revision: Union[str, None] = "40f931fff647"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("appointments", sa.Column("payment_status", sa.String(length=20), nullable=True))
    op.add_column("appointments", sa.Column("payment_amount", sa.Float(), nullable=True))
    op.execute("UPDATE appointments SET payment_status = 'PAID' WHERE payment_status IS NULL")
    op.execute("UPDATE appointments SET payment_amount = 500.0 WHERE payment_amount IS NULL")
    with op.batch_alter_table("appointments") as batch_op:
        batch_op.alter_column("payment_status", nullable=False, server_default="PAID")
        batch_op.alter_column("payment_amount", nullable=False, server_default="500")


def downgrade() -> None:
    with op.batch_alter_table("appointments") as batch_op:
        batch_op.drop_column("payment_amount")
        batch_op.drop_column("payment_status")
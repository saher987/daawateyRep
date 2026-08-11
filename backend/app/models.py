"""SQLAlchemy models — the source of truth for the Postgres schema.

See BUSINESS_LOGIC.md for the reasoning behind each table and how they map
onto the original Base44 entities. Alembic migrations (run manually,
never on deploy — see /migrations) are derived from these models.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    ARRAY,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _token() -> str:
    return uuid.uuid4().hex


class Role(str, enum.Enum):
    admin = "admin"
    manager = "manager"
    venue_owner = "venue_owner"
    user = "user"


class EventStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class RsvpStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"


class EventRequestStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class User(Base):
    """App-level identity/role/profile, keyed by the Firebase uid.

    Firebase Auth proves *who* someone is (spec §2); this table is the only
    source of truth for *what they're allowed to do* (role) and their
    profile. A row is created lazily on first sign-in by
    app.auth.get_app_user — never from anything a client asserts directly.
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    firebase_uid: Mapped[str] = mapped_column(
        String, unique=True, nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    role: Mapped[Role] = mapped_column(
        SqlEnum(Role, name="role"), nullable=False, default=Role.user
    )
    first_name: Mapped[str | None] = mapped_column(String, nullable=True)
    last_name: Mapped[str | None] = mapped_column(String, nullable=True)
    town: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    preferred_language: Mapped[str] = mapped_column(String, nullable=False, default="ar")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    @property
    def profile_complete(self) -> bool:
        """Mirrors Base44's AppLayout check (spec §2, Flow G): first_name,
        last_name, town, and phone must all be filled in."""
        return bool(self.first_name and self.last_name and self.town and self.phone)


class PendingInvite(Base):
    """Replaces Base44's base44.users.inviteUser(email, role) (spec §1).

    An admin/manager creates one of these ahead of time; when that email
    signs in via Firebase for the first time, app.auth.get_app_user consumes
    it and assigns the role. There is no path for a user to grant themselves
    a role — only an existing admin/manager can create the invite.
    """

    __tablename__ = "pending_invites"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String, nullable=False, index=True)
    role: Mapped[Role] = mapped_column(SqlEnum(Role, name="role"), nullable=False)
    invited_by_uid: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Venue(Base):
    """spec §4: a hall. owner_emails[] drives the venue_owner role's
    visibility (spec §1, Flow E)."""

    __tablename__ = "venues"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    city: Mapped[str | None] = mapped_column(String, nullable=True)
    address: Mapped[str | None] = mapped_column(String, nullable=True)
    max_guests: Mapped[int | None] = mapped_column(Integer, nullable=True)
    map_url: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_emails: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    events: Mapped[list["Event"]] = relationship(back_populates="venue")


class Event(Base):
    """spec §4/Flow A: an event/invitation. owner_emails[]/manager_emails[]
    drive Flow D ("My Event") visibility."""

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str | None] = mapped_column(String, nullable=True)
    date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    venue_id: Mapped[str | None] = mapped_column(ForeignKey("venues.id"), nullable=True)
    couple_names: Mapped[str | None] = mapped_column(String, nullable=True)
    host: Mapped[str | None] = mapped_column(String, nullable=True)
    cover_image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    invitation_image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    greeting: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[EventStatus] = mapped_column(
        SqlEnum(EventStatus, name="event_status"), nullable=False, default=EventStatus.draft
    )
    owner_emails: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )
    manager_emails: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )
    created_by_uid: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    venue: Mapped[Venue | None] = relationship(back_populates="events")
    recipients: Mapped[list["InvitationRecipient"]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )


class InvitationRecipient(Base):
    """spec §4/Flow B: one invitee per event. personal_token is what
    /i/:token (getInvitationByToken) looks up."""

    __tablename__ = "invitation_recipients"
    __table_args__ = (
        UniqueConstraint("personal_token", name="uq_invitation_recipients_personal_token"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), nullable=False, index=True)
    event_creator_id: Mapped[str] = mapped_column(String, nullable=False)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String, nullable=True)
    last_name: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    personal_token: Mapped[str] = mapped_column(String, nullable=False, default=_token)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rsvp_status: Mapped[RsvpStatus] = mapped_column(
        SqlEnum(RsvpStatus, name="rsvp_status"), nullable=False, default=RsvpStatus.pending
    )
    rsvp_guests_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rsvp_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    event: Mapped[Event] = relationship(back_populates="recipients")


class PlannedWedding(Base):
    """spec §4/Flow E: a future-wedding lead, surfaced to venue owners
    filtered by city."""

    __tablename__ = "planned_weddings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    owner_name: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    city: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )


class EventRequest(Base):
    """spec §4/Flow C: a regular user's request for an event to be created
    on their behalf."""

    __tablename__ = "event_requests"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String, nullable=False)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    requester_name: Mapped[str | None] = mapped_column(String, nullable=True)
    requester_phone: Mapped[str | None] = mapped_column(String, nullable=True)
    requester_email: Mapped[str | None] = mapped_column(String, nullable=True)
    requester_uid: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[EventRequestStatus] = mapped_column(
        SqlEnum(EventRequestStatus, name="event_request_status"),
        nullable=False,
        default=EventRequestStatus.pending,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Notification(Base):
    """spec §4/Flow F: in-app notification targeted by email, polled every
    30s by AppLayout in Base44 — same polling model here."""

    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    type: Mapped[str | None] = mapped_column(String, nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_user_email: Mapped[str] = mapped_column(String, nullable=False, index=True)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )


class OtpVerification(Base):
    """spec §2/§4/Flow G: 6-digit OTP codes for guest phone verification,
    10-minute expiry, single-use."""

    __tablename__ = "otp_verifications"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    phone: Mapped[str] = mapped_column(String, nullable=False, index=True)
    code: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )

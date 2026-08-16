"""SQLAlchemy models — the source of truth for the Postgres schema.

Field names/enums are taken directly from the original Base44 app's entity
definitions (`base44/entities/*.jsonc` in the `zaffaf` source repo), not
guessed from the prose spec — see BUSINESS_LOGIC.md for the reasoning and
the few deliberate deviations (dropped legacy columns, the pending_invites
addition). Alembic migrations (run manually, never on deploy — see
/migrations) are derived from these.
"""

import enum
import uuid
from datetime import date as date_type
from datetime import datetime

from sqlalchemy import (
    ARRAY,
    Boolean,
    Date,
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


class EventType(str, enum.Enum):
    wedding = "wedding"
    engagement = "engagement"
    birthday = "birthday"
    graduation = "graduation"
    corporate = "corporate"
    other = "other"


class EventStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class RecipientStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    opened = "opened"
    responded = "responded"
    declined = "declined"


class RsvpStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"
    maybe = "maybe"


class EventRequestStatus(str, enum.Enum):
    pending = "pending"
    in_review = "in_review"
    approved = "approved"
    rejected = "rejected"


class NotificationType(str, enum.Enum):
    rsvp_received = "rsvp_received"
    invitation_opened = "invitation_opened"
    event_reminder = "event_reminder"
    event_update = "event_update"


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
    nickname: Mapped[str | None] = mapped_column(String, nullable=True)
    town: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    preferred_language: Mapped[str] = mapped_column(String, nullable=False, default="ar")
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String, nullable=True)
    # Admin ban/deactivate, not self-deletion — DELETE /api/account (a user
    # removing their own data) still hard-deletes the row. This is the
    # opposite case: an admin dealing with an unwanted account whose events/
    # invitations/RSVPs real guests still depend on, so the row has to stay.
    # get_app_user rejects any request from a uid mapped to an inactive row,
    # and the deactivate endpoint also disables + revokes the Firebase
    # account itself — see app/routers/users.py.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    @property
    def profile_complete(self) -> bool:
        """Mirrors the original AppLayout check (spec §2, Flow G): first_name,
        last_name, town, and phone must all be filled in."""
        return bool(self.first_name and self.last_name and self.town and self.phone)


class PendingInvite(Base):
    """Replaces Base44's base44.users.inviteUser(email, role) (spec §1) —
    this table has no Base44 equivalent, it's this app's own mechanism.

    An admin/manager creates one of these ahead of time; when that email
    signs in via Firebase for the first time, app.auth.get_app_user consumes
    it and assigns the role. There is no path for a user to grant themselves
    a role — only an existing admin/manager can create the invite.
    """

    __tablename__ = "pending_invites"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String, nullable=False, index=True)
    role: Mapped[Role] = mapped_column(SqlEnum(Role, name="role"), nullable=False)
    # Optional: lets an admin pre-fill the invited person's phone (Users.jsx
    # collects it in the invite form) even though — unlike Base44, which
    # provisions the account immediately — there's no User row to put it on
    # until they actually sign in via Firebase. Copied onto the new row by
    # get_app_user when the invite is consumed.
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    invited_by_uid: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Venue(Base):
    """A hall — matches the original Venue entity field-for-field."""

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
    """An event/invitation. Matches the original Event entity: bilingual
    fields (`_ar`/`_he` suffixes), inline venue fields *plus* an optional
    `venue_id` reference (a venue doesn't have to exist as its own row),
    wedding-specific `groom_name`/`bride_name` kept generic across all
    event_types exactly as the original did."""

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String, nullable=False)
    title_ar: Mapped[str | None] = mapped_column(String, nullable=True)
    event_type: Mapped[EventType] = mapped_column(
        SqlEnum(EventType, name="event_type"), nullable=False, default=EventType.wedding
    )
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    venue_name: Mapped[str] = mapped_column(String, nullable=False)
    venue_city: Mapped[str | None] = mapped_column(String, nullable=True)
    venue_address: Mapped[str | None] = mapped_column(String, nullable=True)
    venue_map_url: Mapped[str | None] = mapped_column(String, nullable=True)
    venue_id: Mapped[str | None] = mapped_column(ForeignKey("venues.id"), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_ar: Mapped[str | None] = mapped_column(Text, nullable=True)
    invitation_greeting: Mapped[str | None] = mapped_column(Text, nullable=True)
    invitation_greeting_he: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    invitation_image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    groom_name: Mapped[str | None] = mapped_column(String, nullable=True)
    bride_name: Mapped[str | None] = mapped_column(String, nullable=True)
    host_name: Mapped[str | None] = mapped_column(String, nullable=True)
    host_phone: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[EventStatus] = mapped_column(
        SqlEnum(EventStatus, name="event_status"), nullable=False, default=EventStatus.draft
    )
    max_guests: Mapped[int | None] = mapped_column(Integer, nullable=True)
    theme_color: Mapped[str] = mapped_column(String, nullable=False, default="#B8860B")
    # owner_email is the original's legacy singular field, kept only for
    # display/back-compat — owner_emails is what every permission check
    # actually reads.
    owner_email: Mapped[str | None] = mapped_column(String, nullable=True)
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
    """One invitee per event. Matches the original InvitationRecipient
    entity, minus the fields it marked "Legacy" (full_name, invitation_token,
    invitation_status, sent_date, opened_date) — each was already superseded
    by a newer parallel field there (external_full_name, personal_token,
    status, first_opened_at/last_opened_at); no reason to carry that
    migration debt into a fresh app. See BUSINESS_LOGIC.md."""

    __tablename__ = "invitation_recipients"
    __table_args__ = (
        UniqueConstraint("personal_token", name="uq_invitation_recipients_personal_token"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), nullable=False, index=True)
    event_creator_id: Mapped[str] = mapped_column(String, nullable=False)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    external_full_name: Mapped[str | None] = mapped_column(String, nullable=True)
    nickname: Mapped[str | None] = mapped_column(String, nullable=True)
    first_name: Mapped[str | None] = mapped_column(String, nullable=True)
    last_name: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    personal_token: Mapped[str] = mapped_column(String, nullable=False, default=_token)
    status: Mapped[RecipientStatus] = mapped_column(
        SqlEnum(RecipientStatus, name="recipient_status"),
        nullable=False,
        default=RecipientStatus.pending,
    )
    first_opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    open_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    phone_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    verified_phone: Mapped[str | None] = mapped_column(String, nullable=True)
    rsvp_status: Mapped[RsvpStatus] = mapped_column(
        SqlEnum(RsvpStatus, name="rsvp_status"), nullable=False, default=RsvpStatus.pending
    )
    rsvp_guests_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rsvp_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    rsvp_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    guests_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    group_label: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    event: Mapped[Event] = relationship(back_populates="recipients")


class PlannedWedding(Base):
    """A future-wedding lead, surfaced to venue owners filtered by city."""

    __tablename__ = "planned_weddings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    owner_name: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    city: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )


class EventRequest(Base):
    """A regular user's request for an event to be created on their behalf."""

    __tablename__ = "event_requests"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String, nullable=False)
    details: Mapped[str] = mapped_column(Text, nullable=False)
    requester_name: Mapped[str | None] = mapped_column(String, nullable=True)
    requester_phone: Mapped[str | None] = mapped_column(String, nullable=True)
    requester_email: Mapped[str | None] = mapped_column(String, nullable=True)
    # Not part of the original entity — a harmless addition that lets a
    # request be tied back to the Firebase account that filed it, when
    # there is one (guests can also file requests unauthenticated).
    requester_uid: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[EventRequestStatus] = mapped_column(
        SqlEnum(EventRequestStatus, name="event_request_status"),
        nullable=False,
        default=EventRequestStatus.pending,
    )
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Notification(Base):
    """In-app notification targeted by email, polled every 30s by AppLayout
    in the original — same polling model here."""

    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    # ondelete="SET NULL" on both: a notification is a standalone record of
    # something that happened ("you were invited to X") — it must survive
    # the event/recipient it references being deleted later (e.g. DELETE
    # /api/invitation-recipients/{id}), not block the delete with a FK
    # violation. is_read history is worth keeping even once the pointer
    # goes stale; the frontend already treats event_id/recipient_id as
    # optional.
    event_id: Mapped[str | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"), nullable=True
    )
    recipient_id: Mapped[str | None] = mapped_column(
        ForeignKey("invitation_recipients.id", ondelete="SET NULL"), nullable=True
    )
    type: Mapped[NotificationType] = mapped_column(
        SqlEnum(NotificationType, name="notification_type"), nullable=False
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    target_user_email: Mapped[str] = mapped_column(String, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )


class OtpVerification(Base):
    """6-digit OTP codes for guest phone verification, 10-minute expiry,
    single-use. See BUSINESS_LOGIC.md for a real gap this fixes: the
    original never actually sent this via SMS — it returned the code
    directly in the API response (`otp_preview`), which is a dead end for
    real security. This app sends it via the same Pulseem integration used
    for invitations instead."""

    __tablename__ = "otp_verifications"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    phone: Mapped[str] = mapped_column(String, nullable=False, index=True)
    otp_code: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Failed /otp/verify guesses against this specific code. A 6-digit code
    # is only 1,000,000 possibilities and this endpoint has no auth — with
    # no cap, an attacker who knows a phone number could script through all
    # of them well within the 10-minute expiry and verify without ever
    # receiving the SMS. Locking the code out (is_used=True) after
    # _MAX_VERIFY_ATTEMPTS wrong guesses, combined with the send-side
    # cooldown in otp.py, bounds the real attempt budget to a few dozen
    # guesses per 10-minute window instead of a million.
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )

"""Pydantic request/response models for the business-logic API.

Kept separate from app/models.py (the SQLAlchemy/DB layer) on purpose: a
client should never be able to set fields like `id`, `role`, or
`created_by_uid` just because they're columns on the DB model — schemas are
the explicit, reviewed list of what's actually accepted/returned.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import EventStatus, EventType, RecipientStatus, Role, RsvpStatus


class MeResponse(BaseModel):
    uid: str
    email: str | None
    role: Role
    first_name: str | None
    last_name: str | None
    town: str | None
    phone: str | None
    preferred_language: str
    profile_complete: bool


class ProfileUpdate(BaseModel):
    """Flow G step 3: base44.auth.updateMe's replacement. All four fields
    are required together since profile_complete needs all of them."""

    first_name: str
    last_name: str
    town: str
    phone: str
    preferred_language: str | None = None


class EventCreate(BaseModel):
    title: str
    title_ar: str | None = None
    event_type: EventType = EventType.wedding
    date: datetime
    venue_name: str
    venue_city: str | None = None
    venue_address: str | None = None
    venue_map_url: str | None = None
    venue_id: str | None = None
    description: str | None = None
    description_ar: str | None = None
    invitation_greeting: str | None = None
    invitation_greeting_he: str | None = None
    cover_image_url: str | None = None
    invitation_image_url: str | None = None
    groom_name: str | None = None
    bride_name: str | None = None
    host_name: str | None = None
    host_phone: str | None = None
    max_guests: int | None = None
    theme_color: str = "#B8860B"
    owner_email: str | None = None
    owner_emails: list[str] = []
    manager_emails: list[str] = []


class EventUpdate(BaseModel):
    title: str | None = None
    title_ar: str | None = None
    event_type: EventType | None = None
    date: datetime | None = None
    venue_name: str | None = None
    venue_city: str | None = None
    venue_address: str | None = None
    venue_map_url: str | None = None
    venue_id: str | None = None
    description: str | None = None
    description_ar: str | None = None
    invitation_greeting: str | None = None
    invitation_greeting_he: str | None = None
    cover_image_url: str | None = None
    invitation_image_url: str | None = None
    groom_name: str | None = None
    bride_name: str | None = None
    host_name: str | None = None
    host_phone: str | None = None
    max_guests: int | None = None
    theme_color: str | None = None
    owner_email: str | None = None
    owner_emails: list[str] | None = None
    manager_emails: list[str] | None = None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    title_ar: str | None
    event_type: EventType
    date: datetime
    venue_name: str
    venue_city: str | None
    venue_address: str | None
    venue_map_url: str | None
    venue_id: str | None
    description: str | None
    description_ar: str | None
    invitation_greeting: str | None
    invitation_greeting_he: str | None
    cover_image_url: str | None
    invitation_image_url: str | None
    groom_name: str | None
    bride_name: str | None
    host_name: str | None
    host_phone: str | None
    status: EventStatus
    max_guests: int | None
    theme_color: str
    owner_email: str | None
    owner_emails: list[str]
    manager_emails: list[str]
    created_at: datetime


class EventStats(BaseModel):
    total: int
    accepted: int
    declined: int
    maybe: int
    pending: int


class RecipientCreate(BaseModel):
    external_full_name: str | None = None
    nickname: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    email: str | None = None
    guests_count: int = 1
    group_label: str | None = None
    user_id: str | None = None


class RecipientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: str
    external_full_name: str | None
    nickname: str | None
    first_name: str | None
    last_name: str | None
    phone: str | None
    email: str | None
    personal_token: str
    status: RecipientStatus
    open_count: int
    phone_verified: bool
    rsvp_status: RsvpStatus
    rsvp_guests_count: int | None
    rsvp_message: str | None
    guests_count: int
    group_label: str | None
    notes: str | None


class PublicInvitationOut(BaseModel):
    """What the public /i/:token page (Flow B) gets — deliberately not the
    full Event/InvitationRecipient rows, so a guest link can never leak
    owner_emails, other recipients, etc. `recipient_id` IS included (unlike
    everything else) because the OTP-linking step needs it — the original
    app's verifyOtpAndLink takes a recipientId, not a token."""

    recipient_id: str
    event_title: str
    event_type: str
    event_date: datetime
    venue_name: str
    venue_city: str | None
    venue_address: str | None
    venue_map_url: str | None
    cover_image_url: str | None
    invitation_image_url: str | None
    invitation_greeting: str | None
    invitation_greeting_he: str | None
    theme_color: str
    display_name: str | None
    rsvp_status: RsvpStatus
    rsvp_guests_count: int | None


class RsvpSubmit(BaseModel):
    rsvp_status: RsvpStatus
    guests_count: int | None = None
    message: str | None = None

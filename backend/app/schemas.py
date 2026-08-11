"""Pydantic request/response models for the business-logic API.

Kept separate from app/models.py (the SQLAlchemy/DB layer) on purpose: a
client should never be able to set fields like `id`, `role`, or
`created_by_uid` just because they're columns on the DB model — schemas are
the explicit, reviewed list of what's actually accepted/returned.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import (
    EventRequestStatus,
    EventStatus,
    EventType,
    NotificationType,
    RecipientStatus,
    Role,
    RsvpStatus,
)


class MeResponse(BaseModel):
    id: str
    uid: str
    email: str | None
    role: Role
    first_name: str | None
    last_name: str | None
    nickname: str | None = None
    town: str | None
    phone: str | None
    preferred_language: str
    photo_url: str | None = None
    profile_complete: bool


class UserOut(BaseModel):
    """A minimal, non-sensitive projection — used for the owner/invitee
    lookup-by-phone-or-email pickers in CreateEvent/AddInviteeDialog.
    Deliberately excludes role, town, preferred_language: those aren't
    this endpoint's business, and role in particular shouldn't be
    discoverable by browsing user search results."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    first_name: str | None
    last_name: str | None
    nickname: str | None
    phone: str | None


class ProfileUpdate(BaseModel):
    """Flow G step 3: base44.auth.updateMe's replacement. Every field is
    optional and only what's sent gets updated (PATCH semantics) — the
    original's updateMe is called both with the full profile-completion
    form (all four name/contact fields at once) and with a single field on
    its own (e.g. the language switcher's `updateMe({preferred_language})`),
    so an all-or-nothing update would break the second case. The Profile
    page's own form is what actually requires all four together, as a
    client-side concern."""

    first_name: str | None = None
    last_name: str | None = None
    nickname: str | None = None
    town: str | None = None
    phone: str | None = None
    preferred_language: str | None = None
    photo_url: str | None = None


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


class MyInvitationRecipientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    personal_token: str
    rsvp_status: RsvpStatus
    rsvp_guests_count: int | None
    open_count: int
    first_opened_at: datetime | None


class MyInvitationEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    venue_name: str
    date: datetime
    cover_image_url: str | None


class MyInvitationOut(BaseModel):
    recipient: MyInvitationRecipientOut
    event: MyInvitationEventOut


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: NotificationType
    title: str
    message: str
    is_read: bool
    event_id: str | None
    recipient_id: str | None
    created_at: datetime


class EventRequestCreate(BaseModel):
    title: str
    details: str
    requester_name: str | None = None
    requester_phone: str | None = None
    requester_email: str | None = None


class EventRequestUpdate(BaseModel):
    status: EventRequestStatus | None = None
    admin_notes: str | None = None


class EventRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    details: str
    requester_name: str | None
    requester_phone: str | None
    requester_email: str | None
    status: EventRequestStatus
    admin_notes: str | None
    created_at: datetime


class VenueCreate(BaseModel):
    name: str
    city: str | None = None
    address: str | None = None
    max_guests: int | None = None
    map_url: str | None = None
    phone: str | None = None
    image_url: str | None = None
    notes: str | None = None
    owner_emails: list[str] = []


class VenueUpdate(BaseModel):
    name: str | None = None
    city: str | None = None
    address: str | None = None
    max_guests: int | None = None
    map_url: str | None = None
    phone: str | None = None
    image_url: str | None = None
    notes: str | None = None
    owner_emails: list[str] | None = None


class VenueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    city: str | None
    address: str | None
    max_guests: int | None
    map_url: str | None
    phone: str | None
    image_url: str | None
    notes: str | None
    owner_emails: list[str]

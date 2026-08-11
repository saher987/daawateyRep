"""Pydantic request/response models for the business-logic API.

Kept separate from app/models.py (the SQLAlchemy/DB layer) on purpose: a
client should never be able to set fields like `id`, `role`, or
`created_by_uid` just because they're columns on the DB model — schemas are
the explicit, reviewed list of what's actually accepted/returned.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import EventStatus, Role, RsvpStatus


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
    type: str | None = None
    date: datetime | None = None
    venue_id: str | None = None
    couple_names: str | None = None
    host: str | None = None
    cover_image_url: str | None = None
    invitation_image_url: str | None = None
    greeting: str | None = None
    owner_emails: list[str] = []
    manager_emails: list[str] = []


class EventUpdate(BaseModel):
    title: str | None = None
    type: str | None = None
    date: datetime | None = None
    venue_id: str | None = None
    couple_names: str | None = None
    host: str | None = None
    cover_image_url: str | None = None
    invitation_image_url: str | None = None
    greeting: str | None = None
    owner_emails: list[str] | None = None
    manager_emails: list[str] | None = None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    type: str | None
    date: datetime | None
    venue_id: str | None
    couple_names: str | None
    host: str | None
    cover_image_url: str | None
    invitation_image_url: str | None
    greeting: str | None
    status: EventStatus
    owner_emails: list[str]
    manager_emails: list[str]
    created_at: datetime


class EventStats(BaseModel):
    total: int
    accepted: int
    declined: int
    pending: int


class RecipientCreate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    email: str | None = None


class RecipientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: str
    first_name: str | None
    last_name: str | None
    phone: str | None
    email: str | None
    personal_token: str
    status: str
    rsvp_status: RsvpStatus
    rsvp_guests_count: int | None
    rsvp_message: str | None


class PublicInvitationOut(BaseModel):
    """What the public /i/:token page (Flow B) gets — deliberately not the
    full Event/InvitationRecipient rows, so a guest link can never leak
    owner_emails, other recipients, personal_token, etc."""

    event_title: str
    event_type: str | None
    event_date: datetime | None
    venue_name: str | None
    venue_address: str | None
    venue_map_url: str | None
    cover_image_url: str | None
    invitation_image_url: str | None
    greeting: str | None
    recipient_first_name: str | None
    rsvp_status: RsvpStatus
    rsvp_guests_count: int | None


class RsvpSubmit(BaseModel):
    rsvp_status: RsvpStatus
    rsvp_guests_count: int | None = None
    rsvp_message: str | None = None

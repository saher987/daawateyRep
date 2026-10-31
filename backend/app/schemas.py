"""Pydantic request/response models for the business-logic API.

Kept separate from app/models.py (the SQLAlchemy/DB layer) on purpose: a
client should never be able to set fields like `id`, `role`, or
`created_by_uid` just because they're columns on the DB model — schemas are
the explicit, reviewed list of what's actually accepted/returned.
"""

from datetime import date as date_type
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

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
    # Listed in at least one venue's owner_phones — drives the venue
    # calendar menu for owners whose role isn't venue_owner.
    owns_venue: bool = False
    # Submitted at least one business to the providers directory — drives
    # the "My business" menu item.
    owns_provider: bool = False


class UserOut(BaseModel):
    """GET /api/users is admin/manager-only either way, so this is the full
    picture (role included) — it backs both the owner/invitee lookup
    pickers in CreateEvent/AddInviteeDialog *and* the Users management
    page, which needs role/town/last_login to actually manage anyone."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    role: Role
    first_name: str | None
    last_name: str | None
    nickname: str | None
    phone: str | None
    town: str | None
    preferred_language: str
    last_login: datetime | None
    is_active: bool


class UserAdminUpdate(BaseModel):
    """PUT /api/users/{id} — admin-only (spec §1: only admin can "invite
    users with any role, change roles"; manager's own bullet list doesn't
    include user management at all)."""

    first_name: str | None = None
    last_name: str | None = None
    nickname: str | None = None
    phone: str | None = None
    town: str | None = None
    role: Role | None = None


class InviteCreate(BaseModel):
    """POST /api/invites — replaces base44.users.inviteUser(email, role).
    `phone` is optional and this app's own addition: Users.jsx's invite
    form collects it, but there's no User row to put it on yet (unlike
    Base44, which provisioned the account immediately) — it's held on the
    invite and copied over when the invitee actually signs in."""

    email: str
    role: Role
    phone: str | None = None


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


# Event.whatsapp_template's choices — see integrations/whatsapp.py.
WhatsappTemplate = Literal["default", "tahil_son", "tahil_daughter"]


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
    whatsapp_template: WhatsappTemplate = "default"
    thank_you_message: str | None = None
    cover_image_url: str | None = None
    invitation_image_url: str | None = None
    groom_name: str | None = None
    bride_name: str | None = None
    host_name: str | None = None
    host_phone: str | None = None
    max_guests: int | None = None
    theme_color: str = "#B8860B"
    owner_phones: list[str] = []
    manager_phones: list[str] = []


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
    whatsapp_template: WhatsappTemplate | None = None
    thank_you_message: str | None = None
    cover_image_url: str | None = None
    invitation_image_url: str | None = None
    groom_name: str | None = None
    bride_name: str | None = None
    host_name: str | None = None
    host_phone: str | None = None
    max_guests: int | None = None
    theme_color: str | None = None
    owner_phones: list[str] | None = None
    manager_phones: list[str] | None = None


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
    whatsapp_template: str = "default"
    thank_you_message: str | None
    reminder_message: str | None = None
    reminder_message_pending: str | None = None
    cover_image_url: str | None
    invitation_image_url: str | None
    groom_name: str | None
    bride_name: str | None
    host_name: str | None
    host_phone: str | None
    status: EventStatus
    max_guests: int | None
    theme_color: str
    owner_phones: list[str]
    manager_phones: list[str]
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
    name_suffix: str | None = None
    phone: str | None = None
    email: str | None = None
    # ge=1: AddInviteeDialog.jsx's guests_count input already enforces
    # min="1" client-side; this was the missing server-side half — a
    # negative or zero value here previously stored literally, corrupting
    # GuestStatsDashboard's totalGuests sum with no error anywhere.
    guests_count: int = Field(default=1, ge=1)
    group_label: str | None = None
    town: str | None = None
    user_id: str | None = None


class ReminderSend(BaseModel):
    """ReminderDialog.jsx: remind the event's guests whose RSVP is in
    `statuses` (declined guests are never reminded). Texts are templates
    with [placeholders], filled per guest server-side."""

    statuses: list[RsvpStatus] = Field(min_length=1)
    message_accepted: str = Field(min_length=1, max_length=1000)
    message_pending: str = Field(min_length=1, max_length=1000)
    # Off: guests reminded before for this event are skipped.
    include_already_reminded: bool = False
    # Guests with the app get a push; on: they get the SMS as well.
    sms_app_users: bool = False


class ReminderResult(BaseModel):
    reminded: int
    push: int
    sms: int
    failed: int
    skipped_already_reminded: int
    skipped_no_contact: int


class ThankYouSend(BaseModel):
    # Already filled in for this guest by the frontend (thankYouMessage.js).
    # Capped so one tap can't fire off a runaway multi-part SMS.
    message: str = Field(min_length=1, max_length=1000)


class RecipientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: str
    external_full_name: str | None
    nickname: str | None
    first_name: str | None
    last_name: str | None
    name_suffix: str | None = None
    phone: str | None
    email: str | None
    personal_token: str
    status: RecipientStatus
    open_count: int
    sent_count: int = 0
    reminder_count: int = 0
    last_reminded_at: datetime | None = None
    phone_verified: bool
    rsvp_status: RsvpStatus
    rsvp_guests_count: int | None
    rsvp_message: str | None
    rsvp_date: datetime | None
    guests_count: int
    group_label: str | None
    notes: str | None
    first_opened_at: datetime | None
    last_opened_at: datetime | None
    created_at: datetime
    # Bumped on every change to the row (opened, RSVP, resend, account
    # link). The admin guest list sorts by rsvp_date, not this.
    updated_at: datetime | None = None
    # The linked User account's town when there is one, else the town the
    # inviter typed in for an unregistered guest (invitation_recipients.town).
    # Resolved by events.py's _attach_towns via a batched lookup.
    town: str | None = None


class PublicInvitationOut(BaseModel):
    """What the public /i/:token page (Flow B) gets — deliberately not the
    full Event/InvitationRecipient rows, so a guest link can never leak
    owner_phones, other recipients, etc. `recipient_id` IS included (unlike
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
    description: str | None
    groom_name: str | None
    bride_name: str | None
    theme_color: str
    display_name: str | None
    rsvp_status: RsvpStatus
    rsvp_guests_count: int | None
    # The *invited* count (how many the host expects), distinct from
    # rsvp_guests_count (how many the guest actually confirmed) — the
    # frontend uses this as the RSVP form's default.
    invited_guests_count: int


class RsvpSubmit(BaseModel):
    rsvp_status: RsvpStatus
    # ge=1 only when provided — RsvpForm.jsx enforces min="1" client-side
    # the same way AddInviteeDialog.jsx does (see RecipientCreate). A
    # "declined" RSVP forces guests_count to 0 server-side regardless of
    # this value (see events.py), so this bound only ever matters for
    # accepted/maybe.
    guests_count: int | None = Field(default=None, ge=1)
    message: str | None = None


class MyInvitationRecipientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    # Missing here previously: every consumer of GET /api/my-invitations's
    # recipient objects (MyInvitations.jsx, Events.jsx) reads r.event_id to
    # cross-reference the matching event — silently always undefined
    # without this, breaking both pages (My Invitations showed nothing at
    # all; Events.jsx's regular-user "am I invited to this" check never
    # matched anything either), independent of and pre-dating this
    # session's phone-matching fixes to this same endpoint.
    event_id: str
    personal_token: str
    rsvp_status: RsvpStatus
    rsvp_guests_count: int | None
    # How many the host invited — the default head count for a one-tap
    # "attending" from the My Invitations list.
    guests_count: int
    # Sent back unchanged on a reply from the list, so changing the answer
    # there doesn't wipe a message the guest wrote on the invitation page.
    rsvp_message: str | None
    open_count: int
    first_opened_at: datetime | None
    created_at: datetime


class MyInvitationEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    event_type: EventType
    venue_name: str
    venue_city: str | None
    venue_address: str | None
    date: datetime
    cover_image_url: str | None
    groom_name: str | None
    bride_name: str | None
    host_name: str | None


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


class PushTokenRegister(BaseModel):
    token: str
    platform: str  # "web" | "android" | "ios"


class EventRequestCreate(BaseModel):
    title: str
    details: str
    requester_name: str | None = None
    # Mandatory per explicit product decision — a phone number is how
    # admins actually follow up on a request (see RequestEventDialog.jsx's
    # own "للتواصل المباشر" phone-number callout), and title/details being
    # allowed empty (see the edge-case suite) doesn't extend to this one.
    requester_phone: str = Field(min_length=1)
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
    owner_phones: list[str] = []


class VenueUpdate(BaseModel):
    name: str | None = None
    city: str | None = None
    address: str | None = None
    max_guests: int | None = None
    map_url: str | None = None
    phone: str | None = None
    image_url: str | None = None
    notes: str | None = None
    owner_phones: list[str] | None = None


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
    owner_phones: list[str]


class OtpSendRequest(BaseModel):
    phone: str


class OtpSendResponse(BaseModel):
    success: bool
    # Only ever populated when OTP_DEBUG_ECHO=true — see BUSINESS_LOGIC.md
    # for why the original's always-on otp_preview was a real security gap,
    # not something worth preserving as default behavior.
    otp_preview: str | None = None


class OtpVerifyRequest(BaseModel):
    phone: str
    otp_code: str
    # Optional: the invitation this verification should link to (the
    # invitation page's "see more info" flow has one on hand). The
    # phone-first Login/Register flow has no invitation context yet, so
    # this is None there — verify_otp still finds/creates the account and
    # opportunistically links any invitation already on file under this
    # phone number (see otp.py).
    recipient_id: str | None = None


class OtpVerifyResponse(BaseModel):
    success: bool
    is_new_user: bool
    # A Firebase custom token for the (found-or-created) account this
    # phone number belongs to. The client signs in with
    # signInWithCustomToken(auth, custom_token) — this is a full login,
    # not just a verification step.
    custom_token: str


class PlannedWeddingCreate(BaseModel):
    owner_name: str
    phone: str | None = None
    date: date_type
    city: str | None = None


class PlannedWeddingUpdate(BaseModel):
    owner_name: str | None = None
    phone: str | None = None
    date: date_type | None = None
    city: str | None = None


class PlannedWeddingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_name: str
    phone: str | None
    date: date_type
    city: str | None


class SupportMessageCreate(BaseModel):
    name: str
    email: str
    subject: str
    message: str


class ProviderCategoryIn(BaseModel):
    name_ar: str = Field(min_length=1)
    name_he: str = Field(min_length=1)
    icon: str = "sparkles"
    is_active: bool = True


class ProviderCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name_ar: str
    name_he: str
    icon: str
    sort_order: int
    is_active: bool
    # Published providers for the public list; every provider for the
    # management list.
    provider_count: int = 0


class ProviderCategoryOrder(BaseModel):
    ids: list[str]


class ProviderDetailsIn(BaseModel):
    """What a business owner can set on their own listing — everything but
    the publish/featured switches, which stay with admins/managers."""

    category_id: str
    name: str = Field(min_length=1)
    city: str | None = None
    address: str | None = None
    map_url: str | None = None
    phone: str | None = None
    whatsapp: str | None = None
    instagram_url: str | None = None
    facebook_url: str | None = None
    website_url: str | None = None
    description_ar: str | None = None
    description_he: str | None = None
    logo_url: str | None = None
    cover_url: str | None = None
    gallery_urls: list[str] = Field(default=[], max_length=10)
    price_from: int | None = Field(default=None, ge=0)


class ProviderIn(ProviderDetailsIn):
    is_published: bool = True
    is_featured: bool = False


class ProviderSubmitIn(ProviderDetailsIn):
    # A self-listed business has to be reachable — the whole point of the
    # directory is the call/WhatsApp buttons.
    phone: str = Field(min_length=1)


class ProviderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    category_id: str
    name: str
    city: str | None
    address: str | None
    map_url: str | None
    phone: str | None
    whatsapp: str | None
    instagram_url: str | None
    facebook_url: str | None
    website_url: str | None
    description_ar: str | None
    description_he: str | None
    logo_url: str | None
    cover_url: str | None
    gallery_urls: list[str]
    price_from: int | None
    is_published: bool
    is_featured: bool


class ProviderOwnerOut(ProviderOut):
    review_status: str
    review_note: str | None


class ProviderAdminOut(ProviderOwnerOut):
    # Contact-button taps in the last 30 days, by kind.
    clicks: dict[str, int] = {}
    # Who submitted it, for self-listed providers (all None otherwise).
    owner_user_id: str | None = None
    owner_name: str | None = None
    owner_phone: str | None = None


class ProviderReviewIn(BaseModel):
    action: Literal["approve", "reject"]
    note: str | None = None


class ProviderContactClickIn(BaseModel):
    kind: Literal["phone", "whatsapp", "instagram", "facebook", "website", "map"]


class AuditLogOut(BaseModel):
    """GET /api/audit-log — admin only."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    environment: str
    actor_user_id: str | None
    actor_role: str | None
    actor_name: str | None
    actor_phone: str | None
    actor_email: str | None
    action: str
    entity_type: str
    entity_id: str | None
    entity_label: str | None
    changes: dict | None
    meta: dict | None
    platform: str | None
    ip: str | None
    user_agent: str | None
    request_id: str | None

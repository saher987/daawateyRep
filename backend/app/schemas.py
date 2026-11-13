"""Pydantic request/response models for the business-logic API.

Kept separate from app/models.py (the SQLAlchemy/DB layer) on purpose: a
client should never be able to set fields like `id`, `role`, or
`created_by_uid` just because they're columns on the DB model — schemas are
the explicit, reviewed list of what's actually accepted/returned.
"""

from datetime import date as date_type
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import (
    EventRequestStatus,
    EventStatus,
    EventType,
    NotificationType,
    RecipientSide,
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
    whatsapp_invitation_text: str | None = None
    thank_you_message: str | None = None
    thank_you_event_name: str | None = None
    thank_you_event_owners: str | None = None
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
    seating_enabled: bool = False
    checkin_enabled: bool = False


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
    whatsapp_invitation_text: str | None = None
    thank_you_message: str | None = None
    thank_you_event_name: str | None = None
    thank_you_event_owners: str | None = None
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
    seating_enabled: bool | None = None
    checkin_enabled: bool | None = None
    seating_published: bool | None = None


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
    whatsapp_invitation_text: str | None = None
    thank_you_message: str | None
    thank_you_event_name: str | None = None
    thank_you_event_owners: str | None = None
    reminder_message: str | None = None
    reminder_message_pending: str | None = None
    reminder_details: str | None = None
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
    seating_enabled: bool = False
    checkin_enabled: bool = False
    seating_published: bool = False
    seating_locked_at: datetime | None = None
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
    side: RecipientSide | None = None
    group_label: str | None = None
    town: str | None = None
    user_id: str | None = None


class ReminderSend(BaseModel):
    """ReminderDialog.jsx: remind the event's guests whose RSVP is in
    `statuses` (declined guests are never reminded). Texts are templates
    with [placeholders], filled per guest server-side.

    `details` is the current format: the free-text middle of the message,
    sent over WhatsApp (template {{2}}) or SMS. Without it, the old
    full-text message_accepted / message_pending are sent by SMS as before
    — app builds from before this change still send those."""

    statuses: list[RsvpStatus] = Field(min_length=1)
    details: str | None = Field(default=None, min_length=1, max_length=500)
    message_accepted: str | None = Field(default=None, min_length=1, max_length=1000)
    message_pending: str | None = Field(default=None, min_length=1, max_length=1000)
    # Off: guests reminded before for this event are skipped.
    include_already_reminded: bool = False
    # Guests with the app get a push; on: they get the WhatsApp/SMS as well.
    sms_app_users: bool = False

    @model_validator(mode="after")
    def _has_text(self) -> "ReminderSend":
        if self.details is None and (self.message_accepted is None or self.message_pending is None):
            raise ValueError("details (or both message_accepted and message_pending) is required")
        return self


class ReminderResult(BaseModel):
    reminded: int
    push: int
    whatsapp: int = 0
    sms: int
    failed: int
    skipped_already_reminded: int
    skipped_no_contact: int


class ReminderBatchSend(BaseModel):
    """ReminderDialog.jsx: one batch of reminders, in the current
    `details` format (see ReminderSend). The dialog chooses the guests;
    kept small so a batch's request finishes well within the timeout."""

    recipient_ids: list[str] = Field(min_length=1, max_length=25)
    details: str = Field(min_length=1, max_length=500)
    sms_app_users: bool = False


class ReminderBatchItemResult(BaseModel):
    recipient_id: str
    success: bool
    push: bool = False
    whatsapp: bool = False
    sms: bool = False
    # Why the guest was skipped (not this event's, declined, no contact).
    error: str | None = None


class ReminderBatchResult(BaseModel):
    results: list[ReminderBatchItemResult]


class InvitationBatchSend(BaseModel):
    """InvitationsDialog.jsx (event page): (re)send the invitation to one
    batch of guests already on the list. Small, like the reminder batch."""

    recipient_ids: list[str] = Field(min_length=1, max_length=25)


class InvitationBatchItemResult(BaseModel):
    recipient_id: str
    success: bool
    # Why the guest wasn't sent (not this event's, no phone/email, delivery failed).
    error: str | None = None


class InvitationBatchResult(BaseModel):
    results: list[InvitationBatchItemResult]


class ImportGuest(RecipientCreate):
    # The import page's own row id, echoed back so it can mark the row.
    client_id: str = Field(min_length=1, max_length=64)


class ImportInvitationBatch(BaseModel):
    """ImportInvitees.jsx «إرسال الدعوات للجميع»: add and invite one batch
    of rows from the file."""

    guests: list[ImportGuest] = Field(min_length=1, max_length=25)


class ImportInvitationItemResult(BaseModel):
    client_id: str
    success: bool
    recipient_id: str | None = None
    # Already a guest of this event (counts as done on the import page).
    already_invited: bool = False
    error: str | None = None


class ImportInvitationBatchResult(BaseModel):
    results: list[ImportInvitationItemResult]


class ThankYouSend(BaseModel):
    # Already filled in for this guest by the frontend (thankYouMessage.js).
    # Capped so one tap can't fire off a runaway multi-part SMS.
    message: str = Field(min_length=1, max_length=1000)


class ThankYouBatchItem(BaseModel):
    recipient_id: str
    # Already filled in for this guest by the frontend, as in ThankYouSend.
    message: str = Field(min_length=1, max_length=1000)


class ThankYouBatchSend(BaseModel):
    """BulkThankYouDialog.jsx: one batch of thank-yous. Kept small so a
    batch's request finishes well within the server's timeout — each item
    is a WhatsApp/SMS provider call."""

    items: list[ThankYouBatchItem] = Field(min_length=1, max_length=25)


class ThankYouBatchItemResult(BaseModel):
    recipient_id: str
    success: bool
    channel: Literal["whatsapp", "sms"] | None = None
    # Why the guest was skipped (not this event's, not accepted, no phone).
    error: str | None = None


class ThankYouBatchResult(BaseModel):
    results: list[ThankYouBatchItemResult]


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
    thanked_at: datetime | None = None
    phone_verified: bool
    rsvp_status: RsvpStatus
    rsvp_guests_count: int | None
    rsvp_message: str | None
    rsvp_date: datetime | None
    guests_count: int
    side: RecipientSide | None = None
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
    event_id: str | None = None
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
    # The invitation page remembers the token per event, so the entrance
    # check-in page recognises this guest without typing a phone number.
    checkin_enabled: bool = False
    # Filled only when the event's seating is enabled and published.
    tables: list["GuestTable"] = []
    hall_plan: "HallPlanOut | None" = None


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
    link: str | None = None
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
    image_url: str | None = None
    is_active: bool = True


class ProviderCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name_ar: str
    name_he: str
    icon: str
    image_url: str | None = None
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
    # The "I agree to the Privacy Policy and Terms" box in
    # ProviderFormDialog, required when listing a new service. None from
    # app builds older than the box (accepted as before); False is refused.
    accepted_terms: bool | None = None


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


# --- Table arrangement (app/routers/seating.py) ---

TableShape = Literal["round", "rect", "square"]


class TableIn(BaseModel):
    number: str | None = Field(default=None, max_length=20)
    label: str | None = Field(default=None, max_length=60)
    zone: str | None = Field(default=None, max_length=60)
    shape: TableShape = "round"
    seats_round: int = Field(default=10, ge=1, le=30)
    seats_top: int = Field(default=0, ge=0, le=20)
    seats_bottom: int = Field(default=0, ge=0, le=20)
    seats_left: int = Field(default=0, ge=0, le=4)
    seats_right: int = Field(default=0, ge=0, le=4)
    # Omitted: the server puts the table in the first free spot.
    x: int | None = Field(default=None, ge=0, le=760)
    y: int | None = Field(default=None, ge=0, le=560)
    rotation: Literal[0, 90] = 0


class TablePatch(BaseModel):
    number: str | None = Field(default=None, min_length=1, max_length=20)
    label: str | None = Field(default=None, max_length=60)
    zone: str | None = Field(default=None, max_length=60)
    shape: TableShape | None = None
    seats_round: int | None = Field(default=None, ge=1, le=30)
    seats_top: int | None = Field(default=None, ge=0, le=20)
    seats_bottom: int | None = Field(default=None, ge=0, le=20)
    seats_left: int | None = Field(default=None, ge=0, le=4)
    seats_right: int | None = Field(default=None, ge=0, le=4)
    x: int | None = Field(default=None, ge=0, le=760)
    y: int | None = Field(default=None, ge=0, le=560)
    rotation: Literal[0, 90] | None = None
    sort_order: int | None = None


class TablesBulkCreate(BaseModel):
    """Quick setup: N identical tables placed in free spots on the plan."""

    count: int = Field(ge=1, le=60)
    shape: TableShape = "round"
    seats_round: int = Field(default=10, ge=1, le=30)
    seats_per_side: int = Field(default=5, ge=1, le=20)


class TableOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    number: str
    label: str | None
    zone: str | None
    shape: str
    seats_round: int
    seats_top: int
    seats_bottom: int
    seats_left: int
    seats_right: int
    x: int
    y: int
    rotation: int
    sort_order: int
    capacity: int
    seated: int = 0


class HallElementIn(BaseModel):
    kind: Literal["stage", "dance_floor", "buffet", "entrance", "photo", "other"]
    label: str | None = Field(default=None, max_length=60)
    x: int = Field(ge=0, le=760)
    y: int = Field(ge=0, le=560)
    w: int = Field(ge=20, le=760)
    h: int = Field(ge=10, le=560)


class HallElementPatch(BaseModel):
    label: str | None = Field(default=None, max_length=60)
    x: int | None = Field(default=None, ge=0, le=760)
    y: int | None = Field(default=None, ge=0, le=560)
    w: int | None = Field(default=None, ge=20, le=760)
    h: int | None = Field(default=None, ge=10, le=560)


class HallElementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    label: str | None
    x: int
    y: int
    w: int
    h: int


class Allocation(BaseModel):
    table_id: str
    seats: int = Field(ge=1, le=200)


class RecipientSeating(BaseModel):
    recipient_id: str
    # Empty list: the invitation goes back to "waiting for a table".
    allocations: list[Allocation]


class SeatingUpdate(BaseModel):
    """Replaces the allocations of every recipient listed (others untouched)."""

    recipients: list[RecipientSeating] = Field(min_length=1, max_length=500)


class AssignmentOut(BaseModel):
    recipient_id: str
    table_id: str
    seats: int


class SeatingState(BaseModel):
    seating_enabled: bool
    seating_published: bool
    seating_locked_at: datetime | None
    tables: list[TableOut]
    hall_elements: list[HallElementOut]
    assignments: list[AssignmentOut]


class AutoAssignResult(BaseModel):
    state: SeatingState
    placed: int
    split: int
    left: int


class SeatingSettings(BaseModel):
    seating_published: bool | None = None
    locked: bool | None = None


class GroupingUpdate(BaseModel):
    """Bulk set side and/or group. Only the fields actually sent change, so
    `{"side": null}` clears the side while leaving group_label alone."""

    recipient_ids: list[str] = Field(min_length=1, max_length=1000)
    side: RecipientSide | None = None
    group_label: str | None = Field(default=None, max_length=80)


class GroupNames(BaseModel):
    groom: list[str] = []
    bride: list[str] = []
    both: list[str] = []
    none: list[str] = []


class GuestTable(BaseModel):
    """A guest's own table, as the invitation page / check-in page shows it."""

    table_id: str
    number: str
    label: str | None = None
    zone: str | None = None
    seats: int


class PlanTableOut(BaseModel):
    id: str
    number: str
    shape: str
    x: int
    y: int
    rotation: int
    capacity: int


class HallPlanOut(BaseModel):
    """Positions only (no names), for the mini map on the guest's pages."""

    tables: list[PlanTableOut]
    hall_elements: list[HallElementOut]


# --- Entrance check-in (app/routers/checkin.py) ---


class CheckInEventOut(BaseModel):
    event_id: str
    event_title: str
    event_date: datetime
    venue_name: str
    theme_color: str
    open: bool
    opens_at: datetime
    closes_at: datetime
    seating: bool


class CheckInLookup(BaseModel):
    """Exactly one of personal_token (remembered on the guest's phone from
    the invitation link) or phone (typed in at the entrance)."""

    personal_token: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=30)

    @model_validator(mode="after")
    def _one_key(self) -> "CheckInLookup":
        if not (self.personal_token or self.phone):
            raise ValueError("personal_token or phone is required")
        return self


class CheckInSubmit(CheckInLookup):
    people_arrived: int = Field(ge=1, le=100)


class CheckInGuestOut(BaseModel):
    display_name: str | None
    expected_people: int
    tables: list[GuestTable]
    hall_plan: HallPlanOut | None = None
    checked_in: bool
    people_arrived: int | None = None


class ArrivalOut(BaseModel):
    recipient_id: str
    display_name: str | None
    people_arrived: int
    method: str
    checked_in_at: datetime | None


class TableArrivals(BaseModel):
    table_id: str
    number: str
    arrived: int
    capacity: int
    seated: int


class ArrivalsOut(BaseModel):
    checked_in_invitations: int
    people_arrived: int
    expected_people: int
    accepted_invitations: int
    per_table: list[TableArrivals]
    arrivals: list[ArrivalOut]


class ArrivalCounts(BaseModel):
    """What a venue owner sees: counts, never names."""

    event_id: str
    event_title: str
    checked_in_invitations: int
    people_arrived: int
    expected_people: int


class ManualArrival(BaseModel):
    recipient_id: str
    people_arrived: int = Field(ge=1, le=100)


PublicInvitationOut.model_rebuild()


class InviteeSuggestion(BaseModel):
    """Someone from an earlier guest list, offered by AddInviteeDialog's
    search (GET /api/invitee-suggestions) next to registered users."""

    nickname: str | None
    first_name: str | None
    last_name: str | None
    name_suffix: str | None
    phone: str
    town: str | None
    display_name: str


class ImportedInviteeIn(BaseModel):
    """A row of the import page (file or manual), before it is invited."""

    nickname: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    name_suffix: str | None = None
    phone: str | None = None
    town: str | None = None
    town_text: str | None = None
    side_text: str | None = None
    guests_count: int = Field(default=1, ge=1)
    side: RecipientSide | None = None
    group_label: str | None = None


class ImportedInviteeOut(ImportedInviteeIn):
    model_config = ConfigDict(from_attributes=True)

    id: str
    last_error: str | None = None
    created_at: datetime


class ImportedInviteeSave(BaseModel):
    guests: list[ImportedInviteeIn] = Field(min_length=1, max_length=2000)


class ImportedInviteeSaveResult(BaseModel):
    added: int
    # Same phone already saved for this event, earlier in the file, or
    # already a guest of the event.
    skipped: int
    rows: list[ImportedInviteeOut]


class ImportedInviteeSend(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=25)


class ImportedInviteeSendItem(BaseModel):
    id: str
    success: bool
    recipient_id: str | None = None
    already_invited: bool = False
    error: str | None = None


class ImportedInviteeSendResult(BaseModel):
    results: list[ImportedInviteeSendItem]

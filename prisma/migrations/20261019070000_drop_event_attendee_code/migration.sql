-- The optional shared attendee code was dropped before release (attendees sign in
-- with phone number + event only). Safe: the column held only optional hashes.
ALTER TABLE "Event" DROP COLUMN "attendeeCodeHash";

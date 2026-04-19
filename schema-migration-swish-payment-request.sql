-- Run once if `bookings` has no Swish MSS token column.

ALTER TABLE bookings
	ADD COLUMN swish_payment_request_uuid VARCHAR(64) NULL COMMENT 'Token/UUID from MSS 201 response' AFTER booking_price;

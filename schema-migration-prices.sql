-- Run if your database was created before price columns existed.

ALTER TABLE bookable_objects
	ADD COLUMN booking_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT 'Fixed price per slot (SEK)' AFTER name;

ALTER TABLE bookings
	ADD COLUMN booking_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT 'Snapshot of object price at booking (SEK)' AFTER label;

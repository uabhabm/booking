-- Run once if you already created `bookings` from an older schema.sql (adds guest columns, widens label).

ALTER TABLE bookings
	ADD COLUMN guest_name VARCHAR(255) NOT NULL DEFAULT '' AFTER hour,
	ADD COLUMN guest_email VARCHAR(255) NOT NULL DEFAULT '' AFTER guest_name,
	ADD COLUMN guest_phone VARCHAR(255) NOT NULL DEFAULT '' AFTER guest_email;

ALTER TABLE bookings MODIFY COLUMN label VARCHAR(500) NOT NULL DEFAULT '';

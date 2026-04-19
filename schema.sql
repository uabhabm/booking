-- Booking app schema (MySQL 8+). Apply with: mysql -u USER -p DATABASE < schema.sql

CREATE TABLE IF NOT EXISTS bookable_objects (
	id VARCHAR(191) NOT NULL PRIMARY KEY,
	name VARCHAR(255) NOT NULL,
	booking_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT 'Fixed price per slot (SEK)',
	total_to_pay_label VARCHAR(120) NOT NULL DEFAULT 'Totalt att betala:' COMMENT 'Label above price (sidebar)'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bookings (
	id VARCHAR(255) NOT NULL PRIMARY KEY,
	object_id VARCHAR(191) NOT NULL,
	`date` DATE NOT NULL,
	hour TINYINT UNSIGNED NOT NULL,
	guest_name VARCHAR(255) NOT NULL DEFAULT '',
	guest_email VARCHAR(255) NOT NULL DEFAULT '',
	guest_phone VARCHAR(255) NOT NULL DEFAULT '',
	label VARCHAR(500) NOT NULL DEFAULT '',
	booking_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT 'Snapshot of object price at booking (SEK)',
	swish_payment_request_uuid VARCHAR(64) NULL COMMENT 'Token/UUID from MSS 201 response (Location or body)',
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	KEY idx_bookings_object_date (object_id, `date`),
	CONSTRAINT fk_bookings_object FOREIGN KEY (object_id) REFERENCES bookable_objects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

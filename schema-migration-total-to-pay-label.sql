-- Run once if `bookable_objects` has no `total_to_pay_label` column (custom text before price, e.g. "Totalt att betala:").

ALTER TABLE bookable_objects
	ADD COLUMN total_to_pay_label VARCHAR(120) NOT NULL DEFAULT 'Totalt att betala:' AFTER booking_price;

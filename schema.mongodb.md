# MongoDB schema (booking app)

Use database name from `MONGODB_DB` (default `booking`). Create collections by inserting documents or via Compass.

## Connection string (Atlas)

**Required:** use the **`mongodb+srv://...`** URI from **Atlas → Cluster → Connect → Drivers → Node.js**.

Do **not** paste the old **`mongodb://...@ac-…-shard-00-00…:27017,shard-00-01…,shard-00-02…`** string (three hosts). That form often produces **`tlsv1 alert internal error`** / **`ReplicaSetNoPrimary`** on **Windows** with the Node driver. The SRV hostname is usually something like **`cluster0.xxxxx.mongodb.net`** — copy it **exactly** from Atlas; it is **not** the same as the `shard-00-xx` hostnames.

The app and `npm run db:seed-example` **reject** the deprecated three-host `mongodb://` Atlas URI so the misconfiguration is obvious.

Also: **Network Access** must allow your IP (or `0.0.0.0/0` for testing). The DB user password in the URI must be **URL-encoded** if it contains `@`, `#`, `%`, etc.

If **`mongodb+srv`** still fails: try another network (disable VPN / corporate proxy), update **Node.js LTS**, or see [Atlas connection troubleshooting](https://www.mongodb.com/docs/atlas/troubleshoot-connection/).

## `bookable_objects`

| Field | Type | Notes |
|-------|------|--------|
| `_id` | string | Stable id used in URLs (`/objectId`) |
| `name` | string | Display name |
| `booking_price` | number | SEK per slot |
| `total_to_pay_label` | string | e.g. `Totalt att betala:` |

## `bookings`

| Field | Type | Notes |
|-------|------|--------|
| `_id` | string | `{objectId}_{YYYY-MM-DD}_{hour}` |
| `object_id` | string | References `bookable_objects._id` |
| `date` | string | `YYYY-MM-DD` |
| `hour` | number | Start hour (8–16) |
| `guest_name`, `guest_email`, `guest_phone`, `label` | string | |
| `booking_price` | number | Snapshot at booking |
| `swish_payment_request_uuid` | string \| null | MSS token when paid |
| `created_at` | date | Optional |

Index: `{ object_id: 1, date: 1 }` (created automatically on first app connect).

## Insert a `bookable_objects` row

### 1. From this repo (uses `.env`)

1. In **`.env`**, set **`MONGODB_URI`** to your real Atlas connection string (replace `<db_password>` with the user’s password; URL-encode special characters in the password if needed).
2. Optional: **`MONGODB_DB`** (default `booking` — must match what the app uses).
3. From the project root:

```bash
npm run db:seed-example
```

This inserts `_id: "demo-studio"` with a sample name and price. To use another id:

```bash
node scripts/seed-bookable-object.mjs my-object-id
```

If that `_id` already exists, MongoDB returns a duplicate key error — change the id or remove the old document in Atlas.

### 2. MongoDB Shell (`mongosh`)

Copy the **`MONGODB_URI`** value from `.env` (full string in quotes if it has special characters), then:

```bash
mongosh "YOUR_MONGODB_URI_HERE"
```

```js
use booking   // or your MONGODB_DB name
db.bookable_objects.insertOne({
  _id: "demo-studio",
  name: "Demo studio",
  booking_price: 500,
  total_to_pay_label: "Totalt att betala:"
})
```

### 3. Atlas UI or Compass

Connect with the same URI from `.env`, pick database **`booking`** (or your `MONGODB_DB`), open collection **`bookable_objects`**, **Insert document**, and use the same fields as in the example above (`_id` is the object id used in URLs like `/demo-studio`).

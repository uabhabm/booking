# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.15.1 create --template minimal --types ts --add sveltekit-adapter="adapter:node" --no-download-check --install npm .
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

The app uses **MongoDB** (e.g. Atlas) for bookable objects and slot bookings. Without connection settings the UI shows a warning and cannot read/write data.

1. Copy the env template: `cp .env.example .env` (on Windows: `copy .env.example .env`).
2. In Atlas, allow your IP under **Network Access**, then set **`MONGODB_URI`** in **`.env`**. Prefer the **`mongodb+srv://...`** string from **Connect → Drivers** (not the multi-host `mongodb://` list), which avoids common TLS errors on Windows. Replace the password; URL-encode special characters in the password. Optional **`MONGODB_DB`** defaults to `booking`. Seed collections as in **`schema.mongodb.md`**.
3. Restart the dev server after changing `.env`.

**URLs:** `/` lists all bookable objects; the calendar for one object is at `/<objectId>` (the `bookable_objects.id` value). Optional query `?vecka=YYYY-MM-DD` picks the week (Monday of that week). Choosing a free slot opens `/<objectId>/book?date=YYYY-MM-DD&hour=H&vecka=…` to enter guest details before confirming. Old links using `/?objectId=…` are redirected to `/<objectId>`.

**Swish MSS + QR (paid slots only):** If `booking_price` > 0, the server first `POST`s (with **mTLS**) to the Swish CPC payment-requests API (`https://mss.cpc.getswish.net/swish-cpcapi/api/v1/paymentrequests/` by default) **without** `payerAlias` (required for the [Mcom→Qcom QR flow](https://developer.swish.nu/api/qr-codes/v1#mcom-to-qcom)). Client certificate defaults: `client_cert/Swish_Merchant_TestCertificate_1234679304.pem`, `.key`, and `Swish_TLS_RootCA.pem` (override with `SWISH_CLIENT_CERT_PATH`, `SWISH_CLIENT_KEY_PATH`, `SWISH_TLS_ROOT_CA_PATH`). Run the app with **cwd at the project root** in dev/build so those paths resolve, or set absolute paths in `.env`. After HTTP **201**, it reads `paymentRequestToken` (header `Payment-Request-Token` or payment JSON / `GET Location`—same mTLS agent), then `POST`s to the Swish [QR commerce endpoint](https://developer.swish.nu/api/qr-codes) (`https://mpc.getswish.net/qrg-swish/api/v1/commerce` by default, no client cert) to fetch the QR **image**. The booking is inserted only if both MSS **201** and a successful QR response are received. Default `payeeAlias` is `1234679304` (matches the merchant test cert); override with `SWISH_PAYEE_ALIAS`. Other env: `SWISH_MSS_PAYMENT_REQUESTS_URL`, `SWISH_CALLBACK_URL`, `SWISH_QR_COMMERCE_URL`. Token stored in `bookings.swish_payment_request_uuid`. Free bookings skip Swish. After a successful paid booking, the confirmation page shows a **Swish-style payment panel** (amount, step-by-step scan instructions, payee / reference / message, large QR) patterned on Swish’s public examples such as [Swish Merchant Demo Web](https://gitlab.com/getswish-grp/swish-merchant-demo-web) and [demo.swish.nu](https://demo.swish.nu/).

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

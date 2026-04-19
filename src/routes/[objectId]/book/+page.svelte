<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		bookingFieldDefaults,
		type BookingFormFieldKey
	} from '$lib/booking-defaults';
	import { formatLongSwedishBookingDate } from '$lib/calendar';
	import { buildSwishPaymentRequestDeepLink, isLikelyMobilePaymentPhone } from '$lib/swish-client';
	import { formatSek, totalPriceLabel } from '$lib/money';
	import type { ActionData, PageData } from './$types';

	type SwishCheckoutMeta = {
		payeeAlias: string;
		amountSek: number;
		payeePaymentReference: string;
		message: string;
		paymentRequestToken: string;
		callbackUrl: string;
	};

	let { data, form }: { data: PageData; form: ActionData } = $props();

	/** `unknown` until client detects handset vs desktop/tablet. */
	let payerDevice = $state<'unknown' | 'phone' | 'desk'>('unknown');

	function hourRange(h: number): string {
		const start = `${String(h).padStart(2, '0')}:00`;
		const end = `${String(h + 1).padStart(2, '0')}:00`;
		return `${start} – ${end}`;
	}

	function calendarHref(): string {
		const q = new URLSearchParams({ vecka: data.weekStart });
		return `/${encodeURIComponent(data.objectId)}?${q.toString()}`;
	}

	/** Display format similar to Swish merchant demo (readable payee number). */
	function formatSwishPayeeDigits(alias: string): string {
		const d = alias.replace(/\D/g, '');
		if (d.length !== 10) return alias;
		return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
	}

	function fieldLabel(key: BookingFormFieldKey): string {
		switch (key) {
			case 'guestName':
				return 'Namn';
			case 'guestEmail':
				return 'E-post';
			case 'guestPhone':
				return 'Telefon';
			case 'label':
				return 'Meddelande';
		}
	}

	const bookingSaved = $derived(
		Boolean(form && typeof form === 'object' && 'success' in form && form.success === true)
	);
	const usedDefaults = $derived.by(() => {
		if (!form || typeof form !== 'object' || !('success' in form) || !form.success) return [];
		if (!('usedDefaultsFor' in form) || !Array.isArray(form.usedDefaultsFor)) return [];
		return form.usedDefaultsFor as BookingFormFieldKey[];
	});
	const successQrDataUrl = $derived.by(() => {
		if (!form || typeof form !== 'object' || !('success' in form) || !form.success) return '';
		if (!('qrDataUrl' in form) || typeof form.qrDataUrl !== 'string') return '';
		return form.qrDataUrl;
	});
	const swishCheckout = $derived.by((): SwishCheckoutMeta | null => {
		if (!form || typeof form !== 'object' || !('success' in form) || !form.success) return null;
		if (!('swishCheckout' in form) || typeof form.swishCheckout !== 'object' || !form.swishCheckout)
			return null;
		const c = form.swishCheckout as Record<string, unknown>;
		if (
			typeof c.payeeAlias !== 'string' ||
			typeof c.amountSek !== 'number' ||
			typeof c.payeePaymentReference !== 'string' ||
			typeof c.message !== 'string' ||
			typeof c.paymentRequestToken !== 'string' ||
			typeof c.callbackUrl !== 'string'
		) {
			return null;
		}
		return {
			payeeAlias: c.payeeAlias,
			amountSek: c.amountSek,
			payeePaymentReference: c.payeePaymentReference,
			message: c.message,
			paymentRequestToken: c.paymentRequestToken,
			callbackUrl: c.callbackUrl
		};
	});

	const swishDeepLink = $derived.by(() => {
		if (!swishCheckout) return '';
		return buildSwishPaymentRequestDeepLink(
			swishCheckout.paymentRequestToken,
			swishCheckout.callbackUrl
		);
	});

	/** På mobil: öppna Swish direkt via `swish://paymentrequest` (deep link / automatisk växling till appen). */
	$effect(() => {
		if (typeof window === 'undefined') return;
		if (!successQrDataUrl || !swishCheckout?.paymentRequestToken || !swishCheckout?.callbackUrl) {
			payerDevice = 'unknown';
			return;
		}
		const phone = isLikelyMobilePaymentPhone();
		payerDevice = phone ? 'phone' : 'desk';
		if (!phone) return;
		const url = buildSwishPaymentRequestDeepLink(
			swishCheckout.paymentRequestToken,
			swishCheckout.callbackUrl
		);
		let cancelled = false;
		queueMicrotask(() => {
			if (cancelled) return;
			window.location.replace(url);
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<svelte:head>
	<title>Bokningsuppgifter — {data.objectName}</title>
</svelte:head>

<div class="page">
	<h1 class="page-title">Bokningsuppgifter</h1>

	{#if !data.configured}
		<p class="banner warn">
			MongoDB är inte konfigurerat — sätt <code>MONGODB_URI</code> i <code>.env</code> och skapa
			collections enligt <code>schema.mongodb.md</code>.
		</p>
		<p class="actions"><a class="btn secondary" href={calendarHref()}>Tillbaka till kalendern</a></p>
	{:else if data.unavailable}
		<p class="banner warn">{data.unavailable}</p>
		<p class="actions"><a class="btn secondary" href={calendarHref()}>Tillbaka till kalendern</a></p>
	{:else if bookingSaved}
		<div class="booking-layout">
			<aside class="info-banner" aria-label="Bokningsinformation">
				<h2 class="info-title">{data.objectName}</h2>
				<p class="info-subtitle">Demonstration</p>
				<p class="info-line info-date">{formatLongSwedishBookingDate(data.date)}</p>
				<p class="info-line info-time">{hourRange(data.hour)}</p>
				<div class="info-block">
					<p class="info-label">Utförare</p>
					<p class="info-value">{data.objectName}</p>
				</div>
				<div class="info-block">
					<p class="info-label">Avbokning</p>
					<p class="info-value">När som helst</p>
				</div>
				<div class="info-footer">
					<p class="info-label">{data.totalToPayLabel}</p>
					<p class="info-price">{totalPriceLabel(data.bookingPrice)}</p>
				</div>
			</aside>

			<div class="main-col">
				<div class="checkout" class:checkout-wide={Boolean(successQrDataUrl && swishCheckout)}>
					<p class="banner ok">Bokningen är sparad.</p>

					{#if successQrDataUrl && swishCheckout}
						<section class="swish-pay-card" aria-labelledby="swish-pay-heading">
							<header class="swish-pay-head">
								<span class="swish-mark" aria-hidden="true">Swish</span>
								<h2 id="swish-pay-heading" class="swish-pay-title">Betala med Swish</h2>
							</header>
							<div class="swish-pay-body">
								<p class="swish-amount" aria-live="polite">{formatSek(swishCheckout.amountSek)}</p>

								{#if payerDevice === 'phone'}
									<div class="swish-phone-pay">
										<p class="swish-phone-lead">
											Startar Swish på samma telefon via djup-länk. Om appen inte öppnas, tryck på
											knappen nedan.
										</p>
										<a class="btn swish-open-app" href={swishDeepLink}>Öppna Swish och betala</a>
										<details class="swish-phone-fallback">
											<summary>Visa QR-kod (t.ex. betala från annan telefon)</summary>
											<div class="qr-panel qr-panel-tight">
												<img
													src={successQrDataUrl}
													alt="QR-kod för Swish-betalning"
													class="qr-img-large"
													width="280"
													height="280"
												/>
											</div>
										</details>
									</div>
								{:else}
									<div class="swish-pay-row">
										<div class="swish-qr-col">
											<img
												src={successQrDataUrl}
												alt="QR-kod för Swish-betalning"
												class="qr-img-desktop"
												width="280"
												height="280"
											/>
										</div>
										<div class="swish-steps-col">
											<ol class="swish-steps-side" aria-label="Så betalar du med Swish">
												<li>Öppna din Swish-app på mobilen</li>
												<li>Scanna QR-koden</li>
												<li>Bekräfta – klart!</li>
											</ol>
										</div>
									</div>
								{/if}

								<dl class="swish-meta">
									<div class="swish-meta-row">
										<dt>Mottagare</dt>
										<dd>{formatSwishPayeeDigits(swishCheckout.payeeAlias)}</dd>
									</div>
									<div class="swish-meta-row">
										<dt>Betalreferens</dt>
										<dd><code class="swish-code">{swishCheckout.payeePaymentReference}</code></dd>
									</div>
									<div class="swish-meta-row">
										<dt>Meddelande</dt>
										<dd>{swishCheckout.message}</dd>
									</div>
								</dl>
								<p class="swish-demo-note">
									Officiella exempel och demo: <a
										href="https://gitlab.com/getswish-grp/swish-merchant-demo-web"
										target="_blank"
										rel="noopener noreferrer">Swish Merchant Demo Web</a
									>
									·
									<a href="https://demo.swish.nu/" target="_blank" rel="noopener noreferrer"
										>demo.swish.nu</a
									>
								</p>
							</div>
						</section>
					{:else if successQrDataUrl}
						<section class="co-section payment-open">
							<h2 class="co-section-title">
								<span>Betalning</span>
								<span class="co-chev" aria-hidden="true">▴</span>
							</h2>
							<p class="qr-caption">Skanna QR-koden med Swish-appen.</p>
							<div class="qr-frame">
								<img src={successQrDataUrl} alt="Swish QR-kod" class="qr-img" />
							</div>
						</section>
					{/if}

					{#if usedDefaults.length > 0}
						<p class="applied-intro">Du lämnade dessa fält tomma — följande värden sparades:</p>
						<ul class="applied-list">
							{#each usedDefaults as key (key)}
								<li>
									<span class="field-name">{fieldLabel(key)}:</span>
									<span class="applied-value">{bookingFieldDefaults[key]}</span>
								</li>
							{/each}
						</ul>
					{/if}

					<a class="btn cta-full" href={calendarHref()}>Till kalendern</a>
				</div>
			</div>
		</div>
	{:else}
		<div class="booking-layout">
			<aside class="info-banner" aria-label="Bokningsinformation">
				<h2 class="info-title">{data.objectName}</h2>
				<p class="info-subtitle">Demonstration</p>
				<p class="info-line info-date">{formatLongSwedishBookingDate(data.date)}</p>
				<p class="info-line info-time">{hourRange(data.hour)}</p>
				<div class="info-block">
					<p class="info-label">Utförare</p>
					<p class="info-value">{data.objectName}</p>
				</div>
				<div class="info-block">
					<p class="info-label">Avbokning</p>
					<p class="info-value">När som helst</p>
				</div>
				<div class="info-footer">
					<p class="info-label">{data.totalToPayLabel}</p>
					<p class="info-price">{totalPriceLabel(data.bookingPrice)}</p>
				</div>
			</aside>

			<div class="main-col">
				<div class="checkout">
					<p class="hint">
						Tomma fält fylls med standardvärden. Efter bokning visas standardvärden i rött för fält du
						lämnade tomma.
						{#if data.requiresSwish}
							Efter bokning visas en betalvy med QR-kod (som i Swish
							<a
								href="https://gitlab.com/getswish-grp/swish-merchant-demo-web"
								target="_blank"
								rel="noopener noreferrer">merchant demo</a
							>): MSS skapar betalningsförfrågan utan <code>payerAlias</code> enligt
							<a
								href="https://developer.swish.nu/api/qr-codes/v1#mcom-to-qcom"
								target="_blank"
								rel="noopener noreferrer">Mcom→Qcom</a
							>, sedan hämtas QR från commerce-API. Bokning sparas när kedjan lyckas.
						{/if}
					</p>

					<form method="POST" action="?/book" use:enhance class="checkout-form">
						<input type="hidden" name="date" value={data.date} />
						<input type="hidden" name="hour" value={data.hour} />

						<section class="co-section">
							<h2 class="co-section-title">
								<span>Dina uppgifter</span>
								<span class="co-chev" aria-hidden="true">▴</span>
							</h2>
							<div class="co-fields">
								<div class="field">
									<label for="guestName">Namn</label>
									<input
										id="guestName"
										name="guestName"
										type="text"
										autocomplete="name"
										class="inp"
									/>
								</div>

								<div class="field">
									<label for="guestEmail">E-post</label>
									<input
										id="guestEmail"
										name="guestEmail"
										type="email"
										autocomplete="email"
										inputmode="email"
										class="inp"
									/>
								</div>

								<div class="field">
									<label for="guestPhone">Telefon</label>
									<input
										id="guestPhone"
										name="guestPhone"
										type="tel"
										autocomplete="tel"
										class="inp"
									/>
								</div>

								<div class="field">
									<label for="label">Meddelande</label>
									<textarea id="label" name="label" rows="3" class="inp ta"></textarea>
								</div>
							</div>
						</section>

						{#if data.requiresSwish}
							<section class="co-section payment-open">
								<h2 class="co-section-title">
									<span>Betalning</span>
									<span class="co-chev" aria-hidden="true">▴</span>
								</h2>
								<p class="qr-caption">(QR-kod för kunden att skanna)</p>
								<div class="qr-placeholder">
									<p>QR-koden från Swish genereras när du slutför bokningen.</p>
								</div>
							</section>
						{/if}

						<div class="cta-row">
							<a class="btn ghost" href={calendarHref()}>Avbryt</a>
							<button type="submit" class="btn cta-full">
								{data.requiresSwish ? 'Boka och hämta Swish QR' : 'Boka'}
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	{/if}

	{#if form && typeof form === 'object' && 'message' in form && form.message}
		<p class="banner warn">{form.message}</p>
	{/if}
</div>

<style>
	.page {
		min-height: 100vh;
		padding: 1.5rem 1rem 3rem;
		font-family:
			system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			sans-serif;
		background: #f4f4f5;
		color: #1a1a1a;
	}
	.page-title {
		text-align: center;
		font-size: 0.95rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 0 0 1rem;
		color: #333;
	}
	.booking-layout {
		display: grid;
		grid-template-columns: minmax(240px, 300px) 1fr;
		gap: 1.5rem;
		align-items: start;
		max-width: 960px;
		margin: 0 auto;
	}
	@media (max-width: 720px) {
		.booking-layout {
			grid-template-columns: 1fr;
		}
	}
	.info-banner {
		background: #e8e8e8;
		padding: 1.5rem 1.25rem;
		border-radius: 12px;
		min-height: 100%;
		font-size: 0.95rem;
		line-height: 1.45;
		color: #1a1a1a;
	}
	.info-title {
		margin: 0 0 0.35rem;
		font-size: 1.35rem;
		font-weight: 700;
		line-height: 1.2;
	}
	.info-subtitle {
		margin: 0 0 1.25rem;
		font-weight: 700;
		font-size: 1rem;
	}
	.info-line {
		margin: 0 0 0.65rem;
	}
	.info-date,
	.info-time {
		font-size: 0.98rem;
	}
	.info-block {
		margin: 1.1rem 0 0;
	}
	.info-label {
		margin: 0 0 0.2rem;
		font-weight: 700;
		font-size: 0.9rem;
	}
	.info-value {
		margin: 0;
		font-size: 0.95rem;
	}
	.info-footer {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid rgb(0 0 0 / 12%);
	}
	.info-price {
		margin: 0.25rem 0 0;
		font-size: 0.95rem;
		font-weight: 600;
	}
	.main-col {
		min-width: 0;
	}
	.checkout {
		max-width: 520px;
		margin: 0;
		background: #fff;
		border: 1px solid #e6e6e8;
		border-radius: 16px;
		padding: 1.25rem 1.35rem 1.5rem;
		box-shadow: 0 2px 12px rgb(0 0 0 / 6%);
	}
	.checkout.checkout-wide {
		max-width: 720px;
	}
	.hint {
		margin: 0 0 1.25rem;
		font-size: 0.82rem;
		color: #555;
		line-height: 1.5;
	}
	.hint a {
		color: #0b6bcb;
		font-weight: 600;
	}
	.checkout-form {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.co-section {
		border: 1px solid #ececee;
		border-radius: 14px;
		padding: 0.85rem 1rem 1rem;
		margin-bottom: 0.75rem;
		background: #fafafa;
	}
	.co-section.payment-open {
		background: #fff;
	}
	.co-section-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: 0 0 0.75rem;
		font-size: 1rem;
		font-weight: 700;
		color: #111;
	}
	.co-chev {
		font-size: 0.7rem;
		color: #888;
	}
	.co-fields {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.field label {
		display: block;
		font-size: 0.78rem;
		font-weight: 600;
		margin-bottom: 0.3rem;
		color: #333;
	}
	.inp {
		width: 100%;
		box-sizing: border-box;
		padding: 0.55rem 0.7rem;
		font: inherit;
		border: 1px solid #ddd;
		border-radius: 10px;
		background: #fff;
	}
	.inp.ta {
		resize: vertical;
		min-height: 4rem;
	}
	.qr-caption {
		text-align: center;
		font-size: 0.88rem;
		font-weight: 600;
		color: #333;
		margin: 0 0 1rem;
	}
	.qr-placeholder {
		min-height: 200px;
		border: 2px dashed #d4d4d8;
		border-radius: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 1rem;
		color: #777;
		font-size: 0.88rem;
		background: #fafafa;
	}
	.qr-placeholder p {
		margin: 0;
		max-width: 16rem;
		line-height: 1.45;
	}
	.qr-frame {
		display: flex;
		justify-content: center;
		padding: 0.5rem 0 0.25rem;
	}
	.qr-img {
		width: min(100%, 320px);
		height: auto;
		border-radius: 12px;
	}
	/* Swish-style payment panel (aligned with getswish-grp merchant demo patterns) */
	.swish-pay-card {
		border-radius: 16px;
		overflow: hidden;
		border: 1px solid #c5e6c8;
		box-shadow: 0 4px 20px rgb(73 165 86 / 12%);
		margin-bottom: 1rem;
		background: #fff;
	}
	.swish-pay-head {
		background: linear-gradient(135deg, #4caf50 0%, #43a047 100%);
		color: #fff;
		padding: 0.9rem 1.1rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.swish-mark {
		font-weight: 800;
		font-size: 1.15rem;
		letter-spacing: 0.02em;
		text-shadow: 0 1px 0 rgb(0 0 0 / 15%);
	}
	.swish-pay-title {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		opacity: 0.95;
	}
	.swish-pay-body {
		padding: 1.15rem 1.2rem 1.25rem;
	}
	.swish-amount {
		margin: 0 0 0.5rem;
		font-size: 1.85rem;
		font-weight: 800;
		color: #1a1a1a;
		text-align: center;
		letter-spacing: -0.02em;
	}
	/* Desktop / tablet: QR left, steps right (Swish-style checkout) */
	.swish-pay-row {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: center;
		gap: 1.75rem 2.25rem;
		margin-bottom: 1rem;
	}
	@media (max-width: 600px) {
		.swish-pay-row {
			flex-direction: column;
			align-items: center;
		}
		.swish-steps-col {
			width: 100%;
			max-width: 22rem;
		}
	}
	.swish-qr-col {
		flex: 0 0 auto;
	}
	.qr-img-desktop {
		display: block;
		width: min(100%, 280px);
		height: auto;
		border-radius: 4px;
		box-shadow: 0 1px 4px rgb(0 0 0 / 12%);
	}
	.swish-steps-side {
		margin: 0;
		padding-left: 1.5rem;
		font-size: 1.05rem;
		line-height: 1.65;
		font-weight: 600;
		color: #111;
		max-width: 20rem;
	}
	.swish-steps-side li {
		margin-bottom: 0.85rem;
		padding-left: 0.25rem;
	}
	.swish-steps-side li:last-child {
		margin-bottom: 0;
	}
	/* Same handset: open Swish app */
	.swish-phone-pay {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.swish-phone-lead {
		margin: 0;
		text-align: center;
		font-size: 0.92rem;
		color: #444;
		line-height: 1.5;
	}
	.btn.swish-open-app {
		width: 100%;
		padding: 1rem 1.25rem;
		border-radius: 14px;
		font-size: 1.05rem;
		font-weight: 700;
		background: linear-gradient(135deg, #4caf50 0%, #43a047 100%);
		color: #fff;
		border: none;
		box-shadow: 0 3px 14px rgb(67 160 71 / 45%);
		text-decoration: none;
		text-align: center;
	}
	.btn.swish-open-app:hover {
		filter: brightness(1.05);
	}
	.swish-phone-fallback {
		margin-top: 0.25rem;
		font-size: 0.88rem;
		color: #444;
	}
	.swish-phone-fallback summary {
		cursor: pointer;
		font-weight: 600;
		color: #0b6bcb;
	}
	.qr-panel {
		display: flex;
		justify-content: center;
		padding: 0.75rem;
		margin-bottom: 1rem;
		background: #fafcfa;
		border-radius: 14px;
		border: 1px solid #e8f5e9;
	}
	.qr-panel-tight {
		margin-top: 0.75rem;
		margin-bottom: 0;
	}
	.qr-img-large {
		width: min(100%, 280px);
		height: auto;
		border-radius: 12px;
		box-shadow: 0 2px 12px rgb(0 0 0 / 8%);
	}
	.swish-meta {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		font-size: 0.85rem;
	}
	.swish-meta-row {
		display: grid;
		grid-template-columns: 7.5rem 1fr;
		gap: 0.5rem;
		align-items: baseline;
	}
	.swish-meta dt {
		margin: 0;
		font-weight: 700;
		color: #555;
	}
	.swish-meta dd {
		margin: 0;
		color: #1a1a1a;
		word-break: break-word;
	}
	.swish-code {
		font-size: 0.82rem;
		background: #f4f4f5;
		padding: 0.15rem 0.4rem;
		border-radius: 6px;
	}
	.swish-demo-note {
		margin: 1rem 0 0;
		padding-top: 0.85rem;
		border-top: 1px solid #eee;
		font-size: 0.78rem;
		color: #666;
		line-height: 1.5;
	}
	.swish-demo-note a {
		color: #0b6bcb;
		font-weight: 600;
	}
	.cta-row {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		margin-top: 1rem;
	}
	.btn {
		display: inline-block;
		padding: 0.55rem 1rem;
		border-radius: 10px;
		font: inherit;
		font-weight: 600;
		font-size: 0.9rem;
		text-decoration: none;
		cursor: pointer;
		border: 1px solid transparent;
		text-align: center;
		box-sizing: border-box;
	}
	.btn.ghost {
		background: transparent;
		color: #333;
		border-color: #ccc;
	}
	.btn.ghost:hover {
		background: #f5f5f5;
	}
	.btn.cta-full {
		width: 100%;
		padding: 0.85rem 1.25rem;
		border-radius: 14px;
		font-size: 1rem;
		background: #0b7dda;
		color: #fff;
		border: none;
		box-shadow: 0 2px 8px rgb(11 125 218 / 35%);
	}
	.btn.cta-full:hover {
		background: #0968b8;
	}
	.btn.secondary {
		background: #fff;
		color: #333;
		border-color: #ccc;
	}
	.actions {
		text-align: center;
		margin-top: 1rem;
	}
	.banner {
		max-width: 520px;
		margin: 0 auto 1rem;
		padding: 0.65rem 1rem;
		border-radius: 10px;
		font-size: 0.9rem;
	}
	.banner.ok {
		background: #e8f5e9;
		color: #1b4d1e;
		border: 1px solid #b8d4b9;
		margin: 0 0 1rem;
		max-width: none;
	}
	.warn {
		background: #fff3f3;
		color: #7a1e1e;
		border: 1px solid #f0c4c4;
	}
	.applied-intro {
		margin: 0 0 0.5rem;
		font-size: 0.9rem;
		color: #444;
	}
	.applied-list {
		margin: 0 0 1rem;
		padding-left: 1.2rem;
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.field-name {
		font-weight: 600;
	}
	.applied-value {
		color: #b22;
		font-weight: 500;
	}
	code {
		font-size: 0.88em;
	}
</style>

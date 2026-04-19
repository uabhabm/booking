<script lang="ts">
	import { goto } from '$app/navigation';
	import { formatDayHeader } from '$lib/calendar';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function veckaQuery(vecka: string): string {
		return `?${new URLSearchParams({ vecka }).toString()}`;
	}

	function objectHref(id: string, vecka: string): string {
		return `/${encodeURIComponent(id)}${veckaQuery(vecka)}`;
	}

	function bookHref(date: string, hour: number): string {
		const q = new URLSearchParams({ date, hour: String(hour), vecka: data.weekStart });
		return `/${encodeURIComponent(data.selectedObjectId ?? '')}/book?${q.toString()}`;
	}

	function hourLabel(h: number): string {
		return `${String(h).padStart(2, '0')}:00`;
	}

	function isBooked(date: string, hour: number): boolean {
		return data.bookedSlotKeys.includes(`${date}_${hour}`);
	}

	function onObjectChange(e: Event & { currentTarget: HTMLSelectElement }) {
		const id = e.currentTarget.value;
		goto(objectHref(id, data.weekStart));
	}
</script>

<svelte:head>
	<title>
		Boka tid — {data.objects.find((o) => o.id === data.selectedObjectId)?.name ?? ''}
	</title>
</svelte:head>

<div class="page">
	<h1 class="page-title">Välj tid</h1>

	{#if !data.configured}
		<p class="banner warn">
			MySQL är inte konfigurerat — sätt <code>DATABASE_URL</code> (eller <code>MYSQL_HOST</code>,
			<code>MYSQL_USER</code>, <code>MYSQL_DATABASE</code>) i <code>.env</code> och kör
			<code>schema.sql</code>.
		</p>
	{:else if data.error}
		<p class="banner warn">{data.error}</p>
	{/if}

	<div class="card">
		{#if data.configured && data.objects.length === 0}
			<p class="empty">
				Inga bokningsbara objekt hittades. Lägg rader i tabellen <code>bookable_objects</code> med
				kolumnerna <code>id</code>, <code>name</code>, valfritt <code>booking_price</code> (SEK per pass)
				och valfritt <code>total_to_pay_label</code> (text före priset, standard
				<code>Totalt att betala:</code>).
			</p>
		{:else}
			<div class="toolbar">
				<div class="object-form">
					<label class="sr-only" for="objectId">Utförare</label>
					<select id="objectId" value={data.selectedObjectId ?? ''} onchange={onObjectChange}>
						{#each data.objects as o (o.id)}
							<option value={o.id}>{o.name}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="week-nav">
				{#if data.selectedObjectId}
					<a class="nav-link" href={veckaQuery(data.prevMonday)}>‹ Föregående</a>
				{:else}
					<span class="nav-link muted">‹ Föregående</span>
				{/if}

				<form method="GET" class="week-form">
					<label class="week-select-wrap">
						<span class="week-select-label"
							>{data.isoWeekYear ? `Vecka ${data.isoWeek}` : 'Vecka'}</span
						>
						<select
							name="vecka"
							class="week-select"
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
						>
							{#each data.weekOptions as opt (opt.monday)}
								<option value={opt.monday} selected={opt.monday === data.weekStart}>{opt.label}</option>
							{/each}
						</select>
						<span class="chevron" aria-hidden="true">▾</span>
					</label>
				</form>

				{#if data.selectedObjectId}
					<a class="nav-link" href={veckaQuery(data.nextMonday)}>Nästa ›</a>
				{:else}
					<span class="nav-link muted">Nästa ›</span>
				{/if}
			</div>

			{#if data.selectedObjectId}
				<div class="grid">
					{#each data.dayDates as date (date)}
						{@const header = formatDayHeader(date)}
						<div class="col">
							<div class="col-head">
								<span class="dow">{header.weekday}</span>
								<span class="dm">{header.rest}</span>
							</div>
							<div class="slots">
								{#each data.hours as hour (hour)}
									{#if isBooked(date, hour)}
										<span class="slot pill taken">—</span>
									{:else}
										<a class="slot pill slot-link" href={bookHref(date, hour)}>{hourLabel(hour)}</a>
									{/if}
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>

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
		background: #f6f6f6;
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
	.card {
		max-width: 960px;
		margin: 0 auto;
		background: #fff;
		border: 1px solid #e2e2e2;
		border-radius: 10px;
		padding: 1rem 1rem 1.25rem;
		box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
	}
	.toolbar {
		margin-bottom: 0.75rem;
	}
	.object-form select {
		width: 100%;
		max-width: 280px;
		padding: 0.45rem 0.6rem;
		font: inherit;
		border: 1px solid #ddd;
		border-radius: 6px;
		background: #fff;
	}
	.week-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}
	.nav-link {
		font-size: 0.9rem;
		color: #333;
		text-decoration: none;
		white-space: nowrap;
	}
	.nav-link:hover {
		text-decoration: underline;
	}
	.nav-link.muted {
		opacity: 0.35;
		pointer-events: none;
	}
	.week-form {
		flex: 1;
		display: flex;
		justify-content: center;
		min-width: 8rem;
	}
	.week-select-wrap {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		cursor: pointer;
	}
	.week-select-label {
		font-weight: 600;
		font-size: 1rem;
	}
	.week-select {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
		width: 100%;
		height: 100%;
		font-size: 1rem;
	}
	.chevron {
		font-size: 0.65rem;
		color: #555;
		margin-top: 0.15rem;
		pointer-events: none;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0.35rem;
		border-top: 1px solid #eee;
		padding-top: 0.75rem;
	}
	@media (max-width: 720px) {
		.grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	@media (max-width: 480px) {
		.grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.col-head {
		text-align: center;
		font-size: 0.8rem;
		line-height: 1.25;
		margin-bottom: 0.5rem;
		color: #444;
	}
	.dow {
		display: block;
		font-weight: 600;
	}
	.dm {
		display: block;
		text-transform: lowercase;
		color: #666;
	}
	.slots {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		align-items: stretch;
	}
	a.slot-link {
		text-decoration: none;
		color: inherit;
		box-sizing: border-box;
		cursor: pointer;
		font: inherit;
	}
	a.slot-link:hover {
		background: #e4e4e4;
		border-color: #ccc;
	}
	.pill {
		display: block;
		width: 100%;
		text-align: center;
		padding: 0.4rem 0.25rem;
		border-radius: 6px;
		font-size: 0.8rem;
		border: 1px solid #e0e0e0;
		background: #f0f0f0;
		color: #222;
	}
	.slot.taken {
		background: #fafafa;
		color: #aaa;
		border-style: dashed;
		cursor: default;
	}
	.banner {
		max-width: 960px;
		margin: 0 auto 1rem;
		padding: 0.65rem 1rem;
		border-radius: 8px;
		font-size: 0.9rem;
	}
	.warn {
		background: #fff3f3;
		color: #7a1e1e;
		border: 1px solid #f0c4c4;
	}
	code {
		font-size: 0.88em;
	}
	.empty {
		margin: 0;
		font-size: 0.9rem;
		color: #444;
		line-height: 1.5;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>

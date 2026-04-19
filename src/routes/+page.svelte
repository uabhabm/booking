<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Boka tid</title>
</svelte:head>

<div class="page">
	<!-- Byt fil till `static/images/tjanster-hero.gif` och uppdatera src om du vill använda animerad GIF. -->
	<section class="hero" aria-label="Tjänster">
		<img
			class="hero-img"
			src="/images/tjanster-hero.png"
			alt="Tjänster: träningar för ekipage och grupper, kontakt vid intresse. Aktuellt utbud för hästar som visas nedan."
			width="1200"
			height="675"
			loading="eager"
			decoding="async"
		/>
	</section>

	<h1 class="page-title">Välj utförare</h1>

	{#if !data.configured}
		<p class="banner warn">
			MongoDB är inte konfigurerat — sätt <code>MONGODB_URI</code> i <code>.env</code> och skapa
			collections enligt <code>schema.mongodb.md</code>.
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
		{:else if data.objects.length > 0}
			<ul class="object-list">
				{#each data.objects as o (o.id)}
					<li>
						<a class="object-link" href={`/${encodeURIComponent(o.id)}`}>{o.name}</a>
					</li>
				{/each}
			</ul>
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
	.hero {
		max-width: 960px;
		margin: 0 auto 1.25rem;
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 4px 24px rgb(0 0 0 / 10%);
		line-height: 0;
	}
	.hero-img {
		display: block;
		width: 100%;
		height: auto;
		vertical-align: middle;
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
		max-width: 480px;
		margin: 0 auto;
		background: #fff;
		border: 1px solid #e2e2e2;
		border-radius: 10px;
		padding: 1rem 1.25rem 1.25rem;
		box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
	}
	.object-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.object-link {
		display: block;
		padding: 0.65rem 0.85rem;
		border-radius: 8px;
		border: 1px solid #e0e0e0;
		background: #f8f8f8;
		color: #1a1a1a;
		text-decoration: none;
		font-weight: 500;
	}
	.object-link:hover {
		background: #f0f0f0;
		border-color: #ccc;
	}
	.banner {
		max-width: 480px;
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
</style>

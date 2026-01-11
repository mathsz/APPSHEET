import { JSDOM } from 'jsdom'

// Deterministic in-memory exercise DB for tests. Avoid relying on the real
// public JSON (size/shape may change). This powers fetch('/Exercices.json').
function makeExercise({ id, name, discipline, primaryMuscle, equipment = ['bodyweight'], Category = '', plyometric = false, fatigue = '' }) {
	return {
		id,
		name,
		discipline,
		primary_muscle: primaryMuscle,
		muscles: [primaryMuscle],
		equipment,
		Category,
		plyometric,
		Fatigue: fatigue,
		value: { reps: 10, load: '' }
	}
}

const TEST_EXERCISES = (() => {
	const out = []
	// Strength: enough volume per muscle for 60min generation (15 exercises).
	const upper = ['chest', 'back', 'shoulders', 'biceps', 'triceps']
	let n = 1
	for (const m of upper) {
		for (let i = 0; i < 18; i++) {
			out.push(makeExercise({ id: `s_${m}_${i + 1}`, name: `Strength ${m} ${i + 1}`, discipline: 'strength', primaryMuscle: m, equipment: ['dumbbells', 'bodyweight'] }))
		}
		n++
	}
	// Lower body muscles.
	const lower = ['quads', 'hamstrings', 'glutes', 'calves']
	for (const m of lower) {
		for (let i = 0; i < 12; i++) {
			out.push(makeExercise({ id: `s_${m}_${i + 1}`, name: `Strength ${m} ${i + 1}`, discipline: 'strength', primaryMuscle: m, equipment: ['bodyweight'] }))
		}
	}
	// Core/abs.
	for (let i = 0; i < 10; i++) {
		out.push(makeExercise({ id: `s_core_${i + 1}`, name: `Strength core ${i + 1}`, discipline: 'strength', primaryMuscle: 'core', equipment: ['bodyweight'] }))
	}

	// HIIT: 10 uniques across buckets.
	const buckets = [
		{ Category: 'full body', m: 'core', plyo: false },
		{ Category: 'lower body', m: 'quads', plyo: true },
		{ Category: 'upper body', m: 'chest', plyo: false },
		{ Category: 'core', m: 'core', plyo: false },
		{ Category: 'cardio', m: 'legs', plyo: true }
	]
	for (let i = 0; i < 10; i++) {
		const b = buckets[i % buckets.length]
		out.push(makeExercise({ id: `h_${i + 1}`, name: `HIIT ${i + 1}`, discipline: 'hiit', primaryMuscle: b.m, equipment: ['bodyweight'], Category: b.Category, plyometric: b.plyo }))
	}

	// Pilates: core-heavy.
	for (let i = 0; i < 8; i++) {
		out.push(makeExercise({ id: `p_${i + 1}`, name: `Pilates ${i + 1}`, discipline: 'pilates', primaryMuscle: 'core', equipment: ['bodyweight'], Category: 'core' }))
	}
	return out
})()

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost' })
if (typeof globalThis.window === 'undefined') globalThis.window = dom.window
if (typeof globalThis.document === 'undefined') globalThis.document = dom.window.document
if (typeof globalThis.localStorage === 'undefined') globalThis.localStorage = dom.window.localStorage

// Always intercept Exercices.json fetches in tests.
// Node 18+ already defines fetch, so only stubbing when undefined is not sufficient.
const __originalFetch = (typeof globalThis.fetch === 'function') ? globalThis.fetch.bind(globalThis) : null
globalThis.fetch = async (input, init) => {
	const url = (input && typeof input === 'object' && 'url' in input) ? String(input.url) : String(input || '')
	if (url.includes('Exercices.json')) {
		return {
			ok: true,
			status: 200,
			json: async () => TEST_EXERCISES
		}
	}

	// Keep tests deterministic: do not hit the network.
	return { ok: false, status: 404, json: async () => null }
}

// Minimal CacheStorage shim for JSDOM tests (some code paths fall back to `caches.match`).
if (typeof globalThis.caches === 'undefined') {
	globalThis.caches = {
		match: async () => null,
		keys: async () => [],
		open: async () => ({ match: async () => null })
	}
}

// Provide a minimal localStorage shim for test environments that lack it.
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
	globalThis.localStorage = {
		store: {},
		getItem(key) { return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null },
		setItem(key, value) { this.store[String(key)] = String(value) },
		removeItem(key) { delete this.store[String(key)] },
		clear() { this.store = {} },
		key(i) { return Object.keys(this.store)[i] || null },
		get length() { return Object.keys(this.store).length }
	}
}
if (typeof global.localStorage === 'undefined') global.localStorage = globalThis.localStorage

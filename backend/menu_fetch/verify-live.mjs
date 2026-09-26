import { randomUUID } from 'node:crypto';

const [mode, restaurant, menuUrl, diet = 'vegetarian', dishName] = process.argv.slice(2);
const api = process.env.API_BASE_URL || 'http://127.0.0.1:8000';
const menuApi = process.env.MENU_FETCH_URL || 'http://127.0.0.1:8101';

async function post(base, path, body, token) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${data.error?.code ?? ''}`.trim());
  return data;
}

try {
  if (!restaurant || !menuUrl || !['jev', 'pipeline'].includes(mode)) throw new Error('Usage: node verify-live.mjs <jev|pipeline> <restaurant> <menu-url> [diet] [dish-name-for-jev]');
  const menu = await post(menuApi, '/fetch-menu', { restaurant, menu_url: menuUrl });
  if (!menu.dishes.length || !menu.evidence.length) throw new Error('NO_MENU_EVIDENCE');

  if (mode === 'jev') {
    if (!dishName) throw new Error('Provide the exact dish name for the Jev probe.');
    if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY is missing.');
    const dish = menu.dishes.find(item => item.name === dishName);
    if (!dish) throw new Error('Dish name is absent from fetched menu.');
    const quote = menu.evidence.find(item => dish.evidence_ids.includes(item.id))?.quote;
    if (!quote) throw new Error('Dish source quote is absent.');
    const started = performance.now();
    const response = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}` },
      body: JSON.stringify({
        state: `Restaurant: ${restaurant}\nDiet: ${diet}\nDish: ${dish.name}\nMenu source: ${menuUrl}\nMenu excerpt: ${quote}`,
        model: 'jev-latest',
        questions: { diet_fit: { type: 'choice', instructions: 'Based only on the supplied menu excerpt, does this dish fit the stated diet? Choose unclear when the evidence is insufficient.', criteria: { yes: 'The menu evidence supports that it fits the diet.', no: 'The menu evidence shows that it does not fit the diet.', unclear: 'The menu evidence is insufficient or conflicting.' } } },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Jev: HTTP ${response.status}`);
    const answer = data.answers?.diet_fit;
    if (answer?.type !== 'choice' || !['yes', 'no', 'unclear'].includes(answer.choice) || typeof answer.confidence !== 'number') throw new Error('Jev response did not match Choice schema.');
    console.log(JSON.stringify({ menu_dishes: menu.dishes.length, source_url: menuUrl, dish: dish.name, model: data.model, type: answer.type, choice: answer.choice, confidence: answer.confidence, probabilities: answer.probabilities, usage: data.usage, jev_ms: Math.round(performance.now() - started) }));
  } else {
    const trip = await post(api, '/trips', { preferences: { diet } });
    await post(api, `/trips/${trip.trip_id}/messages`, { client_message_id: randomUUID(), text: `Save ${restaurant} and research ${diet} options.`, source_url: menuUrl }, trip.access_token);
    const read = await fetch(`${api}/trips/${trip.trip_id}`, { headers: { Authorization: `Bearer ${trip.access_token}` } });
    const tripState = await read.json();
    if (!read.ok || !tripState.saves?.some(item => item.source_url === menuUrl)) throw new Error('Trip did not persist the source URL.');
    const score = await post(api, '/score', { restaurant, menu_url: menuUrl, diet }, trip.access_token);
    if (typeof score.score !== 'number' || !Array.isArray(score.dishes)) throw new Error('Score response did not match the contract.');
    console.log(JSON.stringify({ source_url: menuUrl, menu_dishes: menu.dishes.length, score: score.score, scored_dishes: score.dishes.length, status: tripState.status, saves: tripState.saves.length, candidates: tripState.candidates?.length, decisions: tripState.decisions?.length, score_timing_ms: score.timing_ms }));
  }
} catch (error) {
  console.error(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
}

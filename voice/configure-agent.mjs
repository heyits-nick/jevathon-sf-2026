const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY is required');
const name = 'Jevathon Travel Companion';
const updateExisting = process.argv.includes('--update-existing');
const base = 'https://api.elevenlabs.io/v1/convai/agents';
async function call(path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  if (!response.ok) throw new Error(`ElevenLabs ${method} failed (${response.status}); check agent permissions and configuration`);
  return response.json();
}
let id = process.env.ELEVENLABS_AGENT_ID;
let agentName = name;
if (updateExisting && !id) throw new Error('--update-existing requires ELEVENLABS_AGENT_ID');
if (id) {
  const existing = await call(`/${encodeURIComponent(id)}`);
  if (existing.name !== name && !updateExisting) throw new Error('Agent ID belongs to a different named agent; use --update-existing for this explicitly supplied ID');
  agentName = existing.name;
} else {
  const matches = [];
  let cursor;
  do {
    const list = await call(`?page_size=100&search=${encodeURIComponent(name)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    matches.push(...(list.agents || []).filter(agent => agent.name === name));
    cursor = list.has_more ? list.next_cursor : undefined;
    if (list.has_more && !cursor) throw new Error('Agent list pagination failed');
  } while (cursor);
  if (matches.length > 1) throw new Error('Multiple agents have this name; set ELEVENLABS_AGENT_ID explicitly');
  id = matches[0]?.agent_id;
}
const stringParam = description => ({ type: 'string', description });
const tools = [
  { type: 'client', name: 'getTripContext', description: 'Read only authorized factual trip status and preferences; not for choosing a recommendation.', expects_response: true,
    parameters: { type: 'object', properties: { trip_id: stringParam('Current authenticated trip ID; never a spoken or guessed ID') }, required: ['trip_id'] } },
  { type: 'client', name: 'handleTripMessage', description: 'Forward every substantive user request to the Jev backend and wait for its approved reply.', expects_response: true,
    parameters: { type: 'object', properties: {
      trip_id: stringParam('Current authenticated trip ID; never a spoken or guessed ID'),
      client_message_id: stringParam('Fresh unique ID for this user utterance; reuse the same ID on retry'),
      text: stringParam('The user request as spoken, without adding a decision or recommendation')
    }, required: ['trip_id', 'client_message_id', 'text'] } }
];
const prompt = `# Role\nYou are Jevathon Travel Companion, a voice interface to authenticated trip {{trip_id}}.\n\n# Required workflow\nFor every substantive user utterance, always call handleTripMessage with trip_id={{trip_id}}, a fresh unique message ID, and the user's words. Wait for the result. Speak the returned reply faithfully and briefly. For an error, say the service is unavailable and suggest typing or retrying; do not answer from memory. getTripContext may read factual trip status, but any question requiring intent, recall, interpretation, planning, preference change, dietary judgment, evidence escalation, or recommendation must go through handleTripMessage.\n\n# Guardrails\nDo not choose restaurants, infer diet safety, decide what saved post the user meant, promise a reservation or call, invent sources, or use independent memory or web search. A spoken trip ID never authorizes access. Do not repeat an old recommendation as a fresh answer. You may greet and transcribe speech; all substantive answers come from the backend reply.`;
const config = { name: agentName, conversation_config: { agent: { first_message: 'Hi, I can help with your saved trip. What would you like to know?', prompt: { prompt, tools, built_in_tools: {} } } }, platform_settings: { auth: { enable_auth: true } } };
const result = id ? await call(`/${encodeURIComponent(id)}`, 'PATCH', config) : await call('/create', 'POST', config);
console.log(result.agent_id || id);

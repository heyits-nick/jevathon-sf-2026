// Mount in the frontend with the same trip ID and bearer token used for web messages.
export function mountVoice(container, { tripId, accessToken, voiceBase = '', onTrip = () => {} }) {
  if (!container || !/^[A-Za-z0-9_-]{1,128}$/.test(tripId || '') || !accessToken) throw new Error('An authorized trip is required');
  const base = `${voiceBase.replace(/\/$/, '')}/trips/${encodeURIComponent(tripId)}`;
  const start = document.createElement('button'); start.textContent = 'Start voice';
  const stop = document.createElement('button'); stop.textContent = 'Stop voice'; stop.disabled = true;
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = 'Voice is ready.';
  const transcript = document.createElement('div'); transcript.setAttribute('aria-live', 'polite');
  const form = document.createElement('form');
  const input = document.createElement('input'); input.placeholder = 'Type a message if voice is unavailable'; input.required = true;
  const submit = document.createElement('button'); submit.textContent = 'Send';
  form.append(input, submit); container.replaceChildren(start, stop, status, transcript, form);
  let conversation;
  const request = async (action, data) => {
    const response = await fetch(`${base}/${action}`, {
      method: action === 'context' ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message || 'Trip service unavailable');
    return result;
  };
  const addLine = (speaker, message) => {
    const p = document.createElement('p'); p.textContent = `${speaker}: ${message}`; transcript.append(p);
  };
  const handleMessage = async ({ trip_id, client_message_id, text }) => {
    if (trip_id !== tripId) return { error: 'Trip mismatch. Ask the user to retry.' };
    try {
      const result = await request('message', { trip_id: tripId, client_message_id: client_message_id || crypto.randomUUID(), text });
      onTrip(result.trip);
      return { reply: result.reply };
    } catch (e) { return { error: e.message || 'Trip service unavailable. Do not answer from memory.' }; }
  };
  start.onclick = async () => {
    start.disabled = true; status.textContent = 'Connecting to voice…';
    try {
      const { Conversation } = await import('https://esm.sh/@elevenlabs/client@1.10.0');
      const { signed_url } = await request('session');
      conversation = await Conversation.startSession({ signedUrl: signed_url,
        dynamicVariables: { trip_id: tripId },
        clientTools: {
          getTripContext: async ({ trip_id }) => trip_id === tripId ? request('context') : { error: 'Trip mismatch' },
          handleTripMessage: handleMessage
        },
        onConnect: () => { status.textContent = 'Voice connected'; stop.disabled = false; },
        onDisconnect: () => { status.textContent = 'Voice disconnected. You can still type below.'; start.disabled = false; stop.disabled = true; },
        onMessage: ({ source, message }) => { if (message) addLine(source === 'user' ? 'You' : 'Jev', message); },
        onError: () => { status.textContent = 'Voice unavailable. You can still type below.'; }
      });
    } catch {
      status.textContent = 'Voice unavailable or microphone denied. You can still type below.'; start.disabled = false;
    }
  };
  stop.onclick = async () => { if (conversation) await conversation.endSession(); conversation = undefined; };
  form.onsubmit = async event => {
    event.preventDefault(); const text = input.value.trim(); if (!text) return;
    submit.disabled = true; addLine('You', text); input.value = '';
    const result = await handleMessage({ trip_id: tripId, client_message_id: crypto.randomUUID(), text });
    addLine('Jev', result.reply || result.error); submit.disabled = false;
  };
  return () => { conversation?.endSession(); container.replaceChildren(); };
}

if (typeof window !== 'undefined') window.JevVoice = { mountVoice };

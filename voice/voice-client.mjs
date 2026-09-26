// Mount in the frontend with the same trip ID and bearer token used for web messages.
export function mountVoice(container, { tripId, accessToken, voiceBase = '', onTrip = () => {}, showTextFallback = true }) {
  if (!container || !/^[A-Za-z0-9_-]{1,128}$/.test(tripId || '') || !accessToken) throw new Error('An authorized trip is required');
  const base = `${voiceBase.replace(/\/$/, '')}/trips/${encodeURIComponent(tripId)}`;
  const start = document.createElement('button'); start.type = 'button'; start.textContent = 'Start voice';
  const stop = document.createElement('button'); stop.type = 'button'; stop.textContent = 'Stop voice'; stop.disabled = true;
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = 'Voice is ready.';
  const transcript = document.createElement('div'); transcript.setAttribute('aria-live', 'polite');
  const form = showTextFallback ? document.createElement('form') : null;
  const input = showTextFallback ? document.createElement('input') : null;
  const submit = showTextFallback ? document.createElement('button') : null;
  if (form) {
    input.placeholder = 'Type a message if voice is unavailable'; input.required = true;
    submit.textContent = 'Send';
    form.append(input, submit);
  }
  container.replaceChildren(start, stop, status, transcript, ...(form ? [form] : []));
  let conversation;
  let disposed = false;
  let stopRequested = false;
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
  const fallbackHint = showTextFallback ? 'You can still type below.' : 'Use the trip message field.';
  start.onclick = async () => {
    stopRequested = false;
    start.disabled = true; status.textContent = 'Connecting to voice…';
    try {
      const { Conversation } = await import('https://esm.sh/@elevenlabs/client@1.10.0');
      if (disposed) return;
      const { signed_url } = await request('session');
      if (disposed) return;
      const started = await Conversation.startSession({ signedUrl: signed_url,
        dynamicVariables: { trip_id: tripId },
        clientTools: {
          getTripContext: async ({ trip_id }) => trip_id === tripId ? request('context') : { error: 'Trip mismatch' },
          handleTripMessage: handleMessage
        },
        onConnect: () => { status.textContent = 'Voice connected'; stop.disabled = false; },
        onDisconnect: () => { status.textContent = `Voice disconnected. ${fallbackHint}`; start.disabled = false; stop.disabled = true; },
        onMessage: ({ source, message }) => { if (message) addLine(source === 'user' ? 'You' : 'Jev', message); },
        onError: () => { status.textContent = `Voice unavailable. ${fallbackHint}`; }
      });
      if (disposed || stopRequested) await started.endSession();
      else conversation = started;
    } catch {
      if (disposed) return;
      status.textContent = `Voice unavailable or microphone denied. ${fallbackHint}`; start.disabled = false;
    }
  };
  stop.onclick = async () => { stopRequested = true; if (conversation) await conversation.endSession(); conversation = undefined; };
  if (form) form.onsubmit = async event => {
    event.preventDefault(); const text = input.value.trim(); if (!text) return;
    submit.disabled = true; addLine('You', text); input.value = '';
    const result = await handleMessage({ trip_id: tripId, client_message_id: crypto.randomUUID(), text });
    addLine('Jev', result.reply || result.error); submit.disabled = false;
  };
  return () => { disposed = true; conversation?.endSession(); container.replaceChildren(); };
}

if (typeof window !== 'undefined') window.JevVoice = { mountVoice };

const api = 'https://spectrum.photon.codes';

export async function receivingLine({ projectId, projectSecret, recipient, register = false, fetcher = fetch }) {
  if (!projectId || !projectSecret) throw new Error('Photon project credentials are required.');
  if (!/^\+[1-9]\d{7,14}$/.test(recipient || '')) {
    throw new Error('Set PHOTON_TEST_RECIPIENT to the approved iMessage number in international format.');
  }

  const url = `${api}/projects/${encodeURIComponent(projectId)}/users/`;
  const headers = { Authorization: `Basic ${Buffer.from(`${projectId}:${projectSecret}`).toString('base64')}` };
  async function listedUser() {
    const response = await fetcher(url, { headers });
    if (!response.ok) throw new Error(`Photon users lookup failed (HTTP ${response.status}).`);
    const body = await response.json();
    if (!body?.succeed || !Array.isArray(body?.data?.users)) throw new Error('Invalid Photon users response.');
    return body.data.users.find(user => user.phoneNumber === recipient && user.type === 'shared');
  }

  let user = await listedUser();
  if (!user && register) {
    const response = await fetcher(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'shared', phoneNumber: recipient }),
    });
    if (!response.ok) throw new Error(`Photon user registration failed (HTTP ${response.status}).`);
    user = await listedUser();
  }
  if (!user) return null;
  if (!/^\+[1-9]\d{7,14}$/.test(user.assignedPhoneNumber || '')) {
    throw new Error('Photon user has no assigned receiving number.');
  }
  return user.assignedPhoneNumber;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--register-approved')) {
    console.error('Usage: node --env-file=.env photon/src/receiving-line.mjs [--register-approved]');
    process.exitCode = 1;
  } else {
    try {
      const line = await receivingLine({
        projectId: process.env.PHOTON_PROJECT_ID,
        projectSecret: process.env.PHOTON_PROJECT_SECRET,
        recipient: process.env.PHOTON_TEST_RECIPIENT?.trim(),
        register: args.includes('--register-approved'),
      });
      if (line) console.log(`Send an iMessage to ${line} while the Photon listener is running.`);
      else console.log('Presenter is not registered. After approval, rerun with --register-approved. No message sent.');
    } catch (error) {
      console.error(error instanceof Error && /^Photon |^Invalid Photon |^Set PHOTON_/.test(error.message)
        ? error.message : 'Photon receiving-line lookup failed.');
      process.exitCode = 1;
    }
  }
}

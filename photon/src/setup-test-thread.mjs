import { Spectrum } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';

const text = 'Jevathon setup: this is your travel assistant test thread. Please wait for setup to finish before replying.';
const recipient = process.env.PHOTON_TEST_RECIPIENT?.trim();

// This is an explicit, one-time operator command; never run on server startup.
if (!process.argv.includes('--send-approved')) {
  console.log(`Setup message preview: ${text}`);
  console.log('No message sent. After the owner approves, run with --send-approved.');
} else if (!/^\+[1-9]\d{7,14}$/.test(recipient || '')) {
  console.error('Set PHOTON_TEST_RECIPIENT to your own iMessage number in international format.');
  process.exitCode = 1;
} else if (!process.env.PHOTON_PROJECT_ID || !process.env.PHOTON_PROJECT_SECRET) {
  console.error('Photon project credentials are required.');
  process.exitCode = 1;
} else {
  let app;
  try {
    app = await Spectrum({
      projectId: process.env.PHOTON_PROJECT_ID,
      projectSecret: process.env.PHOTON_PROJECT_SECRET,
      providers: [imessage.config()],
    });
    const provider = imessage(app);
    const user = await provider.user(recipient);
    const space = await provider.space.create(user);
    await space.send(text);
    await app.stop().catch(() => {});
    console.log('Setup message accepted by Photon. Check your own Messages app for the test thread.');
    console.log('Delivery and receive/reply still need verification; do not claim the backend is connected yet.');
    process.exit(0);
  } catch (cause) {
    await app?.stop().catch(() => {});
    const code = Number.isInteger(cause?.code) ? cause.code : 'unknown';
    console.error(`Photon setup failed (provider code ${code}). Delivery is unconfirmed; check Messages before any retry.`);
    process.exitCode = 1;
    process.exit(1);
  }
}

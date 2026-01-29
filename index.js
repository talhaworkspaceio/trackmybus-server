const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://trackmybus-586f0-default-rtdb.firebaseio.com',
});

const db = admin.database();

console.log('🚀 Bus notification server running...');

// ======================================
// ONLY LISTEN LATEST EVENTS (IMPORTANT)
// ======================================
const eventsRef = db.ref('bus/events').limitToLast(1);

let lastKey = null; // prevent duplicate on restart

eventsRef.on('child_added', async snap => {
  // 🔥 skip old event on first load
  if (!lastKey) {
    lastKey = snap.key;
    return;
  }

  if (snap.key === lastKey) return;

  lastKey = snap.key;

  const event = snap.val();

  console.log('📢 NEW EVENT:', event);

  if (!event) return;

  // ==================================
  // GET ALL USER TOKENS
  // ==================================
  const usersSnap = await db.ref('users').once('value');

  const tokens = [];

  usersSnap.forEach(user => {
    const token = user.val()?.fcmToken;
    if (token) tokens.push(token);
  });

  if (!tokens.length) {
    console.log('❌ No tokens found');
    return;
  }

  // ==================================
  // BUILD MESSAGE
  // ==================================
  let title = '';
  let body = '';

  switch (event.type) {
    case 'START':
      title = '🚌 Bus Started';
      body = 'Trip has started';
      break;

    case 'STOP':
      title = '🚌 Bus Reached';
      body = event.stopName;
      break;

    case 'END':
      title = '🛑 Trip Ended';
      body = 'Bus has completed the trip';
      break;

    default:
      return;
  }

  // ==================================
  // SEND PUSH (WORKS IN KILL MODE)
  // ==================================
  await admin.messaging().sendEachForMulticast({
    tokens,

    notification: { title, body }, // 🔥 for kill mode

    android: {
      notification: {
        channelId: 'default', // 🔥 CRITICAL
      },
    },

    apns: {
      payload: {
        aps: {
          sound: 'default',
        },
      },
    },
  });

  console.log(`✅ Sent to ${tokens.length} users`);
});

// require('dotenv').config();
// const admin = require('firebase-admin');
// console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID);
// console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL);
// console.log(
//   'FIREBASE_PRIVATE_KEY:',
//   process.env.FIREBASE_PRIVATE_KEY ? 'Exists' : 'Missing',
// );
// console.log('DB_URL:', process.env.DB_URL);
// admin.initializeApp({
//   credential: admin.credential.cert({
//     projectId: process.env.FIREBASE_PROJECT_ID,
//     clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
//     privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
//   }),
//   databaseURL: process.env.DB_URL,
// });

// const db = admin.database();

// console.log('🚀 Bus notification server running...');

// // ======================================
// // ONLY LISTEN LATEST EVENTS (IMPORTANT)
// // ======================================
// const eventsRef = db.ref('bus/events').limitToLast(1);

// let lastKey = null; // prevent duplicate on restart

// eventsRef.on('child_added', async snap => {
//   // 🔥 skip old event on first load
//   if (!lastKey) {
//     lastKey = snap.key;
//     return;
//   }

//   if (snap.key === lastKey) return;

//   lastKey = snap.key;

//   const event = snap.val();

//   console.log('📢 NEW EVENT:', event);

//   if (!event) return;

//   // ==================================
//   // GET ALL USER TOKENS
//   // ==================================
//   const usersSnap = await db.ref('users').once('value');

//   const tokens = [];

//   usersSnap.forEach(user => {
//     const token = user.val()?.fcmToken;
//     if (token) tokens.push(token);
//   });

//   if (!tokens.length) {
//     console.log('❌ No tokens found');
//     return;
//   }

//   // ==================================
//   // BUILD MESSAGE
//   // ==================================
//   let title = '';
//   let body = '';

//   switch (event.type) {
//     case 'START':
//       title = '🚌 Bus Started';
//       body = 'Trip has started';
//       break;

//     case 'STOP':
//       title = '🚌 Bus Reached';
//       body = event.stopName;
//       break;

//     case 'END':
//       title = '🛑 Trip Ended';
//       body = 'Bus has completed the trip';
//       break;

//     default:
//       return;
//   }

//   // ==================================
//   // SEND PUSH (WORKS IN KILL MODE)
//   // ==================================
//   await admin.messaging().sendEachForMulticast({
//     tokens,

//     notification: { title, body }, // 🔥 for kill mode

//     android: {
//       notification: {
//         channelId: 'default', // 🔥 CRITICAL
//       },
//     },

//     apns: {
//       payload: {
//         aps: {
//           sound: 'default',
//         },
//       },
//     },
//   });

//   console.log(`✅ Sent to ${tokens.length} users`);
// });





require('dotenv').config();
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  databaseURL: process.env.DB_URL,
});

const db = admin.database();

console.log('🚀 Bus notification server running...');

// ======================================
// 🔥 LISTEN ONLY LATEST EVENT
// ======================================
const eventsRef = db.ref('bus/events').limitToLast(1);

eventsRef.on('child_added', async snap => {
  const eventKey = snap.key;
  const event = snap.val();

  if (!event) return;

  console.log('📢 EVENT DETECTED:', eventKey, event);

  // ======================================
  // 🔥 GLOBAL LOCK (CRITICAL FIX)
  // only ONE instance allowed to process
  // ======================================
  const lockRef = db.ref('system/lastProcessedEvent');

  const lockResult = await lockRef.transaction(current => {
    if (current === eventKey) {
      return; // already processed
    }
    return eventKey; // claim this event
  });

  // if not committed → another server already processed
  if (!lockResult.committed) {
    console.log('⏭️ Skipped duplicate (already processed)');
    return;
  }

  console.log('✅ Processing event...');

  // ==================================
  // GET TOKENS
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
  // SEND PUSH
  // ==================================
  await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    android: {
      notification: { channelId: 'default', icon: 'ic_notification'},
    },
    apns: {
      payload: {
        aps: { sound: 'default' },
      },
    },
  });

  console.log(`🚀 Sent to ${tokens.length} users`);
});

import { app, database } from "../../shared/firebase-config.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { getMessaging } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js";

export { app, database };
export const auth = getAuth(app);
export const storage = getStorage(app);

export let messaging;
try {
  messaging = getMessaging(app);
} catch (err) {
  console.log("FCM not supported");
}

export const VAPID_KEY =
  "BHrjLUSNG-h2NcRw_ypWBHTr3cc-iEZ7jCA8fYzjrWO6Yh4Sqg3xTevCEAcUAbncnWwrZZfOXkuFeWMQCHnkLDs";
export const NOMOR_ADMIN_DRIVER = "6285870422464";
export const GOOGLE_MAPS_API_KEY = "AIzaSyBvW7x7bElI9LUZ0WTRa2yzWYefrRuK9AY"; // BUG LAMA: sebelumnya gak pernah ada di sini, padahal resto/js/geo.js butuh ini

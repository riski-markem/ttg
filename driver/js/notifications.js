/**
 * driver/js/notifications.js
 * -----------------------------------------------------------------------
 * SECURITY FIX (XSS): showFloatingNotif() merender title/body langsung
 * lewat innerHTML tanpa escape. Diperbaiki dengan escapeHtml() di titik
 * ini saja, jadi semua pemanggilnya otomatis aman.
 * -----------------------------------------------------------------------
 */
import { getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { database, messaging, VAPID_KEY } from "./config.js";
import { state } from "./state.js";
import { langDict } from "./i18n.js";
import { navigasiKe } from "./navigation.js";
import { escapeHtml } from "../../shared/utils.js";

export async function setupPushNotification() {
  if (!("serviceWorker" in navigator) || !("Notification" in window) || !messaging) return;

  let registrasi;
  try {
    registrasi = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  } catch (err) {
    return void console.error("SW gagal:", err);
  }

  if ((await Notification.requestPermission()) === "granted") {
    try {
      const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registrasi });
      if (token && state.waDriverAktif) {
        const waBersih = state.waDriverAktif.replace(/\D/g, "");
        await set(ref(database, "fcm_tokens_driver/" + waBersih), {
          token,
          nama: state.namaDriverAktif,
          wa: state.waDriverAktif,
          updated: Date.now(),
        });
      }
    } catch (err) {
      console.error("FCM token gagal:", err);
    }

    onMessage(messaging, (payload) => {
      const teks = langDict[state.currentLang];
      showFloatingNotif(payload.notification?.title || teks.toastNewOrderTitle, payload.notification?.body || teks.toastNewOrderDesc);
    });
  }
}

export function showFloatingNotif(judul, isi) {
  const lama = document.getElementById("sb-drv-notif");
  if (lama) lama.remove();

  const judulAman = escapeHtml(judul);
  const isiAman = escapeHtml(isi);

  const kotak = document.createElement("div");
  kotak.id = "sb-drv-notif";
  kotak.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:28px;animation:notifRing 0.5s ease infinite alternate;">🛵</span>
            <div style="flex:1;">
                <div style="font-weight:800;font-size:14px;color:#fff;">${judulAman}</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.88);margin-top:3px;">${isiAman}</div>
            </div>
            <button onclick="document.getElementById('sb-drv-notif').remove()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">✕</button>
        </div>
    `;
  Object.assign(kotak.style, {
    position: "fixed",
    top: "14px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "calc(100% - 28px)",
    maxWidth: "450px",
    background: "linear-gradient(135deg, #1a252f, #2c3e50)",
    borderRadius: "14px",
    padding: "15px 16px",
    boxShadow: "0 8px 32px rgba(44,62,80,0.5)",
    zIndex: "9999",
    animation: "drvNotifIn 0.4s cubic-bezier(0.34,1.56,0.64,1)",
    cursor: "pointer",
  });
  kotak.onclick = function (e) {
    if (e.target.tagName !== "BUTTON") {
      navigasiKe("radar");
      kotak.remove();
    }
  };
  document.body.appendChild(kotak);
  setTimeout(() => {
    if (kotak.parentNode) kotak.remove();
  }, 7000);
}

const styleTag = document.createElement("style");
styleTag.textContent = `
    @keyframes drvNotifIn { from{opacity:0;transform:translateX(-50%) translateY(-18px) scale(0.92)} to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)} }
    @keyframes notifRing { from{transform:rotate(-15deg)} to{transform:rotate(15deg)} }
`;
document.head.appendChild(styleTag);

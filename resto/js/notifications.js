/**
 * resto/js/notifications.js
 * -----------------------------------------------------------------------
 * SECURITY FIX (XSS): showFloatingNotifResto() merender title/body
 * langsung lewat innerHTML tanpa escape. Diperbaiki dengan escapeHtml()
 * di titik ini saja, jadi semua pemanggilnya otomatis aman.
 * -----------------------------------------------------------------------
 */
import { ref, set } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js";
import { database, messaging, VAPID_KEY } from "./config.js";
import { state } from "./state.js";
import { escapeHtml } from "../../shared/utils.js";

export async function setupPushNotificationResto() {
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
      if (token && state.waRestoAktif) {
        const waBersih = state.waRestoAktif.replace(/\D/g, "");
        await set(ref(database, "fcm_tokens_resto/" + waBersih), {
          token,
          nama: state.namaRestoAktif,
          wa: state.waRestoAktif,
          updated: Date.now(),
        });
      }
    } catch (err) {
      console.error("FCM token gagal:", err);
    }

    onMessage(messaging, (payload) => {
      showFloatingNotifResto(payload.notification?.title || "🍽️ Pesanan Baru!", payload.notification?.body || "Ada pesanan masuk, cek dashboard ya.");
      const suara = document.getElementById("suaraNotifResto");
      if (suara) {
        suara.currentTime = 0;
        suara.play().catch(() => {});
      }
    });
  }
}

export function showFloatingNotifResto(judul, isi) {
  const lama = document.getElementById("ttg-resto-notif");
  if (lama) lama.remove();

  const judulAman = escapeHtml(judul);
  const isiAman = escapeHtml(isi);

  const kotak = document.createElement("div");
  kotak.id = "ttg-resto-notif";
  kotak.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:28px;">🍽️</span>
            <div style="flex:1;">
                <div style="font-weight:800;font-size:14px;color:#fff;">${judulAman}</div>
                <div style="font-size:12.5px;color:rgba(255,255,255,0.88);margin-top:3px;font-weight:600;">${isiAman}</div>
            </div>
            <button onclick="document.getElementById('ttg-resto-notif').remove()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">✕</button>
        </div>
    `;
  Object.assign(kotak.style, {
    position: "fixed",
    top: "14px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "calc(100% - 28px)",
    maxWidth: "450px",
    background: "linear-gradient(135deg, #C2410C, #EA580C)",
    borderRadius: "14px",
    padding: "15px 16px",
    boxShadow: "0 8px 32px rgba(194,65,12,0.45)",
    zIndex: "9999",
    animation: "restoNotifIn 0.4s cubic-bezier(0.34,1.56,0.64,1)",
    cursor: "pointer",
  });
  kotak.onclick = function (e) {
    if (e.target.tagName !== "BUTTON") {
      window.pindahTab("pesanan");
      kotak.remove();
    }
  };
  document.body.appendChild(kotak);
  setTimeout(() => {
    if (kotak.parentNode) kotak.remove();
  }, 7000);
}

const styleTag = document.createElement("style");
styleTag.textContent =
  "@keyframes restoNotifIn { from { opacity:0; transform:translateX(-50%) translateY(-18px) scale(0.92); } to { opacity:1; transform:translateX(-50%) translateY(0) scale(1); } }";
document.head.appendChild(styleTag);

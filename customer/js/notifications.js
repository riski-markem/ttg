/**
 * customer/js/notifications.js
 * -----------------------------------------------------------------------
 * SECURITY FIX (XSS): showFloatingNotif() merender title/body langsung
 * lewat innerHTML tanpa escape. Body pesan ini sering berisi nilai yang
 * bisa diatur pihak lain (driver_nama, resto_nama, alasan_tolak_resto),
 * jadi driver/resto nakal bisa menaruh skrip di namanya sendiri lalu
 * skrip itu jalan di browser CUSTOMER saat notifikasi statusnya muncul.
 * Diperbaiki dengan escapeHtml() di satu titik (dalam showFloatingNotif)
 * supaya semua pemanggil otomatis aman, tidak perlu escape manual di
 * tiap tempat yang memanggilnya.
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
    return;
  }

  if ((await Notification.requestPermission()) === "granted") {
    try {
      const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registrasi });
      if (token && state.userAktif.wa) {
        const waBersih = state.userAktif.wa.replace(/\D/g, "");
        await set(ref(database, "fcm_tokens_customer/" + waBersih), {
          token,
          nama: state.userAktif.nama,
          wa: state.userAktif.wa,
          updated: Date.now(),
        });
      }
    } catch (err) {}

    onMessage(messaging, (payload) => {
      showFloatingNotif(payload.notification?.title || "🛵 TulangTulung.id", payload.notification?.body || "Ada update pesanan!");
    });
  }
}

export function showFloatingNotif(judul, isi) {
  const lama = document.getElementById("ttg-floating-notif");
  if (lama) lama.remove();

  const judulAman = escapeHtml(judul);
  const isiAman = escapeHtml(isi);

  const kotak = document.createElement("div");
  kotak.id = "ttg-floating-notif";
  kotak.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:30px;">🛵</span>
            <div style="flex:1;">
                <div style="font-weight:800;font-size:14px;color:#fff;">${judulAman}</div>
                <div style="font-size:12.5px;color:rgba(255,255,255,0.85);margin-top:3px;font-weight:600;">${isiAman}</div>
            </div>
            <button onclick="document.getElementById('ttg-floating-notif').remove()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">✕</button>
        </div>
    `;
  Object.assign(kotak.style, {
    position: "fixed",
    top: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "calc(100% - 32px)",
    maxWidth: "440px",
    background: "linear-gradient(135deg, var(--primary-dark), var(--primary))",
    borderRadius: "16px",
    padding: "16px 18px",
    boxShadow: "0 8px 32px rgba(44, 62, 80, 0.45)",
    zIndex: "9999",
    animation: "notifSlideIn 0.4s cubic-bezier(0.34,1.56,0.64,1)",
    cursor: "pointer",
  });
  kotak.onclick = function (e) {
    if (e.target.tagName !== "BUTTON") {
      navigasiKe("order");
      kotak.remove();
    }
  };
  document.body.appendChild(kotak);
  setTimeout(() => {
    if (kotak.parentNode) kotak.remove();
  }, 6000);
}

const styleTag = document.createElement("style");
styleTag.textContent =
  "@keyframes notifSlideIn { from { opacity:0; transform:translateX(-50%) translateY(-20px) scale(0.9); } to { opacity:1; transform:translateX(-50%) translateY(0) scale(1); } }";
document.head.appendChild(styleTag);

const statusTerakhir = {};

export function cekPerubahanStatusDanNotif(daftarPesenan) {
  const teks = langDict[state.currentLang];

  daftarPesenan.forEach((order) => {
    const statusSebelumnya = statusTerakhir[order.id];

    if (statusSebelumnya !== undefined) {
      if (statusSebelumnya === "terbuka" && order.status === "diambil") {
        const isi = `Driver ${order.driver_nama || ""} ${teks.notifDiambil} ${order.layanan}.`;
        showFloatingNotif(teks.status2, isi);
        if (document.hidden && Notification.permission === "granted") {
          new Notification(`${teks.status2} — TulangTulung`, { body: isi, icon: "/logo-satria.png", tag: "driver-found-" + order.id });
        }
      }
      if (statusSebelumnya === "diambil" && order.status === "selesai") {
        const isi = `${order.layanan} ${teks.notifSelesai}`;
        showFloatingNotif(teks.status3, isi);
        if (document.hidden && Notification.permission === "granted") {
          new Notification(`${teks.status3} — TulangTulung`, { body: isi, icon: "/logo-satria.png", tag: "order-done-" + order.id });
        }
      }
      if (statusSebelumnya === "menunggu_resto" && order.status === "diterima_resto") {
        const judul = teks.statusRestoTerima || "Resto Menerima Pesanan";
        const isi = `${order.resto_nama || "Resto"} sedang menyiapkan pesananmu.`;
        showFloatingNotif(judul, isi);
        if (document.hidden && Notification.permission === "granted") {
          new Notification(`${judul} — TulangTulung`, { body: isi, icon: "/logo-satria.png", tag: "resto-terima-" + order.id });
        }
      }
      if (statusSebelumnya === "menunggu_resto" && order.status === "ditolak_resto") {
        const judul = teks.statusDitolakResto || "Ditolak Resto";
        const isi = `${order.resto_nama || "Resto"} tidak bisa memproses pesananmu.${order.alasan_tolak_resto ? " Alasan: " + order.alasan_tolak_resto : ""}`;
        showFloatingNotif(judul, isi);
        if (document.hidden && Notification.permission === "granted") {
          new Notification(`${judul} — TulangTulung`, {
            body: `${order.resto_nama || "Resto"} tidak bisa memproses pesananmu.`,
            icon: "/logo-satria.png",
            tag: "resto-tolak-" + order.id,
          });
        }
      }
      if (statusSebelumnya === "diterima_resto" && order.status === "diambil") {
        const isi = `Driver ${order.driver_nama || ""} ${teks.notifDiambil} ${order.layanan}.`;
        showFloatingNotif(teks.status2, isi);
        if (document.hidden && Notification.permission === "granted") {
          new Notification(`${teks.status2} — TulangTulung`, { body: isi, icon: "/logo-satria.png", tag: "driver-found-" + order.id });
        }
      }
    }

    statusTerakhir[order.id] = order.status;
  });
}

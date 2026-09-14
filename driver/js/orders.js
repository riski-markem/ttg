import {
  ref,
  onValue,
  update,
  runTransaction,
  push,
  query,
  orderByChild,
  equalTo,
  limitToLast,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { database } from "./config.js";
import { state } from "./state.js";
import { langDict } from "./i18n.js";
import { hitungTotalPotonganAmbil, renderRiwayatSaldo } from "./wallet.js";
import { pantauUnreadChat } from "./chat.js";
import { tambahOrderDilacak, hapusOrderDilacak } from "./live-location.js";
import { daftarkanOrderUntukGeofence, hapusOrderDariGeofence } from "./geofencing.js";
import { hitungPotonganBpjs, tambahTabunganBpjs, batalkanTabunganBpjs } from "./bpjs.js";

const BATAS_ORDER_PER_KOTA = 500;

export function pantauOrderanMasuk() {
  const ordersQuery = query(
    ref(database, "orders"),
    orderByChild("kota"),
    equalTo(state.kotaDriverAktif),
    limitToLast(BATAS_ORDER_PER_KOTA)
  );

  onValue(ordersQuery, (snapshot) => {
    const daftar = [];
    snapshot.forEach((child) => {
      const order = child.val();
      order.id = child.key;
      daftar.push(order);
    });
    daftar.reverse();
    state.latestOrdersData = daftar;

    prosesPembatalanOtomatis(daftar);

    try {
      renderOrdersUI();
      renderRiwayatSaldo();
      if (!document.getElementById("page-history").classList.contains("hidden")) {
        renderRiwayatDriver();
      }
    } catch (err) {
      console.error("Gagal render data orderan:", err);
    }
  });
}

function prosesPembatalanOtomatis(daftarOrder) {
  daftarOrder.forEach((order) => {
    if (order.driver_nama !== state.namaDriverAktif) return;
    if (order.status !== "diambil" || !order.minta_batal_customer) return;
    if (state.batalOtomatisDiproses.has(order.id)) return;

    const waktuDiambil = order.waktu_diambil || 0;
    if (waktuDiambil && Date.now() - waktuDiambil <= 90000) {
      state.batalOtomatisDiproses.add(order.id);
      const pengembalian = hitungTotalPotonganAmbil(order);
      update(ref(database, "orders/" + order.id), { status: "batal_cust", minta_batal_customer: false })
        .then(() => {
          update(ref(database, `drivers/${state.waDriverAktif}`), { saldo: state.saldoDriverAktif + pengembalian });
        })
        .catch(() => {
          state.batalOtomatisDiproses.delete(order.id);
        });
    }
  });
}

function renderBoxMakanan(order) {
  if (!order.items) return "";
  const baris = Object.values(order.items)
    .map(
      (item) => `<div class="oc-food-item-row"><div><span>${item.qty}x ${item.nama}</span>${item.opsi_text ? `<div style="font-size:10.5px; color:var(--text3); font-weight:600; margin-top:1px;">${item.opsi_text}</div>` : ""}</div><span>${(item.harga * item.qty).toLocaleString("id-ID")}</span></div>`
    )
    .join("");
  return `<div class="oc-food-box">
        <div class="oc-food-resto">🍜 Jemput di: ${order.resto_nama || "-"}</div>
        ${baris}
        <div class="oc-food-subtotal-row"><span>Subtotal Makanan</span><span>Rp ${(order.subtotal_makanan || 0).toLocaleString("id-ID")}</span></div>
        <div class="oc-food-subtotal-row"><span>Biaya Layanan (app)</span><span>Rp ${(order.biaya_layanan_makanan || 0).toLocaleString("id-ID")}</span></div>
        <div class="oc-food-cod-note">💵 Bayar tunai ke resto Rp ${(order.subtotal_makanan || 0).toLocaleString("id-ID")} saat ambil (harga asli resto). Lalu tagih customer Rp ${((order.subtotal_makanan || 0) + (order.biaya_layanan_makanan || 0) + (order.estimasi_ongkos || 0)).toLocaleString("id-ID")} saat antar.</div>
    </div>`;
}

function hitungOngkos(order) {
  return (order.estimasi_ongkos || 0) + (order.biaya_layanan_jasa || 0);
}

export function renderOrdersUI() {
  if (state.namaDriverAktif === "") return;
  const teks = langDict[state.currentLang];
  const listRadar = document.getElementById("listOrderan");
  const listAktif = document.getElementById("listOrderanAktif");
  if (!listRadar || !listAktif) return;

  listRadar.innerHTML = "";
  listAktif.innerHTML = "";

  let adaOrderBaru = false;
  let adaOrderAktif = false;
  let mainkanSuara = false;
  let statJalan = 0;
  let statSelesai = 0;

  state.latestOrdersData.forEach((order) => {
    if (order.driver_nama === state.namaDriverAktif) {
      if (order.status === "selesai") statSelesai++;
      if (order.status === "diambil") statJalan++;
    }

    if (order.status === "diambil" && order.driver_nama === state.namaDriverAktif) {
      adaOrderAktif = true;
      pantauUnreadChat(order.id);
      tambahOrderDilacak(order.id);
      daftarkanOrderUntukGeofence(order);

      const kartu = document.createElement("div");
      kartu.className = "order-card order-card-active";
      kartu.innerHTML = `
                <div class="oc-header"><span class="oc-badge oc-badge-active">${teks.badgeAktif}</span><span class="oc-time">⏱️ ${order.waktu_order || ""}</span></div>
                <div class="oc-body">
                    <div class="oc-customer"><div class="oc-cust-avatar">👤</div><div><div class="oc-cust-name">${order.customer_nama || ""}</div><div class="oc-cust-wa">${order.layanan || ""}</div></div></div>
                    <div class="oc-route"><div class="oc-route-row"><div class="oc-route-icon" style="background:#DBEAFE;">📍</div><div><div class="oc-route-label">${teks.lblDet1}</div><div class="oc-route-val">${order.detail_1 || ""}</div></div></div><div class="oc-route-row"><div class="oc-route-icon" style="background:#D1FAE5;">🏁</div><div><div class="oc-route-label">${teks.lblDet2}</div><div class="oc-route-val">${order.detail_2 || ""}</div></div></div></div>
                    ${order.jarak_km ? `<div class="oc-jarak-ongkos"><span>📏 ${order.jarak_km} km${order.durasi_menit ? " · ⏱️ ~" + order.durasi_menit + " mnt" : ""}</span><span class="oc-jo-harga">💰 Rp ${hitungOngkos(order).toLocaleString("id-ID")}</span></div>` : ""}
                    ${renderBoxMakanan(order)}
                    ${order.catatan ? `<div class="oc-note">📝 ${teks.lblNote}: ${order.catatan}</div>` : ""}
                    ${
                      order.minta_batal_customer
                        ? `
                    <div class="oc-note" style="background:#FEF2F2;border-color:#FCA5A5;color:#991B1B;">⚠️ Customer mengajukan pembatalan. ACC kalau memang berhalangan/salah pesan, atau Tolak kalau kamu sudah otw/dekat lokasi.</div>
                    <div class="action-grid">
                        <button class="btn-cancel-order" onclick="tolakPembatalanCustomer('${order.id}')">✕ Tolak</button>
                        <button class="btn-complete-order" onclick="setujuiPembatalanCustomer('${order.id}')">✓ ACC Batal</button>
                    </div>
                    `
                        : `
                    <div class="oc-note-bottom">${teks.noteAktif}</div>
                    <button class="btn-wa-chat btn-chat-cust" id="btnChat-${order.id}" onclick="bukaChat('${order.id}','${(order.customer_nama || "Customer").replace(/'/g, "\\'")}')">${teks.btnWa}<span class="chat-unread-dot"></span></button>
                    ${order.izin_wa_customer ? `<button class="btn-wa-chat" style="background:#ECFDF5;color:#15803D;border-color:#86EFAC;margin-top:6px;" onclick="chatUlang('${order.customer_wa}')">${teks.btnWaCust}</button>` : `<div class="oc-note-bottom" style="opacity:0.75;">${teks.noIzinWa}</div>`}
                    ${order.resto_id ? `<button class="btn-wa-chat" style="background:#FFF3E0;color:#E65100;border-color:#FFCC80;" onclick="chatUlang('${order.resto_id}')">${teks.btnWaResto}</button>` : ""}
                    ${order.pickup_lat && order.pickup_lng ? `<button class="btn-wa-chat" style="background:#E8F5E9;color:#1B5E20;border-color:#A5D6A7;margin-top:6px;" onclick="bukaPetaOrderan('${order.pickup_lat}','${order.pickup_lng}','${order.dropoff_lat || ""}','${order.dropoff_lng || ""}','${(order.detail_1 || "").replace(/'/g, "")}','${(order.detail_2 || "").replace(/'/g, "")}')">🗺️ Lihat Peta & Navigasi</button>` : ""}
                    <div class="action-grid"><button class="btn-cancel-order" onclick="batalAmbilOrderan('${order.id}')">${teks.btnCancelOrder}</button><button class="btn-complete-order" onclick="selesaikanOrderanDriver('${order.id}')">${teks.btnCompleteOrder}</button></div>
                    `
                    }
                </div>`;
      listAktif.appendChild(kartu);
    }

    if (order.status === "terbuka" || order.status === "diterima_resto") {
      adaOrderBaru = true;
      if (!state.orderYangSudahBunyi.has(order.id)) {
        state.orderYangSudahBunyi.add(order.id);
        mainkanSuara = true;
        if (document.hidden && Notification.permission === "granted") {
          new Notification(`${teks.toastNewOrderTitle || "🛵 Orderan Baru!"} — TulangTulung`, {
            body: `${order.customer_nama || ""} ${teks.toastNewOrderDesc || "butuh driver untuk"} ${order.layanan || ""}.`,
            icon: "/logo-driver.png",
            tag: "driver-new-order-" + order.id,
          });
        }
      }

      const kartu = document.createElement("div");
      kartu.className = "order-card order-card-new";
      kartu.innerHTML = `
                <div class="oc-header"><span class="oc-badge oc-badge-new">${order.layanan || ""}</span><span class="oc-time">⏱️ ${order.waktu_order || ""}</span></div>
                <div class="oc-body">
                    <div class="oc-customer"><div class="oc-cust-avatar">👤</div><div><div class="oc-cust-name">${order.customer_nama || ""}</div><div class="oc-cust-wa">${teks.lblCust}</div></div></div>
                    <div class="oc-route"><div class="oc-route-row"><div class="oc-route-icon" style="background:#FEF9E7;">📍</div><div><div class="oc-route-label">${teks.lblDet1}</div><div class="oc-route-val">${order.detail_1 || ""}</div></div></div><div class="oc-route-row"><div class="oc-route-icon" style="background:#D1FAE5;">🏁</div><div><div class="oc-route-label">${teks.lblDet2}</div><div class="oc-route-val">${order.detail_2 || ""}</div></div></div></div>
                    ${order.jarak_km ? `<div class="oc-jarak-ongkos"><span>📏 ${order.jarak_km} km${order.durasi_menit ? " · ⏱️ ~" + order.durasi_menit + " mnt" : ""}</span><span class="oc-jo-harga">💰 Rp ${hitungOngkos(order).toLocaleString("id-ID")}</span></div>` : ""}
                    ${renderBoxMakanan(order)}
                    ${order.catatan ? `<div class="oc-note">📝 ${teks.lblNote}: ${order.catatan}</div>` : ""}
                    ${order.pickup_lat && order.pickup_lng ? `<button class="btn-wa-chat" style="background:#E3F2FD;color:#0D47A1;border-color:#90CAF9;margin-bottom:6px;" onclick="bukaPetaOrderan('${order.pickup_lat}','${order.pickup_lng}','${order.dropoff_lat || ""}','${order.dropoff_lng || ""}','${(order.detail_1 || "").replace(/'/g, "")}','${(order.detail_2 || "").replace(/'/g, "")}')">🗺️ Preview Peta</button>` : ""}
                    <button class="btn-ambil" onclick="ambilOrderan('${order.id}','${order.customer_wa}','${order.customer_nama}')">${teks.btnAmbil}</button>
                </div>`;
      listRadar.appendChild(kartu);
    }
  });

  document.getElementById("statJalan").innerText = statJalan;
  document.getElementById("statSelesai").innerText = statSelesai;

  if (mainkanSuara) {
    const audio = document.getElementById("suaraNotif");
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  if (!adaOrderBaru) {
    listRadar.innerHTML = `<div class="empty-state"><span class="empty-icon">☕</span><div class="empty-title">${teks.emptyRadar.replace("<br>", " ")}</div></div>`;
  }
  if (!adaOrderAktif) {
    listAktif.innerHTML = `<div class="empty-state"><span class="empty-icon">📭</span><div class="empty-title">${teks.emptyAktif}</div></div>`;
  }
}

window.toggleHistory = function (id) {
  const detail = document.getElementById("hist-det-" + id);
  const tombol = document.getElementById("hist-btn-" + id);
  const teks = langDict[state.currentLang];
  if (detail.classList.contains("show")) {
    detail.classList.remove("show");
    tombol.innerHTML = teks.btnDetail;
  } else {
    detail.classList.add("show");
    tombol.innerHTML = teks.btnTutupDetail;
  }
};

export function renderRiwayatDriver() {
  const teks = langDict[state.currentLang];
  const listEl = document.getElementById("listHistoryDriver");
  listEl.innerHTML = "";

  let totalRating = 0;
  let jumlahRating = 0;
  let adaRiwayat = false;

  state.latestOrdersData.forEach((order) => {
    if (order.driver_nama !== state.namaDriverAktif) return;
    if (order.status !== "selesai" && order.status !== "diambil") return;

    adaRiwayat = true;
    if (order.rating) {
      totalRating += parseInt(order.rating);
      jumlahRating++;
    }

    const kelasPill = order.status === "selesai" ? "hc-pill-done" : "hc-pill-ongoing";
    const labelPill = order.status === "selesai" ? teks.pillDone : teks.pillOngoing;
    const blokRating = order.rating
      ? `<div class="hc-rating">⭐ ${order.rating} ${teks.starTxt} ${order.ulasan ? ` · "${order.ulasan}"` : ""}</div>`
      : order.status === "selesai"
        ? `<div class="hc-no-rating">${teks.noRating || ""}</div>`
        : "";

    const kartu = document.createElement("div");
    kartu.className = "hist-card";
    kartu.innerHTML = `
            <div class="hc-top"><div class="hc-service">${order.layanan || ""}</div><div class="hc-time">${order.waktu_order || ""}</div></div>
            <span class="hc-pill ${kelasPill}">${labelPill}</span>
            <div class="hc-customer">${teks.histCust} ${order.customer_nama || ""}</div>
            <button class="hc-toggle-btn" id="hist-btn-${order.id}" onclick="toggleHistory('${order.id}')">${teks.btnDetail}</button>
            <div class="hc-details" id="hist-det-${order.id}">
                <div class="hc-route-box">${order.detail_1 || ""}<br>⬇<br>${order.detail_2 || ""}</div>
                ${order.jarak_km ? `<div class="oc-jarak-ongkos" style="margin-top:8px;"><span>📏 ${order.jarak_km} km${order.durasi_menit ? " · ⏱️ ~" + order.durasi_menit + " mnt" : ""}</span><span class="oc-jo-harga">💰 Rp ${hitungOngkos(order).toLocaleString("id-ID")}</span></div>` : ""}
                ${blokRating}
            </div>`;
    listEl.appendChild(kartu);
  });

  document.getElementById("avgRatingDisplay").innerText = jumlahRating > 0 ? (totalRating / jumlahRating).toFixed(1) : "0.0";
  if (!adaRiwayat) {
    listEl.innerHTML = `<div class="empty-state"><span class="empty-icon">📭</span><div class="empty-title">${teks.emptyHistory}</div></div>`;
  }
}

function formatNomorWa(nomor) {
  const bersih = String(nomor || "").replace(/\D/g, "");
  if (bersih.startsWith("0")) return "62" + bersih.slice(1);
  if (bersih.startsWith("62")) return bersih;
  return "62" + bersih;
}

window.chatUlang = function (nomor) {
  window.open(`https://wa.me/${formatNomorWa(nomor)}`, "_blank");
};

window.ambilOrderan = function (orderId, customerWa, customerNama) {
  const teks = langDict[state.currentLang];
  const order = state.latestOrdersData.find((o) => o.id === orderId);
  const potonganAmbil = hitungTotalPotonganAmbil(order);
  const potonganBpjs = hitungPotonganBpjs(state.ikutBpjsAktif);
  const totalPotongan = potonganAmbil + potonganBpjs;

  if (state.saldoDriverAktif < totalPotongan) {
    alert(teks.alertSaldoHabis);
    return;
  }

  runTransaction(ref(database, "orders/" + orderId), (order) => {
    if (order && (order.status === "terbuka" || order.status === "diterima_resto")) {
      order.status = "diambil";
      order.driver_nama = state.namaDriverAktif;
      order.driver_wa = state.waDriverAktif;
      order.waktu_diambil = Date.now();
      order.bpjs_potongan = potonganBpjs;
      return order;
    }
  })
    .then((hasil) => {
      if (hasil.committed) {
        update(ref(database, `drivers/${state.waDriverAktif}`), { saldo: state.saldoDriverAktif - totalPotongan });
        if (potonganBpjs > 0) tambahTabunganBpjs(state.waDriverAktif, state.tabunganBpjsAktif, potonganBpjs);
        alert(teks.alertSuccess.replace(/Rp\s?1[.,]000/, "Rp " + totalPotongan.toLocaleString("id-ID")));
        push(ref(database, `chats/${orderId}`), {
          from: "driver",
          nama: state.namaDriverAktif,
          teks: `${teks.waTemplate1}${customerNama}${teks.waTemplate2}${state.namaDriverAktif}${teks.waTemplate3}`,
          waktu: Date.now(),
        });
        tambahOrderDilacak(orderId);
      } else {
        alert(teks.alertLate);
      }
    })
    .catch((err) => alert("Error: " + err));
};

window.batalAmbilOrderan = function (orderId) {
  const teks = langDict[state.currentLang];
  const order = state.latestOrdersData.find((o) => o.id === orderId);
  const potonganAmbil = hitungTotalPotonganAmbil(order);
  const potonganBpjs = order?.bpjs_potongan || 0;
  const totalPengembalian = potonganAmbil + potonganBpjs;

  if (!confirm(teks.alertCancelConf.replace(/Rp\s?1[.,]000/, "Rp " + totalPengembalian.toLocaleString("id-ID")))) return;

  const statusBaru = order && order.resto_id ? "diterima_resto" : "terbuka";
  update(ref(database, "orders/" + orderId), { status: statusBaru, driver_nama: "" })
    .then(() => {
      update(ref(database, `drivers/${state.waDriverAktif}`), { saldo: state.saldoDriverAktif + totalPengembalian });
      if (potonganBpjs > 0) batalkanTabunganBpjs(state.waDriverAktif, state.tabunganBpjsAktif, potonganBpjs);
      alert(teks.alertCancelSucc);
      hapusOrderDilacak(orderId);
      hapusOrderDariGeofence(orderId);
    })
    .catch((err) => alert("Error: " + err));
};

window.selesaikanOrderanDriver = function (orderId) {
  const teks = langDict[state.currentLang];
  if (!confirm(teks.alertCompleteConf)) return;
  update(ref(database, "orders/" + orderId), { status: "selesai" }).then(() => {
    hapusOrderDilacak(orderId);
    hapusOrderDariGeofence(orderId);
  });
};

window.setujuiPembatalanCustomer = function (orderId) {
  const order = state.latestOrdersData.find((o) => o.id === orderId);
  const potonganAmbil = hitungTotalPotonganAmbil(order);
  const potonganBpjs = order?.bpjs_potongan || 0;
  const totalPengembalian = potonganAmbil + potonganBpjs;

  if (!confirm(`ACC pembatalan? Saldo Rp${totalPengembalian.toLocaleString("id-ID")} yang terpotong akan dikembalikan ke saldo kamu.`)) return;

  update(ref(database, "orders/" + orderId), { status: "batal_cust", minta_batal_customer: false })
    .then(() => {
      update(ref(database, `drivers/${state.waDriverAktif}`), { saldo: state.saldoDriverAktif + totalPengembalian });
      if (potonganBpjs > 0) batalkanTabunganBpjs(state.waDriverAktif, state.tabunganBpjsAktif, potonganBpjs);
      hapusOrderDilacak(orderId);
      hapusOrderDariGeofence(orderId);
    })
    .catch((err) => alert("Error: " + err));
};

window.tolakPembatalanCustomer = function (orderId) {
  if (!confirm("Tolak permintaan pembatalan ini? Orderan akan tetap berjalan.")) return;
  update(ref(database, "orders/" + orderId), { minta_batal_customer: false }).catch((err) => alert("Error: " + err));
};

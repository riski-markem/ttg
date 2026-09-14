import { ref, onValue, update, query, orderByChild, equalTo, limitToLast } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { database } from "./config.js";
import { state } from "./state.js";
import { showFloatingNotifResto } from "./notifications.js";

const BATAS_ORDER_RESTO = 300;
const orderYangSudahBunyi = new Set();
let pemantauanPertamaKali = true;

export function pantauPesananResto() {
  const ordersQuery = query(ref(database, "orders"), orderByChild("resto_id"), equalTo(state.waRestoAktif), limitToLast(BATAS_ORDER_RESTO));

  onValue(ordersQuery, (snapshot) => {
    const daftar = [];
    snapshot.forEach((child) => {
      const order = child.val();
      order.id = child.key;
      daftar.push(order);
    });
    daftar.reverse();
    state.latestOrdersResto = daftar;

    daftar.forEach((order) => {
      if (order.status === "menunggu_resto" && !orderYangSudahBunyi.has(order.id)) {
        orderYangSudahBunyi.add(order.id);
        if (!pemantauanPertamaKali) {
          const audio = document.getElementById("suaraNotifResto");
          if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
          }
          showFloatingNotifResto("🍽️ Pesanan Baru Masuk!", `${order.customer_nama || "Pelanggan"} pesan ${order.layanan || "makanan"}.`);
          if (document.hidden && Notification.permission === "granted") {
            new Notification("🍽️ Pesanan Baru — TulangTulung", {
              body: `${order.customer_nama || "Pelanggan"} pesan ${order.layanan || "makanan"}.`,
              icon: "/logo-resto.png",
              tag: "resto-order-" + order.id,
            });
          }
        }
      }
    });
    pemantauanPertamaKali = false;

    renderPesananResto();
    hitungRingkasanPendapatan();
  });
}

export function formatRupiah(nilai) {
  return "Rp " + (nilai || 0).toLocaleString("id-ID");
}

function hitungRingkasanPendapatan() {
  const sekarang = new Date();
  const orderSelesai = state.latestOrdersResto.filter((order) => order.status === "selesai" && order.timestamp);

  let pendapatanHarian = 0;
  let jumlahHarian = 0;
  let pendapatanBulanan = 0;
  let jumlahBulanan = 0;

  orderSelesai.forEach((order) => {
    const tanggal = new Date(order.timestamp);
    const samaHari = tanggal.getDate() === sekarang.getDate() && tanggal.getMonth() === sekarang.getMonth() && tanggal.getFullYear() === sekarang.getFullYear();
    const samaBulan = tanggal.getMonth() === sekarang.getMonth() && tanggal.getFullYear() === sekarang.getFullYear();
    const subtotal = order.subtotal_makanan || 0;

    if (samaHari) {
      pendapatanHarian += subtotal;
      jumlahHarian++;
    }
    if (samaBulan) {
      pendapatanBulanan += subtotal;
      jumlahBulanan++;
    }
  });

  document.getElementById("txtPendapatanHarian").textContent = formatRupiah(pendapatanHarian);
  document.getElementById("txtJumlahOrderHarian").textContent = jumlahHarian + " pesanan";
  document.getElementById("txtPendapatanBulanan").textContent = formatRupiah(pendapatanBulanan);
  document.getElementById("txtJumlahOrderBulanan").textContent = jumlahBulanan + " pesanan";
}

function renderPesananResto() {
  const listEl = document.getElementById("listPesananResto");
  listEl.innerHTML = "";

  const daftar = state.latestOrdersResto.filter((order) =>
    ["menunggu_resto", "diterima_resto", "diambil", "selesai", "ditolak_resto"].includes(order.status)
  );

  if (daftar.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><span class="empty-icon">📭</span><div class="empty-title">Belum ada pesanan masuk.</div></div>';
    return;
  }

  daftar.forEach((order) => {
    const baris = (order.items ? Object.values(order.items) : [])
      .map(
        (item) =>
          `<div class="oc-item-row"><span>${item.qty}x ${item.nama}${item.opsi_text ? `<br><small style="font-weight:600; color:var(--text3);">${item.opsi_text}</small>` : ""}</span><b>${formatRupiah(item.harga * item.qty)}</b></div>`
      )
      .join("");

    let statusPill = "";
    let tombolAksi = "";
    if (order.status === "menunggu_resto") {
      tombolAksi = `<div class="action-grid">
                <button class="btn-reject" onclick="tolakPesananResto('${order.id}')">✕ Tolak</button>
                <button class="btn-accept" onclick="terimaPesananResto('${order.id}')">✓ Terima</button>
            </div>`;
    } else if (order.status === "diterima_resto") {
      statusPill = '<span class="pill pill-proses">🍳 Sedang disiapkan, menunggu driver</span>';
    } else if (order.status === "diambil") {
      statusPill = `<span class="pill pill-diambil">🛵 Driver ${order.driver_nama || ""} sedang menuju resto</span>`;
    } else if (order.status === "selesai") {
      statusPill = '<span class="pill pill-selesai">✅ Selesai diantar</span>';
    } else if (order.status === "ditolak_resto") {
      statusPill = '<span class="pill pill-tolak">✕ Ditolak</span>';
    }

    const kartu = document.createElement("div");
    kartu.className = "order-card" + (order.status === "menunggu_resto" ? " order-card-new" : "");
    kartu.innerHTML = `
            <div class="oc-header"><span class="oc-badge">${order.waktu_order || ""}</span><span class="oc-time">${order.customer_nama || ""}</span></div>
            <div class="oc-body">
                <div class="oc-cust-name">👤 ${order.customer_nama || ""}</div>
                <div class="oc-items">${baris}<div class="oc-total-row"><span>Total Makanan</span><span>${formatRupiah(order.subtotal_makanan)}</span></div></div>
                ${order.catatan ? `<div class="oc-note">📝 ${order.catatan}</div>` : ""}
                ${statusPill}
                ${tombolAksi}
            </div>`;
    listEl.appendChild(kartu);
  });
}

window.renderPesananResto = renderPesananResto;

window.terimaPesananResto = function (orderId) {
  if (!confirm("Terima pesanan ini? Mulai siapkan makanannya ya.")) return;
  update(ref(database, "orders/" + orderId), { status: "diterima_resto" }).catch((err) => alert("Error: " + err));
};

window.tolakPesananResto = function (orderId) {
  const alasan = prompt("Alasan ditolak (misal: bahan habis) -- opsional:") || "";
  if (!confirm("Tolak pesanan ini?")) return;
  update(ref(database, "orders/" + orderId), { status: "ditolak_resto", alasan_tolak_resto: alasan }).catch((err) => alert("Error: " + err));
};

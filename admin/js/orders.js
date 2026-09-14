import { ref, query, orderByChild, limitToLast, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { database, BIAYA_PLATFORM } from "./config.js";
import { state } from "./state.js";
import { updateKeuStatPemasukan } from "./keuangan.js";
import { inisialisasiRetensi } from "./data-retention.js";

const BATAS_ORDER_DIMUAT = 1000;

let retensiSudahDijalankan = false;

export function muatDataOrder() {
  const ordersQuery = query(ref(database, "orders"), orderByChild("timestamp"), limitToLast(BATAS_ORDER_DIMUAT));

  onValue(
    ordersQuery,
    (snapshot) => {
      state.allOrdersData = [];
      let totalSelesai = 0;
      let totalPendapatan = 0;

      snapshot.forEach((child) => {
        const order = child.val() || {};
        order.id = child.key;
        state.allOrdersData.push(order);

        if (order.status === "selesai") {
          totalSelesai++;
          const kontribusi = BIAYA_PLATFORM + (order.biaya_layanan_makanan || 0) + (order.biaya_layanan_jasa || 0);
          totalPendapatan += kontribusi;
          if (kontribusi % 1000 !== 0) {
            console.warn("[Keuangan] Order dengan kontribusi TIDAK kelipatan Rp1.000:", {
              id: order.id,
              kontribusi,
              biaya_layanan_makanan: order.biaya_layanan_makanan || 0,
              biaya_layanan_jasa: order.biaya_layanan_jasa || 0,
              tipe_order: order.tipe_order || order.jenis_order || "-",
            });
          }
        }
      });

      document.getElementById("adminStatOrder").innerText = totalSelesai;
      document.getElementById("adminStatPendapatan").innerText = "Rp " + totalPendapatan.toLocaleString("id-ID");
      state.totalPemasukanAdminGlobal = totalPendapatan;
      updateKeuStatPemasukan();

      state.allOrdersData.reverse();
      renderOrdersUI();
      hitungRingkasan();

      if (!retensiSudahDijalankan) {
        retensiSudahDijalankan = true;
        inisialisasiRetensi();
      }
    },
    (err) => console.error("Gagal menarik data pesanan:", err)
  );
}

function hitungRingkasan() {
  const elTotal = document.getElementById("ringkasanTotal");
  const elSelesai = document.getElementById("ringkasanSelesai");
  const elBatal = document.getElementById("ringkasanBatal");
  const elLain = document.getElementById("ringkasanLain");
  const elPemasukan = document.getElementById("ringkasanPemasukan");
  if (!elTotal) return;

  const batasWaktu = hitungAwalPeriode(state.periodeRingkasanAktif);

  let total = 0;
  let selesai = 0;
  let batal = 0;
  let lain = 0;
  let pemasukan = 0;

  state.allOrdersData.forEach((order) => {
    if (!order.timestamp || order.timestamp < batasWaktu) return;
    total++;
    if (order.status === "selesai") {
      selesai++;
      pemasukan += BIAYA_PLATFORM + (order.biaya_layanan_makanan || 0) + (order.biaya_layanan_jasa || 0);
    } else if (order.status === "batal" || order.status === "batal_cust") {
      batal++;
    } else {
      lain++;
    }
  });

  elTotal.innerText = total;
  elSelesai.innerText = selesai;
  elBatal.innerText = batal;
  elLain.innerText = lain;
  elPemasukan.innerText = "Rp " + pemasukan.toLocaleString("id-ID");
}

function hitungAwalPeriode(periode) {
  const sekarang = new Date();
  if (periode === "hari") {
    return new Date(sekarang.getFullYear(), sekarang.getMonth(), sekarang.getDate()).getTime();
  }
  if (periode === "minggu") {
    const hari = sekarang.getDay();
    const offset = hari === 0 ? 6 : hari - 1;
    return new Date(sekarang.getFullYear(), sekarang.getMonth(), sekarang.getDate() - offset).getTime();
  }
  return new Date(sekarang.getFullYear(), sekarang.getMonth(), 1).getTime();
}

window.pilihPeriodeRingkasan = function (periode) {
  state.periodeRingkasanAktif = periode;
  document.getElementById("btnPeriodeHari").classList.toggle("selected", periode === "hari");
  document.getElementById("btnPeriodeMinggu").classList.toggle("selected", periode === "minggu");
  document.getElementById("btnPeriodeBulan").classList.toggle("selected", periode === "bulan");
  hitungRingkasan();
};

window.renderOrdersUI = function () {
  const listEl = document.getElementById("listOrders");
  if (!listEl) return;
  listEl.innerHTML = "";

  const kataKunci = (document.getElementById("searchOrder")?.value || "").toLowerCase();
  const statusFilter = document.getElementById("filterStatusOrder")?.value || "";
  const kotaFilter = document.getElementById("filterKotaOrder")?.value || "";

  perbaruiFilterKota();

  const daftar = state.allOrdersData.filter((order) => {
    const cocokStatus = !statusFilter || order.status === statusFilter;
    const cocokKota = !kotaFilter || order.kota === kotaFilter;
    const cocokKataKunci =
      !kataKunci ||
      [order.customer_nama, order.driver_nama, order.resto_nama, order.layanan, order.customer_wa]
        .map((v) => (v || "").toString().toLowerCase())
        .join(" ")
        .includes(kataKunci);
    return cocokStatus && cocokKota && cocokKataKunci;
  });

  if (daftar.length === 0) {
    listEl.innerHTML = "<p style='font-weight:600; color:#7f8c8d;'>Tidak ada pesanan yang cocok dengan pencarian/filter ini.</p>";
    return;
  }

  daftar.forEach((order) => {
    listEl.appendChild(buatKartuOrder(order));
  });
};

function perbaruiFilterKota() {
  const select = document.getElementById("filterKotaOrder");
  if (!select) return;
  const kotaSet = new Set(state.allOrdersData.map((order) => order.kota).filter(Boolean));
  const nilaiSaatIni = select.value;
  select.innerHTML =
    '<option value="">Semua Kota</option>' +
    [...kotaSet].sort().map((kota) => `<option value="${kota}">${kota}</option>`).join("");
  if (kotaSet.has(nilaiSaatIni)) select.value = nilaiSaatIni;
}

function buatKartuOrder(order) {
  const status = order.status || "pending";
  const warnaStatus =
    status === "selesai" ? "#27ae60" : status === "batal" || status === "batal_cust" ? "#e74c3c" : status === "diambil" ? "#2980b9" : "#f39c12";

  let waktuTampil = order.waktu_order || "";
  if (order.timestamp) {
    const tanggal = new Date(order.timestamp);
    waktuTampil = `${tanggal.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} - ${tanggal.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} WIB`;
  }

  const blokUlasan = order.ulasan
    ? `
            <div class="card-detail" style="margin-top:10px; background:#fdf2e9; padding:12px; border-radius:8px; border-left:4px solid #8e44ad; color:#8e44ad; font-style:italic; font-weight:700;">
                💬 <b>Ulasan Pelanggan:</b><br>"${order.ulasan}"
            </div>
        `
    : "";

  const biayaLayanan = (order.biaya_layanan_makanan || 0) + (order.biaya_layanan_jasa || 0);
  const blokBiayaLayanan =
    biayaLayanan > 0 ? `<div class="card-detail">🧾 Biaya Layanan (dari customer): <b>Rp ${biayaLayanan.toLocaleString("id-ID")}</b></div>` : "";

  const statusFinal = ["selesai", "batal", "batal_cust", "ditolak_resto"].includes(order.status);
  const lewatDuaJam = order.timestamp && Date.now() - order.timestamp > 7200000;
  const blokPeringatanMacet =
    !statusFinal && lewatDuaJam
      ? '<div class="card-detail" style="margin-top:8px; color:#c0392b; font-weight:800; background:#fdecea; padding:8px; border-radius:6px; border:1px solid #f5b7b1;">⚠️ Order ini sudah lebih dari 2 jam belum selesai -- cek kemungkinan macet.</div>'
      : "";

  let tombolAksi = "";
  if (!statusFinal) {
    tombolAksi += `<button class="btn-suspend" style="flex:1;" onclick="batalkanPaksaOrder('${order.id}')">🛑 Batalkan Paksa</button>`;
    if (order.status === "diambil") {
      tombolAksi += `<button class="btn-setuju" style="flex:1;" onclick="paksaSelesaikanOrder('${order.id}')">✅ Tandai Selesai (Paksa)</button>`;
    }
  }

  const customerWa = order.customer_wa || "00";
  const kartu = document.createElement("div");
  kartu.className = "card";
  kartu.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                <span style="font-size:11px; color:#7f8c8d; font-weight:800;">${waktuTampil}</span>
                <span style="font-size:11px; font-weight:800; color:${warnaStatus}; text-transform:uppercase; padding:3px 8px; border-radius:12px; border:1px solid ${warnaStatus}40; background:${warnaStatus}10;">${status}</span>
            </div>
            <div class="card-title" style="font-size: 16px;">${order.layanan || "Layanan Tidak Diketahui"}</div>
            <div class="card-detail">🏙️ Kota: <b>${order.kota || "⚠️ Tidak diketahui (order lama/gagal geocode)"}</b></div>
            <div class="card-detail">👤 Cust: ${order.customer_nama || "Tanpa Nama"} (<a href="https://wa.me/62${customerWa.substring(1)}" target="_blank" style="color:#2980b9; text-decoration:none;">${customerWa}</a>)</div>
            <div class="card-detail">🛵 Driver: <b>${order.driver_nama || "Belum ada"}</b> ${order.rating ? " (⭐" + order.rating + ")" : ""}</div>
            ${blokBiayaLayanan}
            <div class="card-detail" style="margin-top:12px; background:#f8f9fa; padding:10px; border-radius:6px; border:1px solid #eee;">
                ${order.detail_1 || "-"} <br><span style="color:#bdc3c7;">⬇</span><br> ${order.detail_2 || "-"}
            </div>
            ${order.catatan ? `<div class="card-detail" style="margin-top:8px; color:#d35400; font-weight:700; background:#fff3e0; padding:8px; border-radius:6px;">📝 Catatan: ${order.catatan}</div>` : ""}

            ${blokUlasan}
            ${blokPeringatanMacet}

            ${tombolAksi ? `<div class="action-btns">${tombolAksi}</div>` : ""}
            <div style="margin-top:10px; text-align:right;">
                <button class="btn-hapus" onclick="hapusOrder('${order.id}')">🗑️ Hapus Data Lama</button>
            </div>
        `;
  return kartu;
}

window.exportToCSV = function () {
  if (state.allOrdersData.length === 0) return alert("Belum ada data pesanan untuk di-download.");

  let csv = "Tanggal & Waktu,Kota,Layanan,Status,Nama Customer,WA Customer,Nama Driver,Detail 1 (Penjemputan),Detail 2 (Tujuan),Catatan,Bintang (Rating),Ulasan\n";

  state.allOrdersData.forEach((order) => {
    let waktu = order.waktu_order || "";
    if (order.timestamp) {
      const tanggal = new Date(order.timestamp);
      waktu = tanggal.toLocaleDateString("id-ID") + " " + tanggal.toLocaleTimeString("id-ID");
    }
    const kolom = (v) => `"${(v || "").toString().replace(/"/g, '""')}"`;
    csv += `${waktu},${kolom(order.kota)},${kolom(order.layanan)},${kolom(order.status)},${kolom(order.customer_nama)},${kolom(order.customer_wa)},${kolom(order.driver_nama)},${kolom(order.detail_1)},${kolom(order.detail_2)},${kolom(order.catatan)},${order.rating || ""},${kolom(order.ulasan)}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", "Laporan_TTG_" + new Date().toLocaleDateString("id-ID") + ".csv");
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

window.hapusOrder = function (orderId) {
  if (!confirm("Yakin hapus data pesanan ini secara permanen?")) return;
  remove(ref(database, `orders/${orderId}`)).catch((err) => alert("Gagal hapus: " + err));
};

window.batalkanPaksaOrder = function (orderId) {
  const order = state.allOrdersData.find((o) => o.id === orderId);
  if (!order) return;

  const alasan = prompt("Alasan pembatalan paksa (opsional, misal: driver hilang kontak):") || "";
  if (!confirm("Batalkan paksa pesanan ini? Tindakan ini untuk order yang macet/tidak ada progres.")) return;

  update(ref(database, `orders/${orderId}`), { status: "batal", alasan_batal_admin: alasan })
    .then(() => {
      if (order.status === "diambil" && order.driver_wa) {
        const pengembalian = BIAYA_PLATFORM + (order.biaya_layanan_jasa || 0);
        const driver = state.allDriversData.find((d) => d.wa === order.driver_wa);
        const saldoSaatIni = (driver && driver.saldo) || 0;
        update(ref(database, `drivers/${order.driver_wa}`), { saldo: saldoSaatIni + pengembalian }).catch((err) =>
          alert("Order dibatalkan, tapi gagal mengembalikan saldo driver: " + err)
        );
      }
      alert("Pesanan dibatalkan paksa.");
    })
    .catch((err) => alert("Gagal: " + err));
};

window.paksaSelesaikanOrder = function (orderId) {
  const order = state.allOrdersData.find((o) => o.id === orderId);
  if (!order) return;

  const biayaMakanan = order.biaya_layanan_makanan || 0;
  let pesanKonfirmasi = "Tandai pesanan ini selesai secara paksa?";
  if (biayaMakanan > 0 && order.driver_wa) {
    pesanKonfirmasi += `\n\nSaldo driver akan otomatis terpotong Rp ${biayaMakanan.toLocaleString("id-ID")} (biaya layanan makanan).`;
  }
  if (!confirm(pesanKonfirmasi)) return;

  update(ref(database, `orders/${orderId}`), { status: "selesai" })
    .then(() => {
      if (biayaMakanan > 0 && order.driver_wa) {
        const driver = state.allDriversData.find((d) => d.wa === order.driver_wa);
        const saldoSaatIni = (driver && driver.saldo) || 0;
        update(ref(database, `drivers/${order.driver_wa}`), { saldo: saldoSaatIni - biayaMakanan }).catch((err) =>
          alert("Order ditandai selesai, tapi gagal memotong saldo driver: " + err)
        );
      }
      alert("Pesanan ditandai selesai.");
    })
    .catch((err) => alert("Gagal: " + err));
};

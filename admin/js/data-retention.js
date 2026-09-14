import { ref, update } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { database } from "./config.js";
import { state } from "./state.js";

const STATUS_FINAL = ["selesai", "batal", "batal_cust", "ditolak_resto"];
const KEY_RETENSI_HARI = "ttg_admin_retensi_hari";
const KEY_RETENSI_TERAKHIR = "ttg_admin_retensi_terakhir";

let retensiSudahDicek = false;

export function ambilRetensiHari() {
  const nilai = parseInt(localStorage.getItem(KEY_RETENSI_HARI) || "");
  return Number.isFinite(nilai) && nilai >= 7 ? nilai : 30;
}

export function inisialisasiRetensi() {
  const input = document.getElementById("inputRetensiHari");
  if (input && !input.dataset.terisi) {
    input.value = ambilRetensiHari();
    input.dataset.terisi = "1";
  }
  perbaruiInfoTerakhir();

  if (retensiSudahDicek) return;
  retensiSudahDicek = true;

  const tanggalTerakhir = localStorage.getItem(KEY_RETENSI_TERAKHIR);
  const hariIni = new Date().toDateString();
  if (tanggalTerakhir === hariIni) return;

  jalankanPembersihan(false);
}

function jalankanPembersihan(manual) {
  const retensiHari = ambilRetensiHari();
  const batasWaktu = Date.now() - retensiHari * 24 * 60 * 60 * 1000;
  const dataKedaluwarsa = (state.allOrdersData || []).filter(
    (order) => STATUS_FINAL.includes(order.status) && order.timestamp && order.timestamp < batasWaktu
  );

  if (dataKedaluwarsa.length === 0) {
    catatWaktuJalan();
    perbaruiInfoTerakhir(0);
    if (manual) alert("Tidak ada data pesanan lama yang perlu dihapus saat ini.");
    return;
  }

  if (manual && !confirm(`${dataKedaluwarsa.length} pesanan selesai/batal (lebih dari ${retensiHari} hari) akan dihapus permanen. Lanjutkan?`)) {
    return;
  }

  const pembaruan = {};
  dataKedaluwarsa.forEach((order) => {
    pembaruan[`orders/${order.id}`] = null;
  });

  update(ref(database), pembaruan)
    .then(() => {
      catatWaktuJalan();
      perbaruiInfoTerakhir(dataKedaluwarsa.length);
      if (manual) alert(`Selesai. ${dataKedaluwarsa.length} pesanan lama berhasil dihapus.`);
    })
    .catch((err) => {
      if (manual) alert("Gagal menghapus data lama: " + err.message);
    });
}

function catatWaktuJalan() {
  localStorage.setItem(KEY_RETENSI_TERAKHIR, new Date().toDateString());
}

function perbaruiInfoTerakhir(jumlahDihapus) {
  const info = document.getElementById("infoRetensiTerakhir");
  if (!info) return;
  const tanggal = localStorage.getItem(KEY_RETENSI_TERAKHIR);
  if (!tanggal) {
    info.textContent = "Belum pernah dijalankan.";
    return;
  }
  const keterangan = typeof jumlahDihapus === "number" ? ` (${jumlahDihapus} data dihapus)` : "";
  info.textContent = `Terakhir dijalankan: ${tanggal}${keterangan}`;
}

window.simpanPengaturanRetensi = function () {
  const input = document.getElementById("inputRetensiHari");
  const nilai = parseInt(input.value);
  if (!Number.isFinite(nilai) || nilai < 7) {
    return alert("Minimal retensi 7 hari, biar data verifikasi terbaru tetap aman.");
  }
  localStorage.setItem(KEY_RETENSI_HARI, String(nilai));
  alert(`Pengaturan disimpan: pesanan selesai/batal yang lebih tua dari ${nilai} hari akan dihapus otomatis.`);
};

window.jalankanRetensiSekarang = function () {
  jalankanPembersihan(true);
};

import { ref, query, orderByChild, limitToLast, onValue, push, set, remove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { database } from "./config.js";
import { state } from "./state.js";

const BATAS_KEUANGAN_DIMUAT = 1000;

export function updateKeuStatPemasukan() {
  const totalPemasukan = state.totalPemasukanAdminGlobal + state.totalPemasukanManualGlobal;
  const elPemasukan = document.getElementById("keuStatPemasukan");
  const elSaldo = document.getElementById("keuStatSaldo");
  if (elPemasukan) elPemasukan.innerText = "Rp " + totalPemasukan.toLocaleString("id-ID");
  if (elSaldo) elSaldo.innerText = "Rp " + (totalPemasukan - state.totalPengeluaranManualGlobal).toLocaleString("id-ID");
}

export function muatDataKeuangan() {
  const keuanganQuery = query(ref(database, "keuangan"), orderByChild("timestamp"), limitToLast(BATAS_KEUANGAN_DIMUAT));

  onValue(
    keuanganQuery,
    (snapshot) => {
      state.allKeuanganData = [];
      let totalPemasukan = 0;
      let totalPengeluaran = 0;

      snapshot.forEach((child) => {
        const transaksi = child.val() || {};
        transaksi.id = child.key;
        state.allKeuanganData.push(transaksi);
        if (transaksi.jenis === "pemasukan") {
          totalPemasukan += transaksi.nominal || 0;
        } else {
          totalPengeluaran += transaksi.nominal || 0;
        }
      });

      state.totalPemasukanManualGlobal = totalPemasukan;
      state.totalPengeluaranManualGlobal = totalPengeluaran;
      document.getElementById("keuStatPengeluaran").innerText = "Rp " + totalPengeluaran.toLocaleString("id-ID");
      updateKeuStatPemasukan();
      renderKeuangan();
    },
    (err) => console.error("Gagal menarik data keuangan:", err)
  );
}

window.pilihJenisKeuangan = function (jenis) {
  state.jenisKeuanganAktif = jenis;
  document.getElementById("btnJenisPemasukan").classList.toggle("selected", jenis === "pemasukan");
  document.getElementById("btnJenisPengeluaran").classList.toggle("selected", jenis === "pengeluaran");
};

window.simpanTransaksiKeuangan = function () {
  const keterangan = document.getElementById("keuKeterangan").value.trim();
  const nominal = parseInt(document.getElementById("keuNominal").value);

  if (!keterangan) return alert("Isi keterangan transaksinya dulu lur!");
  if (!nominal || nominal <= 0) return alert("Masukkan nominal yang benar!");

  const entriBaru = push(ref(database, "keuangan"));
  set(entriBaru, {
    jenis: state.jenisKeuanganAktif,
    keterangan,
    nominal,
    timestamp: Date.now(),
  })
    .then(() => {
      document.getElementById("keuKeterangan").value = "";
      document.getElementById("keuNominal").value = "";
    })
    .catch((err) => alert("Gagal simpan transaksi: " + err));
};

window.renderKeuangan = function () {
  const listEl = document.getElementById("listKeuangan");
  listEl.innerHTML = "";

  if (state.allKeuanganData.length === 0) {
    listEl.innerHTML = "<p style='font-weight:600; color:#7f8c8d;'>Urung ana transaksi keuangan.</p>";
    return;
  }

  [...state.allKeuanganData]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .forEach((transaksi) => {
      const isPemasukan = transaksi.jenis === "pemasukan";
      const warna = isPemasukan ? "#27ae60" : "#e74c3c";
      const tanda = isPemasukan ? "+" : "-";

      let waktu = "-";
      if (transaksi.timestamp) {
        const tanggal = new Date(transaksi.timestamp);
        waktu =
          tanggal.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) +
          " - " +
          tanggal.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
      }

      const kartu = document.createElement("div");
      kartu.className = "card";
      kartu.style.borderTopColor = warna;
      kartu.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="font-size:11px; color:#7f8c8d; font-weight:800;">${waktu}</span>
                <span style="font-size:11px; font-weight:800; color:${warna}; text-transform:uppercase; padding:3px 8px; border-radius:12px; border:1px solid ${warna}40; background:${warna}10;">${isPemasukan ? "PEMASUKAN" : "PENGELUARAN"}</span>
            </div>
            <div class="card-title" style="font-size:15px;">${transaksi.keterangan || "-"}</div>
            <div class="nominal-besar" style="color:${warna};">${tanda} Rp ${(transaksi.nominal || 0).toLocaleString("id-ID")}</div>
            <div style="text-align:right; margin-top:10px;">
                <button class="btn-hapus" onclick="hapusKeuangan('${transaksi.id}')">🗑️ Hapus</button>
            </div>
        `;
      listEl.appendChild(kartu);
    });
};

window.hapusKeuangan = function (id) {
  if (!confirm("Yakin hapus transaksi ini secara permanen?")) return;
  remove(ref(database, `keuangan/${id}`)).catch((err) => alert("Gagal hapus: " + err));
};

window.exportKeuanganCSV = function () {
  if (state.allKeuanganData.length === 0) return alert("Belum ada data transaksi untuk di-download.");

  let csv = "Tanggal & Waktu,Jenis,Keterangan,Nominal\n";
  [...state.allKeuanganData]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .forEach((transaksi) => {
      let waktu = "";
      if (transaksi.timestamp) {
        const tanggal = new Date(transaksi.timestamp);
        waktu = tanggal.toLocaleDateString("id-ID") + " " + tanggal.toLocaleTimeString("id-ID");
      }
      const jenis = transaksi.jenis === "pemasukan" ? "Pemasukan" : "Pengeluaran";
      const keterangan = `"${(transaksi.keterangan || "").replace(/"/g, '""')}"`;
      csv += `${waktu},${jenis},${keterangan},${transaksi.nominal || 0}\n`;
    });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", "Laporan_Keuangan_TTG_" + new Date().toLocaleDateString("id-ID") + ".csv");
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

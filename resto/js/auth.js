import { ref, get, child, set, update } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { database, auth, authSiap, NOMOR_ADMIN_DRIVER } from "./config.js";
import { state } from "./state.js";
import { updateLokasiWarungUI, updateToggleBukaUI } from "./dashboard.js";
import { pantauPesananResto } from "./orders.js";
import { pantauMenuResto } from "./menu.js";
import { setupPushNotificationResto } from "./notifications.js";

function emailDariWa(wa) {
  return wa.replace(/[^0-9]/g, "") + "@resto.mastulung.app";
}

function hapusSesiResto() {
  localStorage.removeItem("ttg_resto");
}

function simpanSesiResto(wa, nama) {
  localStorage.setItem("ttg_resto", JSON.stringify({ wa, nama }));
}

async function pastikanUidTersimpan(wa, data) {
  if (!auth.currentUser || data.uid === auth.currentUser.uid) return;
  try {
    await update(ref(database, `restoran/${wa}`), { uid: auth.currentUser.uid });
  } catch (err) {
    console.error("Gagal menyinkronkan uid resto:", err);
  }
}

function tampilkanDashboard(wa, data) {
  state.namaRestoAktif = data.nama;
  state.waRestoAktif = wa;
  state.statusBukaAktif = data.buka !== false;

  document.getElementById("displayNamaResto").innerText = data.nama;
  document.getElementById("profDisplayNama").innerText = data.nama;
  document.getElementById("profDisplayWA").innerText = wa;

  if (data.foto_profil) {
    document.getElementById("restoFotoProfil").value = data.foto_profil;
    document.getElementById("previewFotoProfilResto").src = data.foto_profil;
    document.getElementById("previewFotoProfilResto").classList.remove("hidden");
    document.getElementById("labelUploadFotoProfilResto").textContent = "📷 Ganti Foto";
    document.getElementById("profAvatarWrap").innerHTML =
      `<img src="${data.foto_profil}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
  }

  updateLokasiWarungUI(data.lat, data.lng);
  updateToggleBukaUI();

  document.getElementById("page-login").classList.add("hidden");
  document.getElementById("page-register").classList.add("hidden");
  document.getElementById("page-dashboard").classList.remove("hidden");

  pantauPesananResto();
  pantauMenuResto();
  setupPushNotificationResto();
}

export async function cekSesiResto() {
  const sesi = localStorage.getItem("ttg_resto");
  if (!sesi) return;

  let data;
  try {
    data = JSON.parse(sesi);
  } catch (err) {
    return hapusSesiResto();
  }
  if (!data.wa || !data.nama) return hapusSesiResto();

  try {
    await authSiap;
    const snap = await get(child(ref(database), `restoran/${data.wa}`));
    if (!snap.exists()) return hapusSesiResto();

    const resto = snap.val();
    if (["pending", "suspend", "ditolak"].includes(resto.status)) return hapusSesiResto();

    await pastikanUidTersimpan(data.wa, resto);
    tampilkanDashboard(data.wa, resto);
  } catch (err) {
    console.error("Auto-login resto gagal:", err);
  }
}

function tanganiLoginSukses(wa, tombol) {
  get(child(ref(database), `restoran/${wa}`))
    .then(async (snap) => {
      if (!snap.exists()) {
        tombol.disabled = false;
        tombol.innerText = "Masuk";
        return alert("Data resto tidak ditemukan. Hubungi admin.");
      }

      const data = snap.val();
      if (data.status === "pending") {
        tombol.disabled = false;
        tombol.innerText = "Masuk";
        return alert("Akun kamu masih menunggu verifikasi admin.");
      }
      if (data.status === "suspend") {
        tombol.disabled = false;
        tombol.innerText = "Masuk";
        return alert("Akun kamu sedang disuspend. Hubungi admin.");
      }
      if (data.status === "ditolak") {
        tombol.disabled = false;
        tombol.innerText = "Masuk";
        return alert(
          "Pendaftaran kamu ditolak admin." +
            (data.alasan_tolak ? " Alasan: " + data.alasan_tolak : "") +
            " Hubungi admin untuk info lebih lanjut."
        );
      }

      await pastikanUidTersimpan(wa, data);
      simpanSesiResto(wa, data.nama);
      tampilkanDashboard(wa, data);
      tombol.disabled = false;
      tombol.innerText = "Masuk";
    })
    .catch((err) => {
      tombol.disabled = false;
      tombol.innerText = "Masuk";
      alert("Error: " + err.message);
    });
}

function migrasiAkunLama(wa, pass, tombol) {
  get(child(ref(database), `restoran/${wa}`))
    .then((snap) => {
      if (!snap.exists() || snap.val().password !== pass) {
        tombol.disabled = false;
        tombol.innerText = "Masuk";
        return alert("No. WA atau kata sandi salah.");
      }
      return createUserWithEmailAndPassword(auth, emailDariWa(wa), pass)
        .then((credential) => update(ref(database, "restoran/" + wa), { password: null, uid: credential.user.uid }))
        .then(() => tanganiLoginSukses(wa, tombol));
    })
    .catch((err) => {
      tombol.disabled = false;
      tombol.innerText = "Masuk";
      alert("Error migrasi akun: " + err.message);
    });
}

window.tampilDaftar = function () {
  document.getElementById("page-login").classList.add("hidden");
  document.getElementById("page-register").classList.remove("hidden");
};

window.tampilLogin = function () {
  document.getElementById("page-register").classList.add("hidden");
  document.getElementById("page-login").classList.remove("hidden");
};

window.prosesDaftar = function () {
  const nama = document.getElementById("regNama").value.trim();
  const wa = document.getElementById("regWA").value.trim();
  const alamat = document.getElementById("regAlamat").value.trim();
  const pass = document.getElementById("regPass").value;
  const setuju = document.getElementById("chkSetujuResto").checked;

  if (!nama || !wa || !alamat || !pass) return alert("Mohon lengkapi semua data.");
  if (pass.length < 6) return alert("Kata sandi minimal 6 karakter.");
  if (!setuju) return alert("Mohon centang persetujuan dulu ya.");

  const tombol = document.getElementById("ui-btn-reg");
  tombol.disabled = true;
  tombol.innerText = "Loading... ⏳";

  get(child(ref(database), `restoran/${wa}`))
    .then((snap) => {
      if (snap.exists()) {
        tombol.disabled = false;
        tombol.innerText = "Daftar Sekarang";
        return alert("No. WA ini sudah terdaftar sebagai resto.");
      }
      return createUserWithEmailAndPassword(auth, emailDariWa(wa), pass)
        .then((credential) =>
          set(ref(database, "restoran/" + wa), {
            nama,
            wa,
            alamat,
            status: "pending",
            buka: true,
            uid: credential.user.uid,
            tanggal_daftar: new Date().toLocaleDateString("id-ID"),
          })
        )
        .then(() => {
          alert("Pendaftaran terkirim! Tunggu verifikasi admin ya (biasanya cepat, apalagi kalau kamu konfirmasi via WA).");
          window.tampilLogin();
          document.getElementById("loginWA").value = wa;
          tombol.disabled = false;
          tombol.innerText = "Daftar Sekarang";

          const pesan = `Halo Admin TulangTulung.id, saya ${nama} (WA: ${wa}) baru saja mendaftar sebagai Mitra Resto melalui aplikasi. Mohon segera diverifikasi/di-ACC ya. Terima kasih!`;
          window.open(`https://wa.me/${NOMOR_ADMIN_DRIVER}?text=${encodeURIComponent(pesan)}`, "_blank");
        });
    })
    .catch((err) => {
      tombol.disabled = false;
      tombol.innerText = "Daftar Sekarang";
      if (err.code === "auth/email-already-in-use") return alert("No. WA ini sudah pernah dipakai daftar sebelumnya.");
      alert("Error: " + err.message);
    });
};

window.prosesLogin = function () {
  const wa = document.getElementById("loginWA").value.trim();
  const pass = document.getElementById("loginPass").value;
  if (!wa || !pass) return alert("Mohon isi No. WA & kata sandi.");

  const tombol = document.getElementById("ui-btn-login");
  tombol.disabled = true;
  tombol.innerText = "Loading... ⏳";

  signInWithEmailAndPassword(auth, emailDariWa(wa), pass)
    .then(() => tanganiLoginSukses(wa, tombol))
    .catch((err) => {
      if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
        return migrasiAkunLama(wa, pass, tombol);
      }
      if (err.code === "auth/wrong-password") {
        tombol.disabled = false;
        tombol.innerText = "Masuk";
        return alert("No. WA atau kata sandi salah.");
      }
      tombol.disabled = false;
      tombol.innerText = "Masuk";
      alert("Error: " + err.message);
    });
};

window.logoutResto = function () {
  if (!confirm("Yakin mau keluar akun?")) return;
  hapusSesiResto();
  signOut(auth).finally(() => location.reload());
};

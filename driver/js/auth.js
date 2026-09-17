import { ref, get, child, set, update } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { database, auth, authSiap, NOMOR_ADMIN_DRIVER } from "./config.js";
import { state } from "./state.js";
import { langDict } from "./i18n.js";
import { navigasiKe, muatPengaturanSuara } from "./navigation.js";
import { pantauSaldoDriver } from "./wallet.js";
import { pantauOrderanMasuk } from "./orders.js";
import { setupPushNotification } from "./notifications.js";
import { tentukanKotaDariKoordinat } from "./geo.js";
import { muatPengaturanBpjs } from "./bpjs.js";

function emailDariWa(wa) {
  return wa.replace(/[^0-9]/g, "") + "@driver.mastulung.app";
}

export function simpanSesiDriver(wa, nama) {
  localStorage.setItem("ttg_driver", JSON.stringify({ wa, nama }));
}

export function hapusSesiDriver() {
  localStorage.removeItem("ttg_driver");
}

async function pastikanUidTersimpan(wa, data) {
  if (!auth.currentUser || data.uid === auth.currentUser.uid) return;
  try {
    await update(ref(database, `drivers/${wa}`), { uid: auth.currentUser.uid });
  } catch (err) {
    console.error("Gagal menyinkronkan uid driver:", err);
  }
}

function tampilkanDashboard(wa, data) {
  state.namaDriverAktif = data.nama;
  state.waDriverAktif = wa;
  state.kotaDriverAktif = data.kota || null;
  document.getElementById("displayNamaDriver").innerText = data.nama;
  document.getElementById("profDisplayNama").innerText = data.nama;
  document.getElementById("profDisplayWA").innerText = wa;
  document.getElementById("page-login").classList.add("hidden");
  document.getElementById("app-main").classList.remove("hidden");
  navigasiKe("radar");
  muatPengaturanSuara();
  muatPengaturanBpjs();
  pantauSaldoDriver();
  pantauOrderanMasuk();
  setupPushNotification();
}

export async function periksaSesiDriver() {
  const sesi = localStorage.getItem("ttg_driver");
  if (!sesi) return;

  let data;
  try {
    data = JSON.parse(sesi);
  } catch (err) {
    return hapusSesiDriver();
  }
  if (!data.wa || !data.nama) return hapusSesiDriver();

  try {
    await authSiap;
    const snap = await get(child(ref(database), `drivers/${data.wa}`));
    if (!snap.exists()) return hapusSesiDriver();

    const driver = snap.val();
    if (["pending", "suspend", "ditolak"].includes(driver.status)) return hapusSesiDriver();

    await pastikanUidTersimpan(data.wa, driver);
    tampilkanDashboard(data.wa, driver);
  } catch (err) {
    console.error("Auto-login gagal:", err);
  }
}

function tanganiLoginSukses(wa, tombol, dict) {
  get(child(ref(database), `drivers/${wa}`))
    .then(async (snap) => {
      if (!snap.exists()) {
        tombol.disabled = false;
        tombol.innerText = dict.btnLogin;
        return alert("Data driver tidak ditemukan. Hubungi admin.");
      }

      const data = snap.val();
      if (data.status === "pending") {
        tombol.disabled = false;
        tombol.innerText = dict.btnLogin;
        return alert(dict.alertPending);
      }
      if (data.status === "suspend") {
        tombol.disabled = false;
        tombol.innerText = dict.btnLogin;
        return alert(dict.alertSuspend);
      }
      if (data.status === "ditolak") {
        tombol.disabled = false;
        tombol.innerText = dict.btnLogin;
        return alert(dict.alertDitolak);
      }

      await pastikanUidTersimpan(wa, data);
      simpanSesiDriver(wa, data.nama);
      tampilkanDashboard(wa, data);
      document.getElementById("suaraNotif").play().catch(() => {});
      tombol.disabled = false;
      tombol.innerText = dict.btnLogin;
    })
    .catch((err) => {
      tombol.disabled = false;
      tombol.innerText = dict.btnLogin;
      alert("Error: " + err.message);
    });
}

function migrasiAkunLama(wa, pass, tombol, dict) {
  get(child(ref(database), `drivers/${wa}`))
    .then((snap) => {
      if (!snap.exists() || snap.val().password !== pass) {
        tombol.disabled = false;
        tombol.innerText = dict.btnLogin;
        return alert(dict.alertWrong);
      }
      return createUserWithEmailAndPassword(auth, emailDariWa(wa), pass)
        .then((credential) => update(ref(database, "drivers/" + wa), { password: null, uid: credential.user.uid }))
        .then(() => tanganiLoginSukses(wa, tombol, dict));
    })
    .catch((err) => {
      tombol.disabled = false;
      tombol.innerText = dict.btnLogin;
      alert("Gagal memigrasi akun lama: " + err.message);
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

window.prosesDaftar = async function () {
  const dict = langDict[state.currentLang];
  const nama = document.getElementById("regNama").value.trim();
  const wa = document.getElementById("regWA").value.trim();
  const pass = document.getElementById("regPass").value;
  const setuju = document.getElementById("chkSetuju").checked;

  if (!nama || !wa || !pass) return alert(dict.alertIsi);
  if (pass.length < 6) return alert(dict.alertPass);
  if (!setuju) return alert(dict.alertTnc);

  const tombol = document.getElementById("ui-btn-reg");
  tombol.disabled = true;
  tombol.innerText = "Loading... ⏳";

  let kota = null;
  if (navigator.geolocation) {
    tombol.innerText = "📍 Mendeteksi wilayah...";
    kota = await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => resolve(await tentukanKotaDariKoordinat(pos.coords.latitude, pos.coords.longitude)),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 }
      );
    });
  }
  tombol.innerText = "Loading... ⏳";

  try {
    const existing = await get(child(ref(database), `drivers/${wa}`));
    if (existing.exists()) {
      tombol.disabled = false;
      tombol.innerText = dict.btnReg;
      return alert(dict.alertRegExist);
    }

    const credential = await createUserWithEmailAndPassword(auth, emailDariWa(wa), pass);
    await set(ref(database, "drivers/" + wa), {
      nama,
      status: "pending",
      saldo: 0,
      kota,
      uid: credential.user.uid,
      tanggal_daftar: new Date().toLocaleDateString("id-ID"),
    });

    alert(dict.alertRegWait);
    window.tampilLogin();
    document.getElementById("loginWA").value = wa;
    tombol.disabled = false;
    tombol.innerText = dict.btnReg;

    const pesan = `Halo Admin TulangTulung.id, saya ${nama} (WA: ${wa}) baru saja mendaftar sebagai Mitra Driver melalui aplikasi. Mohon untuk segera diverifikasi/di-ACC ya. Terima kasih!`;
    window.open(`https://wa.me/${NOMOR_ADMIN_DRIVER}?text=${encodeURIComponent(pesan)}`, "_blank");
  } catch (err) {
    tombol.disabled = false;
    tombol.innerText = dict.btnReg;
    if (err.code === "auth/email-already-in-use") return alert("No. WA ini sudah pernah dipakai daftar sebelumnya.");
    alert("Error: " + err.message);
  }
};

window.prosesLogin = function () {
  const dict = langDict[state.currentLang];
  const wa = document.getElementById("loginWA").value.trim();
  const pass = document.getElementById("loginPass").value;
  if (!wa || !pass) return alert(dict.alertIsi);

  const tombol = document.getElementById("ui-btn-login");
  tombol.disabled = true;
  tombol.innerText = "Loading... ⏳";

  signInWithEmailAndPassword(auth, emailDariWa(wa), pass)
    .then(() => tanganiLoginSukses(wa, tombol, dict))
    .catch((err) => {
      if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
        return migrasiAkunLama(wa, pass, tombol, dict);
      }
      if (err.code === "auth/wrong-password") {
        tombol.disabled = false;
        tombol.innerText = dict.btnLogin;
        return alert(dict.alertWrong);
      }
      tombol.disabled = false;
      tombol.innerText = dict.btnLogin;
      alert("Error: " + err.message);
    });
};

window.keluarAplikasi = function () {
  const teks = state.currentLang === "en" ? "Logout?" : "Yakin arep metu seka aplikasi?";
  if (!confirm(teks)) return;

  state.namaDriverAktif = "";
  state.waDriverAktif = "";
  state.kotaDriverAktif = null;
  document.getElementById("loginPass").value = "";
  hapusSesiDriver();
  signOut(auth).catch(() => {});
  document.getElementById("app-main").classList.add("hidden");
  document.getElementById("page-login").classList.remove("hidden");
};

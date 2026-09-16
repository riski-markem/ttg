import { state } from "./state.js";
import { navigasiKe } from "./navigation.js";
import { pantauDataPesenanWarga } from "./orders.js";
import { setupPushNotification } from "./notifications.js";
import { authSiap } from "./config.js";

export function getIzinWaDefault() {
  return localStorage.getItem("ttg_izin_wa_default") === "1";
}

window.toggleIzinWaDefault = function () {
  const el = document.getElementById("switchIzinWaDefault");
  const aktif = !el.classList.contains("on");
  el.classList.toggle("on", aktif);
  localStorage.setItem("ttg_izin_wa_default", aktif ? "1" : "0");
};

export function renderSwitchIzinWaDefault() {
  const el = document.getElementById("switchIzinWaDefault");
  if (el) el.classList.toggle("on", getIzinWaDefault());
}

export function resetIzinWaOrderToggle() {
  const el = document.getElementById("switchIzinWaOrder");
  if (el) el.classList.toggle("on", getIzinWaDefault());
}

export async function periksaLogin() {
  const sesiTersimpan = localStorage.getItem("ttg_customer");
  if (!sesiTersimpan) return;

  state.userAktif = JSON.parse(sesiTersimpan);
  document.getElementById("displayNama").innerText = state.userAktif.nama;
  document.getElementById("profileNama").innerText = state.userAktif.nama;
  document.getElementById("profileWA").innerText = state.userAktif.wa;
  document.getElementById("page-login").classList.add("hidden");
  document.getElementById("app-main").classList.remove("hidden");
  renderSwitchIzinWaDefault();

  await authSiap;
  pantauDataPesenanWarga();
  setupPushNotification();
}

window.masukAplikasi = async function () {
  const nama = document.getElementById("inputNama").value.trim();
  const wa = document.getElementById("inputWA").value.trim();

  if (!nama || !wa) {
    return alert(state.currentLang === "en" ? "Please fill all fields!" : "Data kudu diisi kabeh lur!");
  }

  state.userAktif = { nama, wa };
  localStorage.setItem("ttg_customer", JSON.stringify(state.userAktif));
  document.getElementById("displayNama").innerText = nama;
  document.getElementById("profileNama").innerText = nama;
  document.getElementById("profileWA").innerText = wa;
  document.getElementById("page-login").classList.add("hidden");
  document.getElementById("app-main").classList.remove("hidden");
  navigasiKe("home");
  renderSwitchIzinWaDefault();

  await authSiap;
  pantauDataPesenanWarga();
  setupPushNotification();
};

window.kaluarAplikasi = function () {
  const konfirmTeks =
    state.currentLang === "en"
      ? "Are you sure you want to logout?"
      : state.currentLang === "ngapak"
      ? "Tenane arep metu (logout)?"
      : "Yakin badé kaluar?";
  if (!confirm(konfirmTeks)) return;

  localStorage.removeItem("ttg_customer");
  state.userAktif = { nama: "", wa: "" };
  document.getElementById("inputNama").value = "";
  document.getElementById("inputWA").value = "";
  document.getElementById("app-main").classList.add("hidden");
  document.getElementById("page-login").classList.remove("hidden");
};

periksaLogin();

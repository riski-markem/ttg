export function escapeHtml(nilai) {
    const div = document.createElement("div");
    div.textContent = nilai === null || nilai === undefined ? "" : String(nilai);
    return div.innerHTML;
}
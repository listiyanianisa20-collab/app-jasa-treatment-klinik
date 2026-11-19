const AUTH_SESSION_KEY = "lsty-admin-session";
const SUPABASE_URL = "https://lszqzprmovabzrwlekzq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_xje_ZSuWI5tb3BHAjTvJPw_VH0FBa9D";
let authSession = null;
let refreshPromise = null;
let authGeneration = 0;

const state = {
  customers: [],
  items: [],
  sales: [],
  cart: [],
  catalogCategory: "Produk",
  catalogSearchQuery: "",
  catalogQuantities: {},
  addedItemId: null,
  report: [],
  reportDiscounts: [],
  reportFinance: { profitLoss: { rows: [] }, ledger: [] },
  activeSale: null,
  activeReceivable: null,
  activeInstallmentNumber: null,
  activeInstallmentAmount: 0,
  receivables: [],
  customerQuery: "",
  salesQuery: "",
  salesStatusFilter: "",
  receivablePaymentReport: { total_kas_masuk: 0, payments: [] },
  bookingScheduleDate: "",
  bookingScheduleRows: [],
  bookingFormRows: [],
  bookingEditRows: [],
  bookingAllRows: [],
  bookingFormTime: "",
  bookingEditTime: "",
  bookingEditId: null,
  bookingStatusFilter: "",
  bookingFilterStart: "",
  bookingFilterEnd: "",
  bookingPayment: null
};

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const DISKON_AMBANG_PRODUK = 500000;
const DISKON_PERSEN = 15;
const BOOKING_JAM_MULAI = 9;
const BOOKING_JAM_SELESAI = 20;
const BOOKING_KAPASITAS_SLOT = 2;
const BOOKING_ZONA_WAKTU = "Asia/Jakarta";
const itemPhotoCache = new Map();
const itemPhotoExtensions = ["jpg", "png", "webp"];
const LEDGER_CREDIT_NORMAL_ACCOUNTS = new Set(["Pendapatan Jasa Treatment", "Pendapatan Penjualan Produk"]);
const LEDGER_NOMINAL_ACCOUNTS = new Set([
  "Pendapatan",
  "Pendapatan Jasa Treatment",
  "Pendapatan Penjualan Produk",
  "Diskon Penjualan",
  "Beban Pokok Penjualan"
]);
let ledgerOpeningBalances = new Map();
const viewNames = {
  dashboard: "Utama",
  transactions: "Transaksi",
  booking: "Booking Jadwal",
  customers: "Pelanggan",
  items: "Produk & Jasa",
  reports: "Laporan Penjualan",
  receivables: "Piutang",
  journal: "Jurnal Umum"
};
const viewHashes = {
  dashboard: "dashboard",
  transactions: "transaksi",
  booking: "booking",
  customers: "pelanggan",
  items: "produk-jasa",
  reports: "laporan",
  receivables: "piutang",
  journal: "jurnal"
};
const hashViews = Object.fromEntries(Object.entries(viewHashes).map(([view, hash]) => [hash, view]));

const byId = (id) => document.getElementById(id);
const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const addMonths = (isoDate, months) => {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
};
const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const formatMoney = (value) => money.format(Number(value) || 0);
const toCents = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
};
const formatDate = (value) => value ? dateFormatter.format(new Date(`${String(value).slice(0, 10)}T00:00:00`)) : "—";
const bookingClock = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_ZONA_WAKTU,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
};
const bookingToday = () => bookingClock().date;
const formatBookingDate = (value) => value ? new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: BOOKING_ZONA_WAKTU
}).format(new Date(`${String(value).slice(0, 10)}T12:00:00+07:00`)) : "—";
const formatBookingTime = (value) => value ? String(value).slice(0, 5) : "—";
const formatBookingTimestamp = (value) => value ? new Intl.DateTimeFormat("id-ID", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: BOOKING_ZONA_WAKTU
}).format(new Date(value)) : "—";

function slugify(nama) {
  return String(nama ?? "").normalize("NFC").toLowerCase()
    .replace(/&/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const toggleAuthScreen = (locked) => {
  const appShell = byId("app-shell");
  const authScreen = byId("auth-screen");
  if (appShell) appShell.hidden = locked;
  if (authScreen) authScreen.hidden = !locked;
};

function showAuthMessage(message = "") {
  const notice = byId("login-error");
  notice.textContent = message;
  notice.hidden = !message;
}

function clearApplicationData() {
  Object.assign(state, {
    customers: [],
    items: [],
    sales: [],
    cart: [],
    catalogCategory: "Produk",
    catalogSearchQuery: "",
    catalogQuantities: {},
    addedItemId: null,
    report: [],
    reportDiscounts: [],
    reportFinance: { profitLoss: { rows: [] }, ledger: [] },
    activeSale: null,
    activeReceivable: null,
    activeInstallmentNumber: null,
    activeInstallmentAmount: 0,
    receivables: [],
    customerQuery: "",
    salesQuery: "",
    salesStatusFilter: "",
    receivablePaymentReport: { total_kas_masuk: 0, payments: [] },
    bookingScheduleDate: "",
    bookingScheduleRows: [],
    bookingFormRows: [],
    bookingEditRows: [],
    bookingAllRows: [],
    bookingFormTime: "",
    bookingEditTime: "",
    bookingEditId: null,
    bookingStatusFilter: "",
    bookingFilterStart: "",
    bookingFilterEnd: "",
    bookingPayment: null
  });
  document.querySelectorAll("#app-shell tbody").forEach((body) => { body.innerHTML = ""; });
  document.querySelectorAll("#app-shell form").forEach((form) => form.reset());
  document.querySelectorAll("#app-shell input, #app-shell textarea").forEach((field) => { field.value = ""; });
  document.querySelectorAll(".modal-backdrop").forEach((modal) => { modal.hidden = true; });
  document.body.classList.remove("modal-open");

  byId("sale-customer").innerHTML = '<option value="">Pilih pelanggan</option>';
  byId("sale-method").value = "Tunai";
  byId("catalog-grid").innerHTML = "";
  byId("catalog-search").value = "";
  byId("cart-products-list").innerHTML = "";
  byId("cart-treatments-list").innerHTML = "";
  byId("cart-products-group").hidden = true;
  byId("cart-treatments-group").hidden = true;
  byId("cart-empty").hidden = false;
  byId("cart-count").textContent = "0 item";
  byId("cart-products-subtotal").textContent = formatMoney(0);
  byId("cart-treatments-subtotal").textContent = formatMoney(0);
  byId("cart-subtotal").textContent = formatMoney(0);
  byId("cart-discount-row").hidden = true;
  byId("cart-discount-label").textContent = "Diskon produk";
  byId("cart-discount-amount").textContent = `−${formatMoney(0)}`;
  byId("cart-discount-hint").hidden = true;
  byId("checkout-start").disabled = true;
  byId("checkout-customer-summary").textContent = "";
  byId("checkout-products-list").innerHTML = "";
  byId("checkout-treatments-list").innerHTML = "";
  byId("checkout-products-group").hidden = true;
  byId("checkout-treatments-group").hidden = true;
  byId("checkout-subtotal").textContent = formatMoney(0);
  byId("checkout-order-total").textContent = formatMoney(0);
  byId("checkout-payment-subtotal").textContent = formatMoney(0);
  byId("checkout-payment-total").textContent = formatMoney(0);
  byId("checkout-discount-row").hidden = true;
  byId("checkout-discount-label").textContent = "Diskon produk";
  byId("checkout-discount-amount").textContent = `−${formatMoney(0)}`;
  byId("checkout-payment-discount-row").hidden = true;
  byId("checkout-payment-discount-label").textContent = "Diskon produk";
  byId("checkout-payment-discount-amount").textContent = `−${formatMoney(0)}`;
  setCheckoutStep(1);
  document.querySelectorAll("[data-catalog-category]").forEach((tab) => {
    const active = tab.dataset.catalogCategory === "Produk";
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-payment-method]").forEach((option) => {
    const active = option.dataset.paymentMethod === "Tunai";
    option.classList.toggle("is-active", active);
    option.setAttribute("aria-pressed", String(active));
  });
  byId("admin-email").textContent = "";
  byId("notice").hidden = true;
  byId("notice").textContent = "";
  byId("stat-revenue").textContent = formatMoney(0);
  byId("stat-count").textContent = "0";
  byId("stat-receivable").textContent = formatMoney(0);
  byId("stat-booking").textContent = "0";
  byId("sale-total").textContent = formatMoney(0);
  byId("report-products-total").textContent = formatMoney(0);
  byId("report-treatment-total").textContent = formatMoney(0);
  byId("report-grand-total").textContent = formatMoney(0);
  byId("report-discount-total").textContent = formatMoney(0);
  byId("report-net-total").textContent = formatMoney(0);
  byId("report-receivable-cash-total").textContent = formatMoney(0);
  byId("report-products-count").textContent = "0 produk terjual";
  byId("report-treatment-count").textContent = "0 treatment terjual";
  byId("report-row-count").textContent = "0 baris detail";
  byId("receivable-total").textContent = formatMoney(0);
  byId("receivable-customer-count").textContent = "0";
  byId("receivable-overdue-count").textContent = "0";
  byId("receivable-row-count").textContent = "0 transaksi";
  byId("customer-list-count").textContent = "0 pelanggan";
  byId("item-list-count").textContent = "0 item";
  byId("catalog-count").textContent = "0 item";
  byId("checkout-error").textContent = "";
  byId("recent-installment-payments-body").innerHTML = "";
  byId("discounts-report-body").innerHTML = "";
  byId("booking-customer").innerHTML = '<option value="">Pilih pelanggan</option>';
  byId("booking-service").innerHTML = '<option value="">Pilih jasa treatment</option>';
  byId("booking-customer-details").hidden = true;
  byId("booking-service-details").hidden = true;
  byId("booking-time-slots").innerHTML = "";
  byId("booking-day-list").innerHTML = "";
  byId("booking-all-body").innerHTML = "";
  byId("booking-schedule-date-label").textContent = "";
  byId("booking-summary").textContent = "Lengkapi pilihan pelanggan, jasa, tanggal, dan jam.";
  byId("booking-submit").disabled = true;
  byId("booking-edit-time-slots").innerHTML = "";
  byId("booking-detail-id").textContent = "";
  byId("booking-detail-customer").textContent = "";
  byId("booking-detail-phone").textContent = "";
  byId("booking-detail-address").textContent = "";
  byId("booking-detail-service").textContent = "";
  byId("booking-detail-price").textContent = "";
  byId("booking-detail-date").textContent = "";
  byId("booking-detail-time").textContent = "";
  byId("booking-detail-status").textContent = "";
  byId("booking-detail-note").textContent = "";
  byId("booking-detail-sale").textContent = "";
  byId("booking-detail-created").textContent = "";
  byId("detail-modal-title").textContent = "";
  byId("detail-number").textContent = "";
  byId("detail-date").textContent = "";
  byId("detail-customer").textContent = "";
  byId("detail-phone").textContent = "";
  byId("detail-method").textContent = "";
  byId("detail-status").textContent = "";
  byId("detail-subtotal").textContent = "";
  byId("detail-total").textContent = "";
  byId("detail-remaining").textContent = "";
  byId("detail-discount-row").hidden = true;
  byId("detail-discount-label").textContent = "Diskon produk";
  byId("detail-discount-amount").textContent = `−${formatMoney(0)}`;
  byId("receipt-number").textContent = "";
  byId("receipt-date").textContent = "";
  byId("receipt-customer").textContent = "";
  byId("receipt-method").textContent = "";
  byId("receipt-status").textContent = "";
  byId("receipt-subtotal").textContent = "";
  byId("receipt-total").textContent = "";
  byId("receipt-discount-row").hidden = true;
  byId("receipt-discount-label").textContent = "Diskon produk";
  byId("receipt-discount-amount").textContent = `−${formatMoney(0)}`;
  byId("receivable-detail-title").textContent = "";
  byId("receivable-detail-customer").textContent = "";
  byId("installment-payment-number").value = "";
  byId("installment-payment-amount").value = "";
  byId("installment-payment-summary").textContent = "";
  byId("installment-preview").innerHTML = "";
  byId("checkout-error").hidden = true;
  byId("login-error").hidden = true;
}

function clearLocationHash() {
  history.replaceState(null, "", `${location.pathname}${location.search}`);
}

function endLocalSession(message = "") {
  authGeneration += 1;
  authSession = null;
  refreshPromise = null;
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  clearApplicationData();
  byId("login-email").value = "";
  byId("login-password").value = "";
  byId("login-password").type = "password";
  byId("toggle-password").textContent = "Lihat";
  byId("toggle-password").setAttribute("aria-pressed", "false");
  toggleAuthScreen(true);
  clearLocationHash();
  showAuthMessage(message);
}

function readStoredAuthSession() {
  const rawSession = sessionStorage.getItem(AUTH_SESSION_KEY);
  if (!rawSession) return null;

  try {
    const stored = JSON.parse(rawSession);
    if (stored?.access_token && stored?.refresh_token && Number.isFinite(stored.expires_at)) return stored;
  } catch {
    // Invalid session storage is treated as a logged-out session.
  }
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  return null;
}

function storeAuthSession(payload, fallbackEmail = "") {
  const expiresIn = Number(payload?.expires_in);
  if (!payload?.access_token || !payload?.refresh_token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("Respons autentikasi Supabase tidak valid.");
  }
  authSession = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Date.now() + expiresIn * 1000,
    email: payload.user?.email || authSession?.email || fallbackEmail
  };
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authSession));
  byId("admin-email").textContent = authSession.email;
}

async function responsePayload(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function authRequest(path, body, accessToken) {
  return fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

async function refreshAuthSession() {
  if (refreshPromise) return refreshPromise;

  const session = authSession;
  if (!session?.refresh_token) {
    endLocalSession("Sesi berakhir. Silakan masuk kembali.");
    throw new Error("Sesi berakhir. Silakan masuk kembali.");
  }

  const pending = (async () => {
    try {
      const response = await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
      const payload = await responsePayload(response);
      if (!response.ok || authSession !== session) throw new Error("Refresh token tidak valid.");
      storeAuthSession(payload, session.email);
      return authSession.access_token;
    } catch {
      if (authSession === session) endLocalSession("Sesi berakhir. Silakan masuk kembali.");
      throw new Error("Sesi berakhir. Silakan masuk kembali.");
    }
  })();
  refreshPromise = pending;

  try {
    return await pending;
  } finally {
    if (refreshPromise === pending) refreshPromise = null;
  }
}

async function getValidAccessToken() {
  if (!authSession) {
    endLocalSession();
    throw new Error("Silakan masuk kembali.");
  }
  if (authSession.expires_at <= Date.now() + 60_000) return refreshAuthSession();
  return authSession.access_token;
}

function assertSupabaseConfig() {
  if (!/^https:\/\//.test(SUPABASE_URL) || SUPABASE_URL.includes("YOUR_SUPABASE") || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")) {
    throw new Error("Isi SUPABASE_URL dan SUPABASE_ANON_KEY di bagian atas frontend/script.js.");
  }
}

async function supabaseRequest(resource, options = {}) {
  assertSupabaseConfig();
  const accessToken = await getValidAccessToken();
  const requestGeneration = authGeneration;
  const method = options.method || "GET";
  const url = `${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${resource}`;
  const request = (token) => fetch(url, {
    method,
    headers: {
      ...(options.headers || {}),
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json", Prefer: "return=representation" })
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });

  let response = await request(accessToken);
  if (response.status === 401) {
    response = await request(await refreshAuthSession());
    if (response.status === 401) {
      if (requestGeneration === authGeneration) endLocalSession("Sesi berakhir. Silakan masuk kembali.");
      throw new Error("Sesi berakhir. Silakan masuk kembali.");
    }
  }

  if (requestGeneration !== authGeneration || !authSession) throw new Error("Sesi berakhir. Silakan masuk kembali.");
  const payload = await responsePayload(response);
  if (requestGeneration !== authGeneration || !authSession) throw new Error("Sesi berakhir. Silakan masuk kembali.");
  if (!response.ok) throw new Error(payload?.message || payload?.details || payload?.hint || "Permintaan Supabase gagal.");
  return payload;
}

const firstRow = (payload) => Array.isArray(payload) ? payload[0] || null : payload;
const dateFilters = (searchParams) => {
  const query = new URLSearchParams({ select: "*" });
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (start) query.append("tanggal", `gte.${start}`);
  if (end) query.append("tanggal", `lte.${end}`);
  return query;
};

function serializeSupabaseSale(sale) {
  const installments = [...(sale.jadwal_cicilan || [])].sort((left, right) => Number(left.cicilan_ke) - Number(right.cicilan_ke));
  const payments = installments.filter((installment) => installment.status === "Lunas").map((installment) => ({
    id_payment: `${sale.id_penjualan}-${installment.cicilan_ke}`,
    tanggal: installment.tanggal_bayar,
    jumlah: Number(installment.nominal || 0),
    metode_pembayaran: installment.metode_bayar || "Tunai",
    metode_bayar: installment.metode_bayar || "Tunai",
    cicilan_ke: Number(installment.cicilan_ke),
    catatan: installment.catatan || "",
    keterangan: installment.catatan || `Pembayaran cicilan ${installment.cicilan_ke} #${sale.id_penjualan}`,
    jenis: "cicilan"
  }));
  let schedule = installments.map((installment) => ({
    cicilan_ke: Number(installment.cicilan_ke),
    tenggat: installment.jatuh_tempo,
    jumlah: Number(installment.nominal || 0),
    dibayar: installment.status === "Lunas" ? Number(installment.nominal || 0) : 0,
    tanggal_bayar: installment.tanggal_bayar || null,
    metode_bayar: installment.metode_bayar || null,
    catatan: installment.catatan || "",
    status: installment.status === "Lunas" ? "Lunas" : "Belum"
  }));
  if (!schedule.length && sale.metode_pembayaran === "Kredit" && sale.status_pembayaran === "Belum Lunas") {
    schedule = [{ cicilan_ke: 1, tenggat: sale.tanggal, jumlah: Number(sale.total || 0), dibayar: 0, status: "Belum" }];
  }
  const total = Number(sale.total || 0);
  const totalPaid = sale.metode_pembayaran === "Kredit"
    ? payments.reduce((sum, payment) => sum + payment.jumlah, 0)
    : total;
  const remaining = sale.metode_pembayaran === "Kredit"
    ? schedule.reduce((sum, installment) => sum + (installment.status === "Lunas" ? 0 : installment.jumlah), 0)
    : 0;
  const unpaid = schedule.filter((installment) => installment.status !== "Lunas");
  return {
    ...sale,
    pelanggan: sale.pelanggan || null,
    dari_booking: Array.isArray(sale.booking) ? sale.booking.length > 0 : Boolean(sale.booking),
    items: (sale.detail_penjualan || []).map((detail) => ({ ...detail, item: detail.item || null })),
    payments,
    jadwal_cicilan: schedule,
    total_dibayar: totalPaid,
    sisa_pembayaran: remaining,
    lunas: remaining <= 0,
    jumlah_cicilan: schedule.length,
    sisa_tenor: unpaid.length,
    jatuh_tempo_berikutnya: unpaid[0]?.tenggat || null
  };
}

async function fetchSupabaseSales(id) {
  const query = new URLSearchParams();
  query.set("select", "*,pelanggan(id_pelanggan,nama,no_hp,alamat),detail_penjualan(id_item,jumlah,harga_satuan,subtotal,item(id_item,nama_item,jenis)),booking(id_booking)");
  query.set("order", "tanggal.desc,id_penjualan.desc");
  if (id) query.set("id_penjualan", `eq.${id}`);
  const rows = await supabaseRequest(`penjualan?${query}`);
  return (rows || []).map(serializeSupabaseSale);
}

async function confirmSupabaseInstallment(saleId, installmentNumber, payload) {
  return supabaseRequest("rpc/konfirmasi_pembayaran_cicilan", {
    method: "POST",
    body: {
      id_penjualan_input: Number(saleId),
      cicilan_ke_input: Number(installmentNumber),
      tanggal_bayar_input: payload.tanggal_bayar || todayIso(),
      metode_bayar_input: payload.metode_bayar || "Tunai",
      catatan_input: payload.catatan || ""
    }
  });
}

async function api(path, options = {}) {
  const url = new URL(path, window.location.origin);
  const pathname = url.pathname;
  const method = options.method || "GET";
  const body = options.body ? JSON.parse(options.body) : {};
  const saleMatch = pathname.match(/^\/api\/sales\/(\d+)$/);
  const installmentPaymentMatch = pathname.match(/^\/api\/sales\/(\d+)\/installments\/(\d+)\/payments$/);

  if (pathname === "/api/customers") {
    if (method === "GET") return supabaseRequest("pelanggan?select=*&order=nama.asc");
    if (method === "POST") return firstRow(await supabaseRequest("pelanggan", { method, body }));
  }
  const customerMatch = pathname.match(/^\/api\/customers\/(\d+)$/);
  if (customerMatch) {
    const resource = `pelanggan?id_pelanggan=eq.${customerMatch[1]}`;
    if (method === "PUT") return firstRow(await supabaseRequest(resource, { method: "PATCH", body }));
    if (method === "DELETE") return supabaseRequest(resource, { method });
  }

  if (pathname === "/api/items") {
    if (method === "GET") return supabaseRequest("item?select=*&order=nama_item.asc");
    if (method === "POST") return firstRow(await supabaseRequest("item", { method, body }));
  }
  const itemMatch = pathname.match(/^\/api\/items\/(\d+)$/);
  if (itemMatch) {
    const resource = `item?id_item=eq.${itemMatch[1]}`;
    if (method === "PUT") return firstRow(await supabaseRequest(resource, { method: "PATCH", body }));
    if (method === "DELETE") return supabaseRequest(resource, { method });
  }

  if (pathname === "/api/sales") {
    if (method === "GET") return fetchSupabaseSales();
    if (method === "POST") return supabaseRequest("rpc/buat_penjualan", { method: "POST", body: { data_penjualan: body } });
  }
  if (pathname === "/api/bookings") {
    if (method === "GET") {
      const query = new URLSearchParams({ select: "*" });
      const date = url.searchParams.get("date");
      const start = url.searchParams.get("start");
      const end = url.searchParams.get("end");
      const status = url.searchParams.get("status");
      if (date) query.append("tanggal", `eq.${date}`);
      else {
        if (start) query.append("tanggal", `gte.${start}`);
        if (end) query.append("tanggal", `lte.${end}`);
      }
      if (status) query.append("status", `eq.${status}`);
      query.set("order", date ? "jam.asc,id_booking.asc" : "tanggal.desc,jam.asc,id_booking.desc");
      return supabaseRequest(`view_booking?${query}`);
    }
    if (method === "POST") {
      return firstRow(await supabaseRequest("rpc/buat_booking", { method: "POST", body: { data_booking: body } }));
    }
  }
  const bookingStatusMatch = pathname.match(/^\/api\/bookings\/(\d+)\/status$/);
  if (bookingStatusMatch && method === "PATCH") {
    return firstRow(await supabaseRequest("rpc/ubah_status_booking", {
      method: "POST",
      body: {
        id_booking_input: Number(bookingStatusMatch[1]),
        status_baru: body.status,
        id_penjualan_input: body.id_penjualan ?? null
      }
    }));
  }
  const bookingMatch = pathname.match(/^\/api\/bookings\/(\d+)$/);
  if (bookingMatch && method === "PATCH") {
    return firstRow(await supabaseRequest("rpc/ubah_jadwal_booking", {
      method: "POST",
      body: {
        id_booking_input: Number(bookingMatch[1]),
        tanggal_baru: body.tanggal,
        jam_baru: body.jam
      }
    }));
  }
  if (saleMatch) {
    if (method === "GET") return firstRow(await fetchSupabaseSales(saleMatch[1]));
  }
  if (installmentPaymentMatch && method === "POST") {
    await confirmSupabaseInstallment(installmentPaymentMatch[1], installmentPaymentMatch[2], body);
    return { sale: firstRow(await fetchSupabaseSales(installmentPaymentMatch[1])) };
  }
  if (pathname === "/api/receivables" && method === "GET") {
    const sales = (await fetchSupabaseSales()).filter((sale) =>
      sale.status_pembayaran === "Belum Lunas"
    );
    const overdueCount = sales.reduce((count, sale) => count + sale.jadwal_cicilan.filter((installment) =>
      installment.status !== "Lunas" && installment.tenggat < todayIso()
    ).length, 0);
    return {
      summary: {
        total_piutang: sales.reduce((sum, sale) => sum + sale.sisa_pembayaran, 0),
        pelanggan_belum_lunas: new Set(sales.map((sale) => sale.id_pelanggan)).size,
        cicilan_jatuh_tempo: overdueCount
      },
      receivables: sales
    };
  }

  if (pathname === "/api/reports/receivable-payments" && method === "GET") {
    const query = new URLSearchParams();
    query.set("select", "tanggal,id_penjualan,nama_pelanggan,cicilan_ke,metode_pembayaran,keterangan,nominal");
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    if (start) query.append("tanggal", `gte.${start}`);
    if (end) query.append("tanggal", `lte.${end}`);
    const payments = await supabaseRequest(`view_laporan_pelunasan?${query}`);
    return { total_kas_masuk: payments.reduce((sum, payment) => sum + Number(payment.nominal || 0), 0), payments };
  }

  if (pathname === "/api/reports/discounts" && method === "GET") {
    const query = dateFilters(url.searchParams);
    query.set("order", "tanggal.desc,id_penjualan.desc");
    return supabaseRequest(`view_diskon_penjualan?${query}`);
  }

  if (pathname === "/api/reports" && method === "GET") {
    const query = dateFilters(url.searchParams);
    query.set("order", "tanggal.desc,id_penjualan.desc");
    return supabaseRequest(`view_laporan_penjualan?${query}`);
  }

  if (pathname === "/api/finance/profit-loss" && method === "GET") {
    const query = dateFilters(url.searchParams);
    query.set("order", "urutan.asc");
    const entries = await supabaseRequest(`view_laba_rugi?${query}`);
    const totals = new Map();
    for (const entry of entries || []) {
      totals.set(entry.akun, (totals.get(entry.akun) || 0) + Number(entry.nilai || 0));
    }
    const pendapatan = totals.get("Pendapatan") || 0;
    const diskon = totals.get("Diskon Penjualan") || 0;
    const hpp = totals.get("Beban Pokok Penjualan") || totals.get("Harga Pokok Penjualan") || 0;
    return { rows: [
      { akun: "Pendapatan", nilai: pendapatan },
      { akun: "Diskon Penjualan", nilai: diskon },
      { akun: "Beban Pokok Penjualan", nilai: hpp },
      { akun: "LABA KOTOR", nilai: pendapatan - diskon - hpp }
    ] };
  }

  if (pathname === "/api/finance/ledger" || pathname === "/api/journal") {
    const before = url.searchParams.get("before");
    const query = before
      ? new URLSearchParams({ select: "*", tanggal: `lt.${before}` })
      : dateFilters(url.searchParams);
    query.set("order", "tanggal.asc,id_penjualan.asc,urutan.asc");
    for (const parameter of ["offset", "limit"]) {
      const value = url.searchParams.get(parameter);
      if (value) query.set(parameter, value);
    }
    return supabaseRequest(`view_buku_besar?${query}`);
  }

  if (pathname === "/api/dashboard" && method === "GET") {
    const [allSales, todayBookings] = await Promise.all([
      fetchSupabaseSales(),
      supabaseRequest(`view_booking?select=id_booking&tanggal=eq.${bookingToday()}&status=eq.Dijadwalkan`)
    ]);
    const sales = allSales;
    const payments = sales.flatMap((sale) => sale.payments.map((payment) => ({
      tanggal: payment.tanggal,
      id_penjualan: sale.id_penjualan,
      nama_pelanggan: sale.pelanggan?.nama || "Pelanggan",
      cicilan_ke: payment.cicilan_ke,
      jumlah: payment.jumlah,
      metode_pembayaran: payment.metode_pembayaran,
      keterangan: payment.keterangan
    }))).sort((left, right) => String(right.tanggal).localeCompare(String(left.tanggal))).slice(0, 5);
    return {
      pendapatan: sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
      transaksi: sales.length,
      piutang: sales.reduce((sum, sale) => sum + Number(sale.sisa_pembayaran || 0), 0),
      booking_hari_ini: todayBookings.length,
      recent_installment_payments: payments
    };
  }

  throw new Error("Endpoint Supabase tidak didukung.");
}

function showNotice(message, type = "success") {
  const notice = byId("notice");
  if (!notice) return;
  notice.textContent = message;
  notice.className = `notice ${type}`;
  notice.hidden = false;
  window.clearTimeout(showNotice.timeout);
  showNotice.timeout = window.setTimeout(() => { notice.hidden = true; }, 5000);
}

function showSaleSuccessNotice(saleId) {
  const notice = byId("notice");
  notice.className = "notice success";
  notice.innerHTML = `Transaksi #${escapeHtml(saleId)} berhasil disimpan. <button class="notice-action" type="button" data-notice-receipt="${escapeHtml(saleId)}">Lihat nota</button>`;
  notice.hidden = false;
  window.clearTimeout(showNotice.timeout);
  showNotice.timeout = window.setTimeout(() => { notice.hidden = true; }, 7000);
}

function handleError(error) {
  const message = error?.message || "Terjadi kesalahan.";
  const normalizedMessage = message.toLowerCase();
  let userMessage = message;

  if (normalizedMessage.includes("violates foreign key constraint")) {
    if (normalizedMessage.includes("detail_penjualan")) {
      userMessage = "Item tidak bisa dihapus karena sudah dipakai pada transaksi penjualan.";
    } else if (normalizedMessage.includes("penjualan")) {
      userMessage = "Pelanggan tidak bisa dihapus karena sudah memiliki transaksi penjualan.";
    }
  } else if (normalizedMessage.includes("violates check constraint")) {
    userMessage = "Data tidak valid, periksa kembali isian Anda.";
  }

  showNotice(userMessage, "error");
}

function emptyRow(columnCount, message) {
  return `<tr><td colspan="${columnCount}" class="empty-state">${escapeHtml(message)}</td></tr>`;
}

function setView(view, updateHash = true) {
  if (!authSession) {
    toggleAuthScreen(true);
    return;
  }
  if (!viewNames[view]) return;
  if (view !== "transactions" && state.bookingPayment && !state.bookingPayment.id_penjualan) {
    state.bookingPayment = null;
  }
  if (updateHash && location.hash !== `#${viewHashes[view]}`) history.pushState(null, "", `#${viewHashes[view]}`);
  document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `view-${view}`));
  document.querySelectorAll(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  byId("current-page").textContent = viewNames[view];
  byId("page-title").textContent = view === "dashboard" ? "Selamat datang kembali" : viewNames[view];
  if (view === "reports") loadReport().catch(handleError);
  if (view === "receivables") loadReceivables().catch(handleError);
  if (view === "journal") loadJournal().catch(handleError);
  if (view === "transactions") loadSales().catch(handleError);
  if (view === "booking") loadBookingPage().catch(handleError);
}

function restoreViewFromHash() {
  if (!authSession) {
    endLocalSession();
    return;
  }
  const view = hashViews[location.hash.slice(1)];
  if (view) setView(view, false);
}

window.addEventListener("hashchange", restoreViewFromHash);
window.addEventListener("popstate", restoreViewFromHash);

function setSelectOptions(select, rows, placeholder, idKey, nameKey, nameSuffix = "") {
  const selected = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>${rows.map((row) =>
    `<option value="${escapeHtml(row[idKey])}">${escapeHtml(row[nameKey])}${nameSuffix ? ` · ${escapeHtml(row[nameSuffix])}` : ""}</option>`
  ).join("")}`;
  if (rows.some((row) => String(row[idKey]) === selected)) select.value = selected;
}

function getFilteredCustomers() {
  const q = state.customerQuery.toLowerCase();
  return state.customers.filter((customer) => {
    if (!q) return true;
    const haystack = [customer.nama, customer.no_hp, customer.alamat].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

function getFilteredSales() {
  const q = state.salesQuery.toLowerCase();
  return state.sales.filter((sale) => {
    const customerName = sale.pelanggan?.nama || "";
    const matchesQuery = !q || [sale.id_penjualan, customerName, sale.metode_pembayaran, sale.status_pembayaran, sale.tanggal].join(" ").toLowerCase().includes(q);
    const matchesStatus = !state.salesStatusFilter || sale.status_pembayaran === state.salesStatusFilter;
    return matchesQuery && matchesStatus;
  });
}

function renderCustomerOptions() {
  setSelectOptions(byId("sale-customer"), state.customers, "Pilih pelanggan", "id_pelanggan", "nama");
}

function itemPlaceholderSource(item) {
  const service = item.jenis === "Jasa Treatment";
  const accent = service ? "#d87599" : "#c49a68";
  const soft = service ? "#fce8ef" : "#f7ead8";
  const symbol = service ? "✿" : "L";
  const image = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 210"><rect width="320" height="210" rx="18" fill="${soft}"/><circle cx="266" cy="38" r="44" fill="#fffdf9" opacity=".68"/><circle cx="46" cy="184" r="62" fill="${accent}" opacity=".12"/><path d="M92 159c14-38 37-57 68-57s54 19 68 57" fill="#fffdf9" opacity=".78"/><rect x="132" y="58" width="56" height="105" rx="17" fill="${accent}" opacity=".84"/><rect x="143" y="43" width="34" height="22" rx="5" fill="#8f5267"/><path d="M143 91h34" stroke="#fffdf9" stroke-width="5" stroke-linecap="round"/><text x="160" y="192" text-anchor="middle" fill="#8f5267" font-family="Georgia,serif" font-size="21">${symbol}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(image)}`;
}

function fotoItem(item) {
  const slug = slugify(item.nama_item);
  const cachedExtension = itemPhotoCache.get(slug);
  const placeholder = itemPlaceholderSource(item);
  if (!slug || cachedExtension === null) {
    return `<img class="item-photo" src="${placeholder}" alt="" aria-hidden="true">`;
  }

  const extension = itemPhotoExtensions.includes(cachedExtension) ? cachedExtension : "jpg";
  return `<img class="item-photo" src="images/${slug}.${extension}" data-item-photo-slug="${slug}" data-item-photo-extension="${extension}" data-placeholder="${placeholder}" onload="fotoItemLoaded(this)" onerror="fotoItemError(this)" alt="" aria-hidden="true">`;
}

function fotoItemLoaded(image) {
  const slug = image.dataset.itemPhotoSlug;
  const extension = image.dataset.itemPhotoExtension;
  if (!slug || !itemPhotoExtensions.includes(extension)) return;

  const cachedExtension = itemPhotoCache.get(slug);
  if (cachedExtension === undefined || cachedExtension === null
      || itemPhotoExtensions.indexOf(extension) < itemPhotoExtensions.indexOf(cachedExtension)) {
    itemPhotoCache.set(slug, extension);
  }
}

function fotoItemError(image) {
  const slug = image.dataset.itemPhotoSlug;
  const extension = image.dataset.itemPhotoExtension;
  if (!slug) {
    image.onerror = null;
    image.src = image.dataset.placeholder;
    return;
  }

  const cachedExtension = itemPhotoCache.get(slug);
  if (cachedExtension === null) {
    image.onerror = null;
    image.src = image.dataset.placeholder;
    return;
  }
  if (cachedExtension && cachedExtension !== extension) {
    image.dataset.itemPhotoExtension = cachedExtension;
    image.src = `images/${slug}.${cachedExtension}`;
    return;
  }
  if (cachedExtension === extension) itemPhotoCache.delete(slug);

  const nextExtension = itemPhotoExtensions[itemPhotoExtensions.indexOf(extension) + 1];
  if (nextExtension) {
    image.dataset.itemPhotoExtension = nextExtension;
    image.src = `images/${slug}.${nextExtension}`;
    return;
  }

  itemPhotoCache.set(slug, null);
  image.onerror = null;
  image.src = image.dataset.placeholder;
}

function cartQuantity(itemId) {
  return state.cart.find((line) => String(line.id_item) === String(itemId))?.jumlah || 0;
}

function availableStock(item) {
  return Math.max(0, Number(item.stok || 0) - cartQuantity(item.id_item));
}

function renderCatalog() {
  const query = state.catalogSearchQuery.toLowerCase();
  const items = state.items.filter((item) => item.jenis === state.catalogCategory
    && (!query || item.nama_item.toLowerCase().includes(query)));
  byId("catalog-count").textContent = `${items.length} item`;
  byId("catalog-grid").innerHTML = items.length ? items.map((item) => {
    const key = String(item.id_item);
    const product = item.jenis === "Produk";
    const available = product ? availableStock(item) : null;
    const soldOut = product && available === 0;
    const quantity = product
      ? Math.min(Math.max(1, Number(state.catalogQuantities[key]) || 1), Math.max(1, available))
      : Math.max(1, Number(state.catalogQuantities[key]) || 1);
    const stockLabel = !product ? "" : soldOut
      ? "Habis"
      : available <= 5 ? "Stok menipis" : `Stok ${available}`;
    const justAdded = state.addedItemId === key;

    return `<article class="catalog-card">
      ${fotoItem(item)}
      <div class="catalog-card-content">
        <div class="catalog-card-heading"><h3>${escapeHtml(item.nama_item)}</h3>${product ? `<span class="stock-badge ${soldOut ? "is-empty" : available <= 5 ? "is-low" : ""}">${stockLabel}</span>` : ""}</div>
        <p class="catalog-price">${formatMoney(item.harga_jual)}</p>
        <div class="catalog-card-actions">
          <div class="quantity-stepper" aria-label="Jumlah ${escapeHtml(item.nama_item)}">
            <button type="button" data-catalog-action="decrease" data-item-id="${escapeHtml(item.id_item)}" aria-label="Kurangi jumlah" ${soldOut || quantity <= 1 ? "disabled" : ""}>−</button>
            <span>${quantity}</span>
            <button type="button" data-catalog-action="increase" data-item-id="${escapeHtml(item.id_item)}" aria-label="Tambah jumlah" ${soldOut || (product && quantity >= available) ? "disabled" : ""}>+</button>
          </div>
          <button class="button button-primary catalog-add-button" type="button" data-catalog-action="add" data-item-id="${escapeHtml(item.id_item)}" ${soldOut ? "disabled" : ""}>${justAdded ? "Ditambahkan" : soldOut ? "Habis" : "Tambah ke keranjang"}</button>
        </div>
      </div>
    </article>`;
  }).join("") : '<p class="catalog-empty">Tidak ada item dalam kategori ini.</p>';
}

function renderCustomers() {
  const filtered = getFilteredCustomers();
  const body = byId("customers-body");
  byId("customer-list-count").textContent = `${filtered.length} pelanggan`;
  if (!filtered.length) body.innerHTML = emptyRow(5, "Tidak ada pelanggan yang cocok.");
  else body.innerHTML = filtered.map((customer) => `<tr>
    <td><strong>${escapeHtml(customer.nama)}</strong></td><td>${escapeHtml(customer.no_hp)}</td>
    <td>${escapeHtml(customer.alamat || "—")}</td><td>${formatDate(customer.tanggal_daftar)}</td>
    <td class="action-cell"><button class="row-action" data-action="edit-customer" data-id="${escapeHtml(customer.id_pelanggan)}">Edit</button><button class="row-action" data-action="delete-customer" data-id="${escapeHtml(customer.id_pelanggan)}">Hapus</button></td>
  </tr>`).join("");
  renderCustomerOptions();
}

function renderItems() {
  const body = byId("items-body");
  byId("item-list-count").textContent = `${state.items.length} item`;
  if (!state.items.length) body.innerHTML = emptyRow(6, "Belum ada produk atau jasa.");
  else body.innerHTML = state.items.map((item) => `<tr>
    <td><span class="item-name-cell">${fotoItem(item)}<strong>${escapeHtml(item.nama_item)}</strong></span></td>
    <td><span class="badge ${item.jenis === "Produk" ? "badge-product" : "badge-treatment"}">${escapeHtml(item.jenis)}</span></td>
    <td class="money-cell">${formatMoney(item.harga_jual)}</td><td>${item.jenis === "Produk" ? formatMoney(item.harga_pokok) : "—"}</td>
    <td>${item.jenis === "Produk" ? escapeHtml(item.stok) : "—"}</td>
    <td class="action-cell"><button class="row-action" data-action="edit-item" data-id="${escapeHtml(item.id_item)}">Edit</button><button class="row-action" data-action="delete-item" data-id="${escapeHtml(item.id_item)}">Hapus</button></td>
  </tr>`).join("");
  renderCatalog();
}

function paymentBadge(status) {
  const paid = status === "Lunas";
  return `<span class="badge ${paid ? "badge-paid" : "badge-unpaid"}">${escapeHtml(status)}</span>`;
}

function renderSales() {
  const filtered = getFilteredSales();
  const salesBody = byId("sales-body");
  const recentBody = byId("recent-sales-body");
  salesBody.innerHTML = filtered.length ? filtered.map((sale) => `<tr>
    <td class="id-cell">#${escapeHtml(sale.id_penjualan)}${sale.dari_booking ? '<span class="badge booking-origin-badge">Dari booking</span>' : ""}</td><td>${escapeHtml(sale.pelanggan?.nama || "Pelanggan")}</td>
    <td>${formatDate(sale.tanggal)}</td><td>${escapeHtml(sale.metode_pembayaran)}</td><td>${paymentBadge(sale.status_pembayaran)}</td>
    <td class="money-cell align-right"><span class="sale-total-value">${formatMoney(sale.total)}</span>${Number(sale.diskon_nominal || 0) > 0 ? '<span class="discount-badge">Diskon</span>' : ""}</td>
    <td class="action-cell"><button class="row-action" data-sale-action="detail" data-id="${escapeHtml(sale.id_penjualan)}">Detail</button><button class="row-action" data-sale-action="receipt" data-id="${escapeHtml(sale.id_penjualan)}">Nota</button></td>
  </tr>`).join("") : emptyRow(7, "Tidak ada transaksi yang cocok.");

  const recentSales = state.sales.slice(0, 6);
  recentBody.innerHTML = recentSales.length ? recentSales.map((sale) => `<tr>
    <td class="id-cell">#${escapeHtml(sale.id_penjualan)}</td><td>${escapeHtml(sale.pelanggan?.nama || "Pelanggan")}</td>
    <td>${formatDate(sale.tanggal)}</td><td>${paymentBadge(sale.status_pembayaran)}</td>
    <td class="money-cell align-right">${formatMoney(sale.total)}</td>
  </tr>`).join("") : emptyRow(5, "Belum ada transaksi penjualan.");
}

function renderDashboard(summary) {
  byId("stat-revenue").textContent = formatMoney(summary.pendapatan);
  byId("stat-count").textContent = Number(summary.transaksi || 0).toLocaleString("id-ID");
  byId("stat-receivable").textContent = formatMoney(summary.piutang);
  byId("stat-booking").textContent = Number(summary.booking_hari_ini || 0).toLocaleString("id-ID");
  const payments = summary.recent_installment_payments || [];
  byId("recent-installment-payments-body").innerHTML = payments.length
    ? payments.map((payment) => `<tr>
      <td>${formatDate(payment.tanggal)}</td><td class="id-cell">#${escapeHtml(payment.id_penjualan)}</td>
      <td>${escapeHtml(payment.nama_pelanggan)}</td><td>${payment.cicilan_ke ? `Ke-${escapeHtml(payment.cicilan_ke)}` : "—"}</td>
      <td>${escapeHtml(payment.metode_pembayaran)}</td><td class="money-cell align-right">${formatMoney(payment.jumlah)}</td>
    </tr>`).join("")
    : emptyRow(6, "Belum ada pembayaran cicilan.");
}

function renderReceivables(payload) {
  const summary = payload.summary || {};
  state.receivables = payload.receivables || [];
  byId("receivable-total").textContent = formatMoney(summary.total_piutang);
  byId("receivable-customer-count").textContent = Number(summary.pelanggan_belum_lunas || 0).toLocaleString("id-ID");
  byId("receivable-overdue-count").textContent = Number(summary.cicilan_jatuh_tempo || 0).toLocaleString("id-ID");
  byId("receivable-row-count").textContent = `${state.receivables.length} transaksi`;

  const body = byId("receivables-body");
  if (!state.receivables.length) {
    body.innerHTML = emptyRow(8, "Tidak ada piutang yang belum lunas.");
    return;
  }
  body.innerHTML = state.receivables.map((sale) => {
    const overdue = sale.jatuh_tempo_berikutnya && sale.jatuh_tempo_berikutnya < todayIso();
    return `<tr class="${overdue ? "overdue-row" : ""}">
      <td class="id-cell">#${escapeHtml(sale.id_penjualan)}</td>
      <td><strong>${escapeHtml(sale.pelanggan?.nama || "Pelanggan")}</strong></td>
      <td class="money-cell">${formatMoney(sale.total)}</td>
      <td>${formatMoney(sale.total_dibayar)}</td>
      <td class="money-cell ${overdue ? "overdue-text" : ""}">${formatMoney(sale.sisa_pembayaran)}</td>
      <td>${escapeHtml(sale.sisa_tenor)} dari ${escapeHtml(sale.jumlah_cicilan)} bulan</td>
      <td class="${overdue ? "overdue-text" : ""}">${formatDate(sale.jatuh_tempo_berikutnya)}${overdue ? ' <span class="overdue-label">Terlambat</span>' : ""}</td>
      <td class="action-cell"><button class="row-action" type="button" data-receivable-detail="${escapeHtml(sale.id_penjualan)}">Detail</button><button class="row-action" type="button" data-pay-receivable="${escapeHtml(sale.id_penjualan)}">Bayar</button></td>
    </tr>`;
  }).join("");
}

function renderBookingOptions() {
  const customerSelect = byId("booking-customer");
  const selectedCustomer = customerSelect.value;
  customerSelect.innerHTML = `<option value="">Pilih pelanggan</option>${state.customers.map((customer) =>
    `<option value="${escapeHtml(customer.id_pelanggan)}">${escapeHtml(customer.nama)} · ${escapeHtml(customer.no_hp)}</option>`
  ).join("")}`;
  if (state.customers.some((customer) => String(customer.id_pelanggan) === selectedCustomer)) {
    customerSelect.value = selectedCustomer;
  }

  const serviceSelect = byId("booking-service");
  const selectedService = serviceSelect.value;
  const services = state.items.filter((item) => item.jenis === "Jasa Treatment");
  serviceSelect.innerHTML = `<option value="">Pilih jasa treatment</option>${services.map((item) =>
    `<option value="${escapeHtml(item.id_item)}">${escapeHtml(item.nama_item)} · ${escapeHtml(formatMoney(item.harga_jual))}</option>`
  ).join("")}`;
  if (services.some((item) => String(item.id_item) === selectedService)) serviceSelect.value = selectedService;
  updateBookingSelectionDetails();
  updateBookingSummary();
}

function updateBookingSelectionDetails() {
  const customer = state.customers.find((row) => String(row.id_pelanggan) === byId("booking-customer").value);
  const service = state.items.find((row) => String(row.id_item) === byId("booking-service").value && row.jenis === "Jasa Treatment");
  byId("booking-customer-details").hidden = !customer;
  if (customer) {
    byId("booking-customer-name").textContent = customer.nama;
    byId("booking-customer-phone").textContent = customer.no_hp;
    byId("booking-customer-address").textContent = customer.alamat || "Alamat belum diisi";
  }
  byId("booking-service-details").hidden = !service;
  if (service) {
    byId("booking-service-name").textContent = service.nama_item;
    byId("booking-service-price").textContent = formatMoney(service.harga_jual);
  }
}

function bookingWeekday(date) {
  return date ? new Date(`${date}T00:00:00Z`).getUTCDay() : null;
}

function bookingSlotIsPast(date, time) {
  const clock = bookingClock();
  const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return date < clock.date || (date === clock.date && minutes <= clock.minutes);
}

function bookingSlotUsage(rows, time, excludedBookingId = null) {
  return rows.filter((row) => row.status === "Dijadwalkan"
    && formatBookingTime(row.jam) === time
    && (excludedBookingId === null || String(row.id_booking) !== String(excludedBookingId))).length;
}

function renderBookingSlotGrid(containerId, date, rows, selectedTime = "", excludedBookingId = null) {
  const container = byId(containerId);
  if (!date) {
    container.innerHTML = '<p class="booking-slot-message">Pilih tanggal untuk melihat jam tersedia.</p>';
    return;
  }
  if (bookingWeekday(date) === 0) {
    container.innerHTML = '<p class="booking-slot-message">Minggu tutup. Silakan pilih hari Senin sampai Sabtu.</p>';
    return;
  }

  const slots = [];
  for (let hour = BOOKING_JAM_MULAI; hour < BOOKING_JAM_SELESAI; hour += 1) {
    const time = `${String(hour).padStart(2, "0")}:00`;
    const used = bookingSlotUsage(rows, time, excludedBookingId);
    const remaining = Math.max(0, BOOKING_KAPASITAS_SLOT - used);
    const past = bookingSlotIsPast(date, time);
    const full = remaining === 0;
    const disabled = past || full;
    const availability = past ? "Lewat" : full ? "Penuh" : `Sisa ${remaining}`;
    slots.push(`<button class="booking-slot${selectedTime === time ? " is-selected" : ""}" type="button" data-booking-slot="${time}" ${disabled ? "disabled" : ""}>
      <span>${time}</span><small>${availability}</small>
    </button>`);
  }
  container.innerHTML = slots.join("");
}

function selectedBookingSlotAvailable(date, time, rows, excludedBookingId = null) {
  return Boolean(date && time && bookingWeekday(date) !== 0
    && !bookingSlotIsPast(date, time)
    && bookingSlotUsage(rows, time, excludedBookingId) < BOOKING_KAPASITAS_SLOT);
}

function updateBookingSummary() {
  const customer = state.customers.find((row) => String(row.id_pelanggan) === byId("booking-customer").value);
  const service = state.items.find((row) => String(row.id_item) === byId("booking-service").value && row.jenis === "Jasa Treatment");
  const date = byId("booking-date").value;
  const time = state.bookingFormTime;
  const available = selectedBookingSlotAvailable(date, time, state.bookingFormRows);
  byId("booking-submit").disabled = !customer || !service || !available;
  byId("booking-summary").textContent = customer && service && date && time
    ? `Booking: ${service.nama_item} untuk ${customer.nama}, ${formatBookingDate(date)} pukul ${time}`
    : "Lengkapi pilihan pelanggan, jasa, tanggal, dan jam.";
}

function bookingStatusBadge(status) {
  const classes = {
    Dijadwalkan: "booking-status-scheduled",
    Selesai: "booking-status-done",
    Batal: "booking-status-cancelled",
    "Tidak Hadir": "booking-status-no-show"
  };
  return `<span class="badge ${classes[status] || ""}">${escapeHtml(status || "—")}</span>`;
}

function renderBookingSchedule() {
  byId("booking-schedule-date-label").textContent = formatBookingDate(state.bookingScheduleDate);
  const body = byId("booking-day-list");
  const rows = [...state.bookingScheduleRows].sort((left, right) =>
    String(left.jam).localeCompare(String(right.jam)) || Number(left.id_booking) - Number(right.id_booking));
  if (!rows.length) {
    body.innerHTML = '<p class="booking-empty">Belum ada booking pada tanggal ini.</p>';
    return;
  }
  body.innerHTML = rows.map((row) => {
    const scheduled = row.status === "Dijadwalkan";
    return `<article class="booking-day-row">
      <div class="booking-time-label">${formatBookingTime(row.jam)}</div>
      <div class="booking-row-content">
        <div class="booking-row-title"><strong>${escapeHtml(row.nama_pelanggan)}</strong>${bookingStatusBadge(row.status)}</div>
        <div class="booking-row-meta">
          <span>HP: ${escapeHtml(row.no_hp || "—")}</span><span>Alamat: ${escapeHtml(row.alamat || "—")}</span>
          <span>Jasa: ${escapeHtml(row.nama_item)}</span><span>Harga jasa: ${formatMoney(row.harga_jual)}</span>
        </div>
        <p class="booking-row-note">Catatan: ${escapeHtml(row.catatan || "—")}${row.id_penjualan ? ` · Transaksi #${escapeHtml(row.id_penjualan)}` : ""}</p>
        <div class="booking-row-actions">
          <button class="row-action" type="button" data-booking-action="detail" data-id="${escapeHtml(row.id_booking)}">Detail</button>
          ${scheduled ? `<button class="row-action" type="button" data-booking-action="pay" data-id="${escapeHtml(row.id_booking)}">Proses pembayaran</button>
            <button class="row-action" type="button" data-booking-action="reschedule" data-id="${escapeHtml(row.id_booking)}">Ubah jadwal</button>
            <button class="row-action" type="button" data-booking-action="cancel" data-id="${escapeHtml(row.id_booking)}">Batalkan</button>
            <button class="row-action" type="button" data-booking-action="no-show" data-id="${escapeHtml(row.id_booking)}">Tidak hadir</button>` : ""}
        </div>
      </div>
    </article>`;
  }).join("");
}

function renderAllBookings() {
  const body = byId("booking-all-body");
  const rows = [...state.bookingAllRows].sort((left, right) =>
    String(right.tanggal).localeCompare(String(left.tanggal))
    || String(left.jam).localeCompare(String(right.jam))
    || Number(right.id_booking) - Number(left.id_booking));
  if (!rows.length) {
    body.innerHTML = emptyRow(11, "Tidak ada booking untuk filter ini.");
    return;
  }
  body.innerHTML = rows.map((row) => `<tr>
    <td>${formatBookingDate(row.tanggal)}</td>
    <td>${formatBookingTime(row.jam)}</td>
    <td><strong>${escapeHtml(row.nama_pelanggan)}</strong></td>
    <td>${escapeHtml(row.no_hp || "—")}</td>
    <td>${escapeHtml(row.alamat || "—")}</td>
    <td><strong>${escapeHtml(row.nama_item)}</strong></td>
    <td class="money-cell">${formatMoney(row.harga_jual)}</td>
    <td>${escapeHtml(row.catatan || "—")}</td>
    <td>${bookingStatusBadge(row.status)}</td>
    <td class="id-cell">${row.id_penjualan ? `#${escapeHtml(row.id_penjualan)}` : "—"}</td>
    <td><button class="row-action" type="button" data-booking-all-detail="${escapeHtml(row.id_booking)}">Detail</button></td>
  </tr>`).join("");
}

function renderBookingDetail(row) {
  byId("booking-detail-title").textContent = `Detail booking #${row.id_booking}`;
  byId("booking-detail-id").textContent = `#${row.id_booking}`;
  byId("booking-detail-status").innerHTML = bookingStatusBadge(row.status);
  byId("booking-detail-customer").textContent = row.nama_pelanggan || "—";
  byId("booking-detail-phone").textContent = row.no_hp || "—";
  byId("booking-detail-address").textContent = row.alamat || "—";
  byId("booking-detail-service").textContent = row.nama_item || "—";
  byId("booking-detail-price").textContent = formatMoney(row.harga_jual);
  byId("booking-detail-date").textContent = formatBookingDate(row.tanggal);
  byId("booking-detail-time").textContent = formatBookingTime(row.jam);
  byId("booking-detail-sale").textContent = row.id_penjualan ? `#${row.id_penjualan}` : "Belum dibayar";
  byId("booking-detail-created").textContent = formatBookingTimestamp(row.dibuat_pada);
  byId("booking-detail-note").textContent = row.catatan || "—";
}

function findBooking(id) {
  return [...state.bookingScheduleRows, ...state.bookingAllRows, ...state.bookingFormRows, ...state.bookingEditRows]
    .find((row) => String(row.id_booking) === String(id));
}

async function loadBookingSchedule(date = state.bookingScheduleDate) {
  state.bookingScheduleDate = date || bookingToday();
  state.bookingScheduleRows = await api(`/api/bookings?date=${encodeURIComponent(state.bookingScheduleDate)}`);
  renderBookingSchedule();
}

async function loadBookingFormSlots(date = byId("booking-date").value) {
  if (!date) {
    state.bookingFormRows = [];
    renderBookingSlotGrid("booking-time-slots", "", []);
    updateBookingSummary();
    return;
  }
  state.bookingFormRows = await api(`/api/bookings?date=${encodeURIComponent(date)}`);
  if (state.bookingFormTime && !selectedBookingSlotAvailable(date, state.bookingFormTime, state.bookingFormRows)) {
    state.bookingFormTime = "";
  }
  renderBookingSlotGrid("booking-time-slots", date, state.bookingFormRows, state.bookingFormTime);
  updateBookingSummary();
}

async function loadBookingEditSlots(date = byId("booking-edit-date").value) {
  if (!date) {
    state.bookingEditRows = [];
    renderBookingSlotGrid("booking-edit-time-slots", "", []);
    return;
  }
  state.bookingEditRows = await api(`/api/bookings?date=${encodeURIComponent(date)}`);
  if (state.bookingEditTime && !selectedBookingSlotAvailable(date, state.bookingEditTime, state.bookingEditRows, state.bookingEditId)) {
    state.bookingEditTime = "";
  }
  renderBookingSlotGrid("booking-edit-time-slots", date, state.bookingEditRows, state.bookingEditTime, state.bookingEditId);
  byId("booking-edit-submit").disabled = !state.bookingEditTime
    || !selectedBookingSlotAvailable(date, state.bookingEditTime, state.bookingEditRows, state.bookingEditId);
}

async function loadAllBookings() {
  const params = new URLSearchParams();
  const start = byId("booking-filter-start").value;
  const end = byId("booking-filter-end").value;
  const status = byId("booking-status-filter").value;
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (status) params.set("status", status);
  state.bookingAllRows = await api(`/api/bookings?${params.toString()}`);
  renderAllBookings();
}

async function loadBookingPage() {
  const today = bookingToday();
  byId("booking-date").min = today;
  byId("booking-edit-date").min = today;
  if (!byId("booking-date").value) byId("booking-date").value = today;
  if (!state.bookingScheduleDate) state.bookingScheduleDate = today;
  renderBookingOptions();
  await Promise.all([
    loadBookingSchedule(state.bookingScheduleDate),
    loadBookingFormSlots(byId("booking-date").value),
    loadAllBookings()
  ]);
}

async function refreshBookingData() {
  await Promise.all([
    loadBookingSchedule(state.bookingScheduleDate),
    loadBookingFormSlots(byId("booking-date").value),
    loadAllBookings(),
    refreshBookingDashboardCount()
  ]);
}

async function refreshBookingDashboardCount() {
  const bookings = await api(`/api/bookings?date=${bookingToday()}&status=Dijadwalkan`);
  byId("stat-booking").textContent = Number(bookings.length).toLocaleString("id-ID");
}

function openBookingDetail(id) {
  const row = findBooking(id);
  if (!row) {
    showNotice("Booking tidak ditemukan. Segarkan jadwal lalu coba lagi.", "error");
    return;
  }
  renderBookingDetail(row);
  openModal(byId("booking-detail-modal"));
}

function openBookingReschedule(row) {
  state.bookingEditId = row.id_booking;
  state.bookingEditTime = formatBookingTime(row.jam);
  byId("booking-edit-date").value = row.tanggal;
  byId("booking-edit-date").min = bookingToday();
  openModal(byId("booking-reschedule-modal"));
  loadBookingEditSlots(row.tanggal).catch(handleError);
}

async function updateBookingStatus(row, status) {
  const prompts = {
    Batal: `Batalkan booking #${row.id_booking} untuk ${row.nama_pelanggan}?`,
    "Tidak Hadir": `Tandai booking #${row.id_booking} sebagai Tidak Hadir?`
  };
  if (prompts[status] && !window.confirm(prompts[status])) return;
  await api(`/api/bookings/${row.id_booking}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
  showNotice(status === "Batal" ? "Booking berhasil dibatalkan." : "Booking ditandai Tidak Hadir.");
  await refreshBookingData();
}

function startBookingPayment(row) {
  if (state.bookingPayment?.id_penjualan) {
    if (String(state.bookingPayment.id_booking) !== String(row.id_booking)) {
      showNotice("Selesaikan pembaruan status booking sebelumnya terlebih dahulu.", "error");
      return;
    }
    const savedService = state.items.find((item) => String(item.id_item) === String(row.id_item) && item.jenis === "Jasa Treatment");
    if (!savedService) {
      showNotice("Jasa treatment pada booking tidak ditemukan di katalog.", "error");
      return;
    }
    state.cart = [{ ...savedService, jumlah: 1 }];
    byId("sale-customer").value = String(row.id_pelanggan);
    setSaleDateToToday();
    renderCart();
    setView("transactions");
    showNotice(`Transaksi #${state.bookingPayment.id_penjualan} tersimpan. Konfirmasi kembali untuk menautkannya ke booking.`);
    return;
  }
  if (state.cart.length && !window.confirm("Ganti keranjang saat ini dengan jasa dari booking ini?")) return;
  const service = state.items.find((item) => String(item.id_item) === String(row.id_item) && item.jenis === "Jasa Treatment");
  if (!service) {
    showNotice("Jasa treatment pada booking tidak ditemukan di katalog.", "error");
    return;
  }
  state.bookingPayment = { id_booking: row.id_booking, id_penjualan: null };
  state.cart = [{ ...service, jumlah: 1 }];
  state.catalogQuantities = {};
  byId("sale-customer").value = String(row.id_pelanggan);
  setSaleDateToToday();
  byId("installment-months").value = "";
  byId("installment-first-due").value = addMonths(bookingToday(), 1);
  selectPaymentMethod("Tunai");
  renderCart();
  setView("transactions");
  showNotice(`Booking #${row.id_booking} dimasukkan ke keranjang. Status booking berubah setelah transaksi disimpan.`);
}

async function handleBookingAction(event) {
  const button = event.target.closest("[data-booking-action]");
  const allDetailButton = event.target.closest("[data-booking-all-detail]");
  if (allDetailButton) {
    openBookingDetail(allDetailButton.dataset.bookingAllDetail);
    return;
  }
  if (!button) return;
  const row = findBooking(button.dataset.id);
  if (!row) {
    showNotice("Booking tidak ditemukan. Segarkan jadwal lalu coba lagi.", "error");
    return;
  }
  if (button.dataset.bookingAction === "detail") openBookingDetail(row.id_booking);
  if (button.dataset.bookingAction === "pay") startBookingPayment(row);
  if (button.dataset.bookingAction === "reschedule") openBookingReschedule(row);
  if (button.dataset.bookingAction === "cancel") await updateBookingStatus(row, "Batal");
  if (button.dataset.bookingAction === "no-show") await updateBookingStatus(row, "Tidak Hadir");
}

function renderReceivableDetail(sale) {
  state.activeReceivable = sale;
  byId("receivable-detail-title").textContent = `Piutang transaksi #${sale.id_penjualan}`;
  byId("receivable-detail-customer").textContent = `${sale.pelanggan?.nama || "Pelanggan"} · Sisa tagihan ${formatMoney(sale.sisa_pembayaran)}`;
  const schedule = sale.jadwal_cicilan || [];
  const nextInstallment = schedule.find((installment) => installment.status !== "Lunas");
  byId("receivable-installments-body").innerHTML = schedule.map((installment) => {
    const isOverdue = installment.status !== "Lunas" && installment.tenggat < todayIso();
    const canPay = nextInstallment && installment.cicilan_ke === nextInstallment.cicilan_ke;
    return `<tr class="${isOverdue ? "overdue-row" : ""}">
      <td>${escapeHtml(installment.cicilan_ke)}</td>
      <td class="${isOverdue ? "overdue-text" : ""}">${formatDate(installment.tenggat)}${isOverdue ? ' <span class="overdue-label">Terlambat</span>' : ""}</td>
      <td class="money-cell">${formatMoney(installment.jumlah)}</td>
      <td><span class="badge ${installment.status === "Lunas" ? "badge-paid" : "badge-unpaid"}">${escapeHtml(installment.status)}</span></td>
      <td>${canPay ? `<button class="row-action" type="button" data-pay-installment="${escapeHtml(installment.cicilan_ke)}">Bayar</button>` : "—"}</td>
    </tr>`;
  }).join("") || emptyRow(5, "Jadwal cicilan tidak tersedia.");
  renderPaymentHistory("receivable-payment-history-section", "receivable-payment-history-body", sale.payments || []);
  byId("installment-payment-form").hidden = true;
}

async function loadReceivables() {
  renderReceivables(await api("/api/receivables"));
}

function openReceivableDetail(id) {
  const sale = state.receivables.find((row) => String(row.id_penjualan) === String(id));
  if (!sale) return;
  renderReceivableDetail(sale);
  openModal(byId("receivable-detail-modal"));
}

function openInstallmentConfirmation(installment) {
  if (!installment || !state.activeReceivable) return;
  state.activeInstallmentNumber = Number(installment.cicilan_ke);
  state.activeInstallmentAmount = Number(installment.jumlah || 0) - Number(installment.dibayar || 0);
  byId("installment-payment-title").textContent = "Konfirmasi Pembayaran";
  byId("installment-payment-number").value = `Cicilan ke-${state.activeInstallmentNumber}`;
  byId("installment-payment-amount").value = formatMoney(state.activeInstallmentAmount);
  byId("installment-payment-date").value = todayIso();
  byId("installment-payment-method").value = "Tunai";
  byId("installment-payment-note").value = "";
  byId("installment-payment-summary").innerHTML = `Konfirmasi <strong>${escapeHtml(formatMoney(state.activeInstallmentAmount))}</strong> untuk cicilan ke-${escapeHtml(state.activeInstallmentNumber)} dengan jatuh tempo ${escapeHtml(formatDate(installment.tenggat))}.`;
  byId("installment-payment-form").hidden = false;
  byId("installment-payment-date").focus();
}

function renderPaymentHistory(sectionId, bodyId, payments) {
  const section = byId(sectionId);
  section.hidden = !payments.length;
  byId(bodyId).innerHTML = payments.map((payment) => `<tr>
    <td>${formatDate(payment.tanggal)}</td>
    <td>${payment.cicilan_ke ? `Ke-${escapeHtml(payment.cicilan_ke)}` : "Pelunasan"}</td>
    <td>${escapeHtml(payment.metode_bayar || payment.metode_pembayaran || "Tunai")}</td>
    <td class="money-cell">${formatMoney(payment.jumlah)}</td>
    <td>${escapeHtml(payment.catatan || payment.keterangan || "—")}</td>
  </tr>`).join("") || emptyRow(5, "Belum ada pembayaran.");
}

function calculateSaleTotals(lines) {
  const subtotal = lines.reduce((sum, line) => sum + Number(line.harga_jual || 0) * Number(line.jumlah || 0), 0);
  const subtotalProduk = lines.reduce((sum, line) => line.jenis === "Produk"
    ? sum + Number(line.harga_jual || 0) * Number(line.jumlah || 0)
    : sum, 0);
  const diskonPersen = subtotalProduk > DISKON_AMBANG_PRODUK ? DISKON_PERSEN : 0;
  const diskonNominal = Math.round((subtotalProduk * diskonPersen / 100 + Number.EPSILON) * 100) / 100;
  return {
    subtotal,
    subtotalProduk,
    diskonPersen,
    diskonNominal,
    total: subtotal - diskonNominal
  };
}

function renderCart() {
  const products = state.cart.filter((line) => line.jenis === "Produk");
  const treatments = state.cart.filter((line) => line.jenis === "Jasa Treatment");
  const groupTotal = (lines) => lines.reduce((sum, line) => sum + line.harga_jual * line.jumlah, 0);
  const totals = calculateSaleTotals(state.cart);
  const itemCount = state.cart.reduce((sum, line) => sum + line.jumlah, 0);

  const renderLines = (lines) => lines.map((line) => {
    const item = state.items.find((row) => String(row.id_item) === String(line.id_item)) || line;
    const hasStockLimit = item.jenis === "Produk";
    const canIncrease = !hasStockLimit || line.jumlah < Number(item.stok || 0);
    return `<article class="cart-item">
      ${fotoItem(item)}
      <div class="cart-item-info"><strong>${escapeHtml(line.nama_item)}</strong><span>${formatMoney(line.harga_jual)} · ${formatMoney(line.harga_jual * line.jumlah)}</span>
        <div class="quantity-stepper cart-quantity-stepper" aria-label="Jumlah ${escapeHtml(line.nama_item)}">
          <button type="button" data-cart-action="decrease" data-item-id="${escapeHtml(line.id_item)}" aria-label="Kurangi jumlah" ${line.jumlah <= 1 ? "disabled" : ""}>−</button>
          <span>${line.jumlah}</span>
          <button type="button" data-cart-action="increase" data-item-id="${escapeHtml(line.id_item)}" aria-label="Tambah jumlah" ${canIncrease ? "" : "disabled"}>+</button>
        </div>
      </div>
      <button class="cart-remove-button" type="button" data-cart-action="remove" data-item-id="${escapeHtml(line.id_item)}" aria-label="Hapus ${escapeHtml(line.nama_item)}">×</button>
    </article>`;
  }).join("");

  byId("cart-empty").hidden = state.cart.length > 0;
  byId("cart-products-group").hidden = products.length === 0;
  byId("cart-treatments-group").hidden = treatments.length === 0;
  byId("cart-products-list").innerHTML = renderLines(products);
  byId("cart-treatments-list").innerHTML = renderLines(treatments);
  byId("cart-products-subtotal").textContent = formatMoney(groupTotal(products));
  byId("cart-treatments-subtotal").textContent = formatMoney(groupTotal(treatments));
  byId("cart-subtotal").textContent = formatMoney(totals.subtotal);
  byId("cart-discount-row").hidden = totals.diskonNominal <= 0;
  byId("cart-discount-label").textContent = `Diskon produk ${totals.diskonPersen}%`;
  byId("cart-discount-amount").textContent = `−${formatMoney(totals.diskonNominal)}`;
  byId("cart-discount-hint").hidden = totals.subtotalProduk <= 0 || totals.subtotalProduk > DISKON_AMBANG_PRODUK;
  if (!byId("cart-discount-hint").hidden) {
    const remaining = DISKON_AMBANG_PRODUK - totals.subtotalProduk + 1;
    byId("cart-discount-hint").textContent = `Belanja produk ${formatMoney(remaining)} lagi (lebih dari ${formatMoney(DISKON_AMBANG_PRODUK)}) untuk diskon ${DISKON_PERSEN}% produk`;
  }
  byId("cart-count").textContent = `${itemCount} item`;
  byId("sale-total").textContent = formatMoney(totals.total);
  byId("checkout-payment-total").textContent = formatMoney(totals.total);
  byId("checkout-start").disabled = state.cart.length === 0 || !byId("sale-customer").value;
  renderCatalog();
  renderInstallmentPreview();
}

function changeCatalogQuantity(itemId, amount) {
  const item = state.items.find((row) => String(row.id_item) === String(itemId));
  if (!item) return;
  const key = String(item.id_item);
  const current = Math.max(1, Number(state.catalogQuantities[key]) || 1);
  const next = current + amount;
  if (next < 1 || (item.jenis === "Produk" && next > availableStock(item))) return;
  state.catalogQuantities[key] = next;
  renderCatalog();
}

function addCatalogItem(itemId) {
  const item = state.items.find((row) => String(row.id_item) === String(itemId));
  if (!item) return;
  const key = String(item.id_item);
  const quantity = Math.max(1, Number(state.catalogQuantities[key]) || 1);
  const currentQuantity = cartQuantity(item.id_item);
  if (item.jenis === "Produk" && quantity + currentQuantity > Number(item.stok || 0)) {
    showNotice(`Stok ${item.nama_item} tidak mencukupi.`, "error");
    return;
  }
  const existing = state.cart.find((line) => String(line.id_item) === key);
  if (existing) existing.jumlah += quantity;
  else state.cart.push({ ...item, jumlah: quantity });
  state.catalogQuantities[key] = 1;
  state.addedItemId = key;
  renderCart();
  window.setTimeout(() => {
    if (state.addedItemId === key) {
      state.addedItemId = null;
      renderCatalog();
    }
  }, 900);
}

function renderCheckoutSummary() {
  const customer = state.customers.find((row) => String(row.id_pelanggan) === byId("sale-customer").value);
  byId("checkout-customer-summary").innerHTML = `<div><span>Pelanggan</span><strong>${escapeHtml(customer?.nama || "—")}</strong></div><div><span>Tanggal</span><strong>${escapeHtml(formatDate(byId("sale-date").value))}</strong></div>`;

  const renderLines = (lines) => lines.map((line) => `<div class="checkout-summary-line">
    <span class="checkout-summary-item">${fotoItem(line)}<span><strong>${escapeHtml(line.nama_item)}</strong><small>${line.jumlah} × ${formatMoney(line.harga_jual)}</small></span></span>
    <strong>${formatMoney(line.jumlah * line.harga_jual)}</strong>
  </div>`).join("");
  const products = state.cart.filter((line) => line.jenis === "Produk");
  const treatments = state.cart.filter((line) => line.jenis === "Jasa Treatment");
  byId("checkout-products-group").hidden = products.length === 0;
  byId("checkout-treatments-group").hidden = treatments.length === 0;
  byId("checkout-products-list").innerHTML = renderLines(products);
  byId("checkout-treatments-list").innerHTML = renderLines(treatments);
  const totals = calculateSaleTotals(state.cart);
  byId("checkout-subtotal").textContent = formatMoney(totals.subtotal);
  byId("checkout-discount-row").hidden = totals.diskonNominal <= 0;
  byId("checkout-discount-label").textContent = `Diskon produk ${totals.diskonPersen}%`;
  byId("checkout-discount-amount").textContent = `−${formatMoney(totals.diskonNominal)}`;
  byId("checkout-order-total").textContent = formatMoney(totals.total);
  byId("checkout-payment-subtotal").textContent = formatMoney(totals.subtotal);
  byId("checkout-payment-discount-row").hidden = totals.diskonNominal <= 0;
  byId("checkout-payment-discount-label").textContent = `Diskon produk ${totals.diskonPersen}%`;
  byId("checkout-payment-discount-amount").textContent = `−${formatMoney(totals.diskonNominal)}`;
  byId("checkout-payment-total").textContent = formatMoney(totals.total);
}

function setCheckoutStep(step) {
  byId("checkout-order-step").hidden = step !== 1;
  byId("checkout-payment-step").hidden = step !== 2;
  byId("checkout-error").hidden = true;
  byId("checkout-error").textContent = "";
}

function selectPaymentMethod(method) {
  byId("sale-method").value = method;
  document.querySelectorAll("[data-payment-method]").forEach((option) => {
    const selected = option.dataset.paymentMethod === method;
    option.classList.toggle("is-active", selected);
    option.setAttribute("aria-pressed", String(selected));
  });
  updateInstallmentFields();
}

async function loadSales() {
  state.sales = await api("/api/sales");
  renderSales();
}

function openModal(modal) {
  document.querySelectorAll(".modal-backdrop").forEach((element) => { element.hidden = true; });
  modal.hidden = false;
  document.body.classList.add("modal-open");
  modal.querySelector("button")?.focus();
}

function closeModal(modal) {
  if (modal.id === "sale-checkout-modal" && state.bookingPayment && !state.bookingPayment.id_penjualan) {
    state.bookingPayment = null;
  }
  if (modal.id === "booking-reschedule-modal") {
    state.bookingEditId = null;
    state.bookingEditTime = "";
  }
  modal.hidden = true;
  if (![...document.querySelectorAll(".modal-backdrop")].some((element) => !element.hidden)) {
    document.body.classList.remove("modal-open");
  }
}

function renderSaleDetail(sale) {
  const customer = sale.pelanggan || {};
  byId("detail-modal-title").textContent = `Detail transaksi #${sale.id_penjualan}`;
  byId("detail-number").textContent = `#${sale.id_penjualan}`;
  byId("detail-booking-badge").hidden = !sale.dari_booking;
  byId("detail-date").textContent = formatDate(sale.tanggal);
  byId("detail-customer").textContent = customer.nama || "—";
  byId("detail-phone").textContent = customer.no_hp || "—";
  byId("detail-method").textContent = sale.metode_pembayaran || "—";
  byId("detail-status").textContent = sale.status_pembayaran || "—";
  const discount = Number(sale.diskon_nominal || 0);
  const subtotal = Number(sale.subtotal ?? (Number(sale.total || 0) + discount));
  byId("detail-subtotal").textContent = formatMoney(subtotal);
  byId("detail-total").textContent = formatMoney(sale.total);
  byId("detail-remaining").textContent = formatMoney(sale.sisa_pembayaran || 0);
  byId("detail-discount-row").hidden = discount <= 0;
  byId("detail-discount-label").textContent = `Diskon produk ${Number(sale.diskon_persen || 0)}%`;
  byId("detail-discount-amount").textContent = `−${formatMoney(discount)}`;
  const installmentSection = byId("detail-installment-section");
  const installments = sale.jadwal_cicilan || [];
  installmentSection.hidden = !installments.length;
  byId("detail-installments-body").innerHTML = installments.map((installment) => `<tr>
    <td>${escapeHtml(installment.cicilan_ke)}</td><td>${formatDate(installment.tenggat)}</td>
    <td class="money-cell">${formatMoney(installment.jumlah)}</td><td>${escapeHtml(installment.status)}</td>
  </tr>`).join("");
  renderPaymentHistory("detail-payment-history-section", "detail-payment-history-body", sale.payments || []);
  byId("detail-items-body").innerHTML = (sale.items || []).map((line) => {
    const item = line.item || {};
    return `<tr>
      <td><strong>${escapeHtml(item.nama_item || line.nama_item || "Item")}</strong></td>
      <td>${escapeHtml(item.jenis || line.jenis || "—")}</td>
      <td>${formatMoney(line.harga_satuan)}</td>
      <td>${escapeHtml(line.jumlah)}</td>
      <td class="money-cell align-right">${formatMoney(line.subtotal)}</td>
    </tr>`;
  }).join("") || emptyRow(5, "Detail item tidak tersedia.");
}

function renderReceipt(sale) {
  const customer = sale.pelanggan || {};
  byId("receipt-number").textContent = `#${sale.id_penjualan}`;
  byId("receipt-date").textContent = formatDate(sale.tanggal);
  byId("receipt-customer").textContent = customer.nama || "Pelanggan";
  byId("receipt-method").textContent = sale.metode_pembayaran || "Tunai";
  byId("receipt-status").textContent = sale.status_pembayaran || "Lunas";
  const discount = Number(sale.diskon_nominal || 0);
  const subtotal = Number(sale.subtotal ?? (Number(sale.total || 0) + discount));
  byId("receipt-subtotal").textContent = formatMoney(subtotal);
  byId("receipt-total").textContent = formatMoney(sale.total);
  byId("receipt-discount-row").hidden = discount <= 0;
  byId("receipt-discount-label").textContent = `Diskon produk ${Number(sale.diskon_persen || 0)}%`;
  byId("receipt-discount-amount").textContent = `−${formatMoney(discount)}`;
  byId("receipt-items-body").innerHTML = (sale.items || []).map((line) => {
    const item = line.item || {};
    return `<tr>
      <td>${escapeHtml(item.nama_item || line.nama_item || "Item")}</td>
      <td>${escapeHtml(line.jumlah)}</td>
      <td class="align-right">${formatMoney(line.subtotal)}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="3">Detail item tidak tersedia.</td></tr>`;
}

async function openSaleDetail(id) {
  const sale = await api(`/api/sales/${encodeURIComponent(id)}`);
  state.activeSale = sale;
  renderSaleDetail(sale);
  openModal(byId("sale-detail-modal"));
}

async function openSaleReceipt(id = state.activeSale?.id_penjualan) {
  const sale = state.activeSale?.id_penjualan === id ? state.activeSale : await api(`/api/sales/${encodeURIComponent(id)}`);
  state.activeSale = sale;
  renderReceipt(sale);
  openModal(byId("receipt-modal"));
}

function calculateLedgerOpeningBalances(rows) {
  const balances = new Map();
  rows.forEach((row) => {
    const account = String(row.akun ?? "Akun lainnya");
    if (LEDGER_NOMINAL_ACCOUNTS.has(account)) return;
    const debit = toCents(row.debit);
    const credit = toCents(row.kredit);
    const movement = LEDGER_CREDIT_NORMAL_ACCOUNTS.has(account) ? credit - debit : debit - credit;
    balances.set(account, (balances.get(account) || 0) + movement);
  });
  return new Map([...balances].filter(([, balance]) => balance !== 0));
}

async function fetchLedgerOpeningBalances(start) {
  const balances = new Map();
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const params = new URLSearchParams({
      before: start,
      offset: String(offset),
      limit: String(pageSize)
    });
    const rows = await api(`/api/finance/ledger?${params.toString()}`);
    if (!Array.isArray(rows)) throw new Error("Data saldo awal buku besar tidak valid.");
    const pageBalances = calculateLedgerOpeningBalances(rows);
    pageBalances.forEach((balance, account) => {
      balances.set(account, (balances.get(account) || 0) + balance);
    });
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return new Map([...balances].filter(([, balance]) => balance !== 0));
}

async function loadReport() {
  const start = byId("report-start").value;
  const end = byId("report-end").value;
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const openingBalancesRequest = start ? fetchLedgerOpeningBalances(start) : Promise.resolve(new Map());
  const [report, reportDiscounts, profitLoss, ledger, receivablePaymentReport, openingBalances] = await Promise.all([
    api(`/api/reports?${params.toString()}`),
    api(`/api/reports/discounts?${params.toString()}`),
    api(`/api/finance/profit-loss?${params.toString()}`),
    api(`/api/finance/ledger?${params.toString()}`),
    api(`/api/reports/receivable-payments?${params.toString()}`),
    openingBalancesRequest
  ]);
  state.report = report;
  state.reportDiscounts = reportDiscounts;
  state.reportFinance = { profitLoss, ledger };
  ledgerOpeningBalances = openingBalances;
  state.receivablePaymentReport = receivablePaymentReport;
  renderReport();
}

function renderProfitLoss() {
  const body = byId("profit-loss-body");
  const reportRows = state.report || [];
  const profitLossRows = state.reportFinance.profitLoss?.rows || [];
  const discountRows = state.reportDiscounts || [];
  if (!reportRows.length && !profitLossRows.length && !discountRows.length) {
    body.innerHTML = emptyRow(2, "Tidak ada data laba rugi.");
    return;
  }
  const sum = (rows) => rows.reduce((total, row) => total + Number(row.subtotal || 0), 0);
  const productRevenue = sum(reportRows.filter((row) => row.jenis === "Produk"));
  const serviceRevenue = sum(reportRows.filter((row) => row.jenis === "Jasa Treatment"));
  const grossRevenue = productRevenue + serviceRevenue;
  const discount = discountRows.reduce((total, row) => total + Number(row.diskon_nominal || 0), 0);
  const netRevenue = grossRevenue - discount;
  const hpp = profitLossRows
    .filter((row) => ["Beban Pokok Penjualan", "Harga Pokok Penjualan", "HPP"].includes(row.akun))
    .reduce((total, row) => total + Number(row.nilai || 0), 0);
  const rows = [
    { akun: "Pendapatan Produk", nilai: productRevenue },
    { akun: "Pendapatan Jasa", nilai: serviceRevenue },
    { akun: "Total Pendapatan Kotor", nilai: grossRevenue, className: "profit-loss-summary-row" },
    { akun: "Diskon Penjualan", nilai: discount },
    { akun: "Penjualan Bersih", nilai: netRevenue, className: "profit-loss-summary-row" },
    { akun: "Beban Pokok Penjualan", nilai: hpp },
    { akun: "Laba Kotor", nilai: netRevenue - hpp, className: "profit-loss-result" }
  ];
  body.innerHTML = rows.map((row) => `<tr${row.className ? ` class="${row.className}"` : ""}>
    <td>${escapeHtml(row.akun)}</td>
    <td class="money-cell">${formatMoney(row.nilai)}</td>
  </tr>`).join("");
}

function renderLedger() {
  const body = byId("ledger-body");
  const rows = state.reportFinance.ledger || [];
  const periodNote = document.querySelector(".ledger-period-note");
  if (periodNote) {
    periodNote.textContent = "Saldo awal dihitung dari transaksi sebelum periode yang dipilih (khusus akun neraca). Persediaan Produk bisa bernilai negatif karena pembelian stok tidak dicatat dalam sistem ini.";
  }
  if (!rows.length && !ledgerOpeningBalances.size) {
    body.innerHTML = '<p class="empty-state">Tidak ada transaksi buku besar.</p>';
    return;
  }
  const accountOrder = [
    "Kas",
    "Bank",
    "Piutang Usaha",
    "Persediaan Produk",
    "Diskon Penjualan",
    "Beban Pokok Penjualan",
    "Pendapatan Jasa Treatment",
    "Pendapatan Penjualan Produk"
  ];
  const grouped = new Map();
  rows.forEach((row) => {
    const account = String(row.akun ?? "Akun lainnya");
    const accountRows = grouped.get(account) || [];
    accountRows.push(row);
    grouped.set(account, accountRows);
  });
  ledgerOpeningBalances.forEach((balance, account) => {
    if (balance !== 0 && !grouped.has(account)) grouped.set(account, []);
  });
  const accounts = [
    ...accountOrder.filter((account) => grouped.has(account)),
    ...[...grouped.keys()].filter((account) => !accountOrder.includes(account)).sort((left, right) => left.localeCompare(right, "id"))
  ];

  body.innerHTML = accounts.map((account) => {
    const accountRows = [...grouped.get(account)].sort((left, right) =>
      String(left.tanggal ?? "").localeCompare(String(right.tanggal ?? ""))
      || (Number(left.id_penjualan) || 0) - (Number(right.id_penjualan) || 0)
      || (Number(left.urutan) || 0) - (Number(right.urutan) || 0));
    const debitNormal = !LEDGER_CREDIT_NORMAL_ACCOUNTS.has(account);
    let balance = ledgerOpeningBalances.get(account) || 0;
    const openingBalanceClass = balance < 0 ? " ledger-negative-balance" : "";
    const openingRow = `<tr class="ledger-opening-row">
      <td>—</td><td>—</td><td>${escapeHtml("Saldo awal")}</td>
      <td class="money-cell align-right">—</td><td class="money-cell align-right">—</td>
      <td class="money-cell align-right${openingBalanceClass}">${escapeHtml(formatMoney(balance / 100))}</td>
    </tr>`;
    let totalDebit = 0;
    let totalCredit = 0;
    const tableRows = accountRows.map((row) => {
      const debit = toCents(row.debit);
      const credit = toCents(row.kredit);
      totalDebit += debit;
      totalCredit += credit;
      balance += debitNormal ? debit - credit : credit - debit;
      const transactionId = row.id_penjualan == null ? "—" : `#${row.id_penjualan}`;
      const balanceClass = balance < 0 ? " ledger-negative-balance" : "";
      return `<tr>
        <td>${escapeHtml(formatDate(row.tanggal))}</td>
        <td class="id-cell">${escapeHtml(transactionId)}</td>
        <td>${escapeHtml(row.keterangan || "—")}</td>
        <td class="money-cell align-right">${escapeHtml(formatMoney(debit / 100))}</td>
        <td class="money-cell align-right">${escapeHtml(formatMoney(credit / 100))}</td>
        <td class="money-cell align-right${balanceClass}">${escapeHtml(formatMoney(balance / 100))}</td>
      </tr>`;
    }).join("");
    const totalBalanceClass = balance < 0 ? " ledger-negative-balance" : "";
    return `<section class="ledger-account-block">
      <h3 class="ledger-account-title">${escapeHtml(account)}</h3>
      <div class="table-wrap ledger-account-table-wrap">
        <table class="ledger-table ledger-account-table">
          <thead><tr><th>Tanggal</th><th>No. transaksi</th><th>Keterangan</th><th class="align-right">Debit</th><th class="align-right">Kredit</th><th class="align-right">Saldo</th></tr></thead>
          <tbody>${openingRow}${tableRows}</tbody>
          <tfoot><tr class="ledger-total-row"><td colspan="3">Total</td><td class="money-cell align-right">${escapeHtml(formatMoney(totalDebit / 100))}</td><td class="money-cell align-right">${escapeHtml(formatMoney(totalCredit / 100))}</td><td class="money-cell align-right${totalBalanceClass}">${escapeHtml(formatMoney(balance / 100))}</td></tr></tfoot>
        </table>
      </div>
    </section>`;
  }).join("");
}

function renderReport() {
  const productRows = state.report.filter((row) => row.jenis === "Produk");
  const treatmentRows = state.report.filter((row) => row.jenis === "Jasa Treatment");
  const discountRows = state.reportDiscounts.filter((row) => Number(row.diskon_nominal || 0) > 0);
  const sum = (rows) => rows.reduce((total, row) => total + Number(row.subtotal || 0), 0);
  const quantity = (rows) => rows.reduce((total, row) => total + Number(row.jumlah || 0), 0);
  const grossTotal = sum(state.report);
  const discountTotal = state.reportDiscounts.reduce((total, row) => total + Number(row.diskon_nominal || 0), 0);
  byId("report-products-total").textContent = formatMoney(sum(productRows));
  byId("report-treatment-total").textContent = formatMoney(sum(treatmentRows));
  byId("report-grand-total").textContent = formatMoney(grossTotal);
  byId("report-discount-total").textContent = formatMoney(discountTotal);
  byId("report-net-total").textContent = formatMoney(grossTotal - discountTotal);
  byId("report-products-count").textContent = `${quantity(productRows)} produk terjual`;
  byId("report-treatment-count").textContent = `${quantity(treatmentRows)} treatment terjual`;
  byId("report-row-count").textContent = `${state.report.length} baris detail`;
  byId("discounts-report-body").innerHTML = discountRows.length
    ? discountRows.map((row) => `<tr>
      <td>${formatDate(row.tanggal)}</td><td class="id-cell">#${escapeHtml(row.id_penjualan)}</td>
      <td>${escapeHtml(row.nama_pelanggan)}</td><td>${escapeHtml(row.diskon_persen)}%</td>
      <td class="money-cell align-right">${formatMoney(row.diskon_nominal)}</td>
    </tr>`).join("")
    : emptyRow(5, "Tidak ada diskon produk pada periode ini.");
  const receivablePayments = state.receivablePaymentReport.payments || [];
  byId("report-receivable-cash-total").textContent = formatMoney(state.receivablePaymentReport.total_kas_masuk);
  byId("receivable-payments-report-body").innerHTML = receivablePayments.length
    ? receivablePayments.map((payment) => `<tr>
      <td>${formatDate(payment.tanggal)}</td><td class="id-cell">#${escapeHtml(payment.id_penjualan)}</td>
      <td>${escapeHtml(payment.nama_pelanggan)}</td><td>${payment.cicilan_ke ? `Ke-${escapeHtml(payment.cicilan_ke)}` : "—"}</td>
      <td>${escapeHtml(payment.metode_pembayaran)}</td><td>${escapeHtml(payment.keterangan || "—")}</td>
      <td class="money-cell align-right">${formatMoney(payment.nominal)}</td>
    </tr>`).join("")
    : emptyRow(7, "Tidak ada pelunasan piutang pada periode ini.");
  const body = byId("reports-body");
  if (!state.report.length) {
    body.innerHTML = emptyRow(7, "Tidak ada penjualan pada periode ini.");
  } else {
    body.innerHTML = state.report.map((row) => `<tr>
      <td>${formatDate(row.tanggal)}</td><td class="id-cell">#${escapeHtml(row.id_penjualan)}</td>
      <td>${escapeHtml(row.nama_pelanggan)}</td><td><strong>${escapeHtml(row.nama_item)}</strong></td>
      <td><span class="badge ${row.jenis === "Produk" ? "badge-product" : "badge-treatment"}">${escapeHtml(row.jenis)}</span></td>
      <td>${escapeHtml(row.jumlah)}</td><td class="money-cell align-right">${formatMoney(row.subtotal)}</td>
    </tr>`).join("");
  }
  renderProfitLoss();
  renderLedger();
}

function renderJournalTotals(rows) {
  const debit = rows.reduce((total, row) => total + toCents(row.debit), 0);
  const credit = rows.reduce((total, row) => total + toCents(row.kredit), 0);
  const difference = Math.abs(debit - credit);
  const balanced = difference === 0;
  const status = balanced ? "Seimbang" : "Tidak seimbang";
  const indicator = balanced ? "Seimbang ✓" : `Tidak seimbang: selisih ${formatMoney(difference / 100)}`;

  byId("journal-total-debit").textContent = formatMoney(debit / 100);
  byId("journal-total-credit").textContent = formatMoney(credit / 100);
  byId("journal-balance-state").textContent = status;
  byId("journal-balance-indicator").textContent = indicator;
  byId("journal-balance").classList.toggle("is-balanced", balanced);
  byId("journal-balance").classList.toggle("is-unbalanced", !balanced);
  byId("journal-balance-indicator").classList.toggle("is-balanced", balanced);
  byId("journal-balance-indicator").classList.toggle("is-unbalanced", !balanced);
}

async function loadJournal() {
  const rows = await api("/api/journal");
  renderJournalTotals(rows);
  const body = byId("journal-body");
  if (!rows.length) {
    body.innerHTML = emptyRow(6, "Jurnal akan muncul setelah transaksi dicatat.");
    return;
  }
  body.innerHTML = rows.map((row) => {
    const debit = toCents(row.debit);
    const credit = toCents(row.kredit);
    return `<tr>
      <td>${escapeHtml(formatDate(row.tanggal))}</td><td class="id-cell">#${escapeHtml(row.id_penjualan)}</td>
      <td>${escapeHtml(row.keterangan)}</td><td><strong>${escapeHtml(row.akun)}</strong></td>
      <td class="money-cell align-right">${escapeHtml(debit ? formatMoney(debit / 100) : "—")}</td>
      <td class="money-cell align-right">${escapeHtml(credit ? formatMoney(credit / 100) : "—")}</td>
    </tr>`;
  }).join("");
}

function setSaleDateLimit() {
  const today = bookingToday();
  const input = byId("sale-date");
  input.max = today;
}

function setSaleDateToToday() {
  const today = bookingToday();
  const input = byId("sale-date");
  input.value = today;
  setSaleDateLimit();
}

async function loadInitialData() {
  byId("today-label").textContent = dateFormatter.format(new Date());
  byId("footer-year").textContent = new Date().getFullYear();
  setSaleDateToToday();
  byId("installment-first-due").value = addMonths(bookingToday(), 1);
  byId("customer-date").value = todayIso();
  byId("booking-date").min = bookingToday();
  if (!byId("booking-date").value) byId("booking-date").value = bookingToday();
  if (!state.bookingScheduleDate) state.bookingScheduleDate = bookingToday();
  const today = todayIso();
  const firstDay = `${today.slice(0, 8)}01`;
  byId("report-start").value = firstDay;
  byId("report-end").value = today;
  try {
    const [customers, items, sales, summary] = await Promise.all([
      api("/api/customers"),
      api("/api/items"),
      api("/api/sales"),
      api("/api/dashboard")
    ]);
    state.customers = customers;
    state.items = items;
    renderBookingOptions();
    state.sales = sales;
    renderCustomers();
    renderItems();
    renderSales();
    renderCart();
    renderDashboard(summary);
    await loadReport();
    await loadReceivables();
  } catch (error) {
    state.customers = [];
    state.items = [];
    state.sales = [];
    renderCustomers();
    renderItems();
    renderSales();
    renderCart();
    renderDashboard({ pendapatan: 0, transaksi: 0, piutang: 0 });
    handleError(error);
  }
}

async function initializeAuth() {
  authSession = readStoredAuthSession();
  if (!authSession) {
    endLocalSession();
    return;
  }

  try {
    assertSupabaseConfig();
    await getValidAccessToken();
    toggleAuthScreen(false);
    byId("admin-email").textContent = authSession.email || "";
    showAuthMessage();
    setView(hashViews[location.hash.slice(1)] || "dashboard", false);
    await loadInitialData();
  } catch (error) {
    if (authSession) {
      endLocalSession(error?.message || "Sesi tidak valid. Silakan masuk kembali.");
    }
  }
}

byId("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = byId("login-submit");
  showAuthMessage();
  submitButton.disabled = true;

  try {
    assertSupabaseConfig();
    const email = byId("login-email").value.trim();
    const password = byId("login-password").value;
    const response = await authRequest("token?grant_type=password", { email, password });
    const payload = await responsePayload(response);
    if (!response.ok) {
      showAuthMessage("Email atau password salah.");
      return;
    }

    try {
      storeAuthSession(payload, email);
    } catch (error) {
      showAuthMessage(error?.message || "Email atau password salah.");
      return;
    }

    byId("login-password").value = "";
    clearLocationHash();
    toggleAuthScreen(false);
    showAuthMessage();
    setView("dashboard", false);
    await loadInitialData();
  } catch (error) {
    showAuthMessage(error?.message || "Tidak dapat menghubungi server Supabase.");
  } finally {
    submitButton.disabled = false;
  }
});

byId("toggle-password").addEventListener("click", () => {
  const password = byId("login-password");
  const visible = password.type === "password";
  password.type = visible ? "text" : "password";
  byId("toggle-password").textContent = visible ? "Sembunyikan" : "Lihat";
  byId("toggle-password").setAttribute("aria-pressed", String(visible));
});

async function signOut() {
  const accessToken = authSession?.access_token;
  endLocalSession();
  if (!accessToken) return;

  try {
    const response = await authRequest("logout", undefined, accessToken);
    if (!response.ok) showAuthMessage("Sesi lokal sudah dihapus, tetapi server gagal mengakhiri sesi.");
  } catch {
    showAuthMessage("Sesi lokal sudah dihapus, tetapi server tidak dapat dihubungi.");
  }
}

byId("sign-out").addEventListener("click", () => { signOut().catch(handleError); });

byId("customer-search").addEventListener("input", (event) => {
  state.customerQuery = event.target.value.trim();
  renderCustomers();
});

byId("sales-search").addEventListener("input", (event) => {
  state.salesQuery = event.target.value.trim();
  renderSales();
});

byId("sales-status-filter").addEventListener("change", (event) => {
  state.salesStatusFilter = event.target.value;
  renderSales();
});

byId("booking-customer").addEventListener("change", () => {
  updateBookingSelectionDetails();
  updateBookingSummary();
});
byId("booking-service").addEventListener("change", () => {
  updateBookingSelectionDetails();
  updateBookingSummary();
});
byId("booking-date").addEventListener("change", () => {
  state.bookingFormTime = "";
  loadBookingFormSlots().catch(handleError);
});
byId("booking-time-slots").addEventListener("click", (event) => {
  const button = event.target.closest("[data-booking-slot]");
  if (!button || button.disabled) return;
  state.bookingFormTime = button.dataset.bookingSlot;
  renderBookingSlotGrid("booking-time-slots", byId("booking-date").value, state.bookingFormRows, state.bookingFormTime);
  updateBookingSummary();
});
byId("booking-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (byId("booking-submit").disabled) return;
  const submitButton = byId("booking-submit");
  submitButton.disabled = true;
  try {
    await api("/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        id_pelanggan: Number(byId("booking-customer").value),
        id_item: Number(byId("booking-service").value),
        tanggal: byId("booking-date").value,
        jam: state.bookingFormTime,
        catatan: byId("booking-note").value.trim()
      })
    });
    state.bookingFormTime = "";
    byId("booking-note").value = "";
    await refreshBookingData();
    showNotice("Booking berhasil dibuat.");
  } catch (error) {
    handleError(error);
    try { await loadBookingFormSlots(); } catch (refreshError) { handleError(refreshError); }
  } finally {
    updateBookingSummary();
  }
});
document.querySelectorAll("[data-booking-day-step]").forEach((button) => {
  button.addEventListener("click", () => {
    const date = new Date(`${state.bookingScheduleDate || bookingToday()}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Number(button.dataset.bookingDayStep));
    loadBookingSchedule(date.toISOString().slice(0, 10)).catch(handleError);
  });
});
byId("booking-go-today").addEventListener("click", () => {
  loadBookingSchedule(bookingToday()).catch(handleError);
});
byId("booking-filter-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const start = byId("booking-filter-start").value;
  const end = byId("booking-filter-end").value;
  if (start && end && start > end) {
    showNotice("Tanggal awal filter booking tidak boleh melewati tanggal akhir.", "error");
    return;
  }
  loadAllBookings().catch(handleError);
});
byId("booking-day-list").addEventListener("click", (event) => {
  handleBookingAction(event).catch(handleError);
});
byId("booking-all-body").addEventListener("click", (event) => {
  handleBookingAction(event).catch(handleError);
});
byId("booking-edit-date").addEventListener("change", () => {
  state.bookingEditTime = "";
  loadBookingEditSlots().catch(handleError);
});
byId("booking-edit-time-slots").addEventListener("click", (event) => {
  const button = event.target.closest("[data-booking-slot]");
  if (!button || button.disabled) return;
  state.bookingEditTime = button.dataset.bookingSlot;
  renderBookingSlotGrid("booking-edit-time-slots", byId("booking-edit-date").value, state.bookingEditRows, state.bookingEditTime, state.bookingEditId);
  byId("booking-edit-submit").disabled = false;
});
byId("booking-reschedule-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.bookingEditId || !state.bookingEditTime) return;
  const button = byId("booking-edit-submit");
  button.disabled = true;
  try {
    await api(`/api/bookings/${state.bookingEditId}`, {
      method: "PATCH",
      body: JSON.stringify({ tanggal: byId("booking-edit-date").value, jam: state.bookingEditTime })
    });
    closeModal(byId("booking-reschedule-modal"));
    showNotice("Jadwal booking berhasil diubah.");
    await refreshBookingData();
  } catch (error) {
    handleError(error);
    try { await loadBookingEditSlots(); } catch (refreshError) { handleError(refreshError); }
  } finally {
    button.disabled = !state.bookingEditTime;
  }
});

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});
document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    setView(button.dataset.go);
  });
});

byId("customer-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = byId("customer-id").value;
  const data = {
    nama: byId("customer-name").value.trim(),
    no_hp: byId("customer-phone").value.trim(),
    alamat: byId("customer-address").value.trim(),
    tanggal_daftar: byId("customer-date").value
  };
  try {
    await api(id ? `/api/customers/${id}` : "/api/customers", { method: id ? "PUT" : "POST", body: JSON.stringify(data) });
    byId("customer-form").reset();
    byId("customer-id").value = "";
    byId("customer-date").value = todayIso();
    byId("customer-form-title").textContent = "Tambah pelanggan";
    byId("customer-submit").textContent = "Simpan pelanggan";
    byId("customer-cancel").hidden = true;
    state.customers = await api("/api/customers");
    renderCustomers();
    showNotice(id ? "Data pelanggan berhasil diperbarui." : "Pelanggan berhasil ditambahkan.");
  } catch (error) { handleError(error); }
});

byId("customer-cancel").addEventListener("click", () => {
  byId("customer-form").reset();
  byId("customer-id").value = "";
  byId("customer-date").value = todayIso();
  byId("customer-form-title").textContent = "Tambah pelanggan";
  byId("customer-submit").textContent = "Simpan pelanggan";
  byId("customer-cancel").hidden = true;
});

byId("customers-body").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const customer = state.customers.find((row) => String(row.id_pelanggan) === button.dataset.id);
  if (!customer) return;
  if (button.dataset.action === "edit-customer") {
    byId("customer-id").value = customer.id_pelanggan;
    byId("customer-name").value = customer.nama;
    byId("customer-phone").value = customer.no_hp;
    byId("customer-address").value = customer.alamat || "";
    byId("customer-date").value = String(customer.tanggal_daftar).slice(0, 10);
    byId("customer-form-title").textContent = "Edit pelanggan";
    byId("customer-submit").textContent = "Simpan perubahan";
    byId("customer-cancel").hidden = false;
    byId("customer-name").focus();
  } else if (window.confirm(`Yakin ingin menghapus ${customer.nama}?`)) {
    try {
      await api(`/api/customers/${customer.id_pelanggan}`, { method: "DELETE" });
      state.customers = await api("/api/customers");
      renderCustomers();
      showNotice("Pelanggan berhasil dihapus.");
    } catch (error) { handleError(error); }
  }
});

function updateItemTypeFields() {
  const isService = byId("item-type").value === "Jasa Treatment";
  document.querySelectorAll(".product-only-field").forEach((field) => { field.hidden = isService; });
  if (isService) {
    byId("item-cost").value = "0";
    byId("item-stock").value = "";
  } else if (!byId("item-stock").value) {
    byId("item-stock").value = "0";
  }
}

byId("item-type").addEventListener("change", updateItemTypeFields);
byId("item-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = byId("item-id").value;
  const service = byId("item-type").value === "Jasa Treatment";
  const data = {
    nama_item: byId("item-name").value.trim(),
    jenis: byId("item-type").value,
    harga_jual: Number(byId("item-price").value),
    harga_pokok: service ? 0 : Number(byId("item-cost").value),
    stok: service ? null : Number(byId("item-stock").value)
  };
  try {
    await api(id ? `/api/items/${id}` : "/api/items", { method: id ? "PUT" : "POST", body: JSON.stringify(data) });
    byId("item-form").reset();
    byId("item-id").value = "";
    byId("item-cost").value = "0";
    byId("item-stock").value = "0";
    byId("item-form-title").textContent = "Tambah produk atau jasa";
    byId("item-submit").textContent = "Simpan item";
    byId("item-cancel").hidden = true;
    updateItemTypeFields();
    state.items = await api("/api/items");
    renderItems();
    showNotice(id ? "Item berhasil diperbarui." : "Item berhasil ditambahkan.");
  } catch (error) { handleError(error); }
});

byId("item-cancel").addEventListener("click", () => {
  byId("item-form").reset();
  byId("item-id").value = "";
  byId("item-cost").value = "0";
  byId("item-stock").value = "0";
  byId("item-form-title").textContent = "Tambah produk atau jasa";
  byId("item-submit").textContent = "Simpan item";
  byId("item-cancel").hidden = true;
  updateItemTypeFields();
});

byId("items-body").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const item = state.items.find((row) => String(row.id_item) === button.dataset.id);
  if (!item) return;
  if (button.dataset.action === "edit-item") {
    byId("item-id").value = item.id_item;
    byId("item-name").value = item.nama_item;
    byId("item-type").value = item.jenis;
    byId("item-price").value = item.harga_jual;
    byId("item-cost").value = item.harga_pokok;
    byId("item-stock").value = item.stok ?? "";
    updateItemTypeFields();
    byId("item-form-title").textContent = "Edit produk atau jasa";
    byId("item-submit").textContent = "Simpan perubahan";
    byId("item-cancel").hidden = false;
    byId("item-name").focus();
  } else if (window.confirm(`Yakin ingin menghapus ${item.nama_item}?`)) {
    try {
      await api(`/api/items/${item.id_item}`, { method: "DELETE" });
      state.items = await api("/api/items");
      renderItems();
      showNotice("Item berhasil dihapus.");
    } catch (error) { handleError(error); }
  }
});

byId("catalog-search").addEventListener("input", (event) => {
  state.catalogSearchQuery = event.target.value.trim();
  renderCatalog();
});

document.querySelectorAll("[data-catalog-category]").forEach((button) => {
  button.addEventListener("click", () => {
    state.catalogCategory = button.dataset.catalogCategory;
    document.querySelectorAll("[data-catalog-category]").forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    renderCatalog();
  });
});

byId("catalog-grid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-catalog-action]");
  if (!button) return;
  const action = button.dataset.catalogAction;
  if (action === "add") addCatalogItem(button.dataset.itemId);
  else changeCatalogQuantity(button.dataset.itemId, action === "increase" ? 1 : -1);
});

byId("cart-content").addEventListener("click", (event) => {
  const button = event.target.closest("[data-cart-action]");
  if (!button) return;
  const itemId = button.dataset.itemId;
  const line = state.cart.find((item) => String(item.id_item) === String(itemId));
  if (!line) return;
  if (button.dataset.cartAction === "remove") {
    state.cart = state.cart.filter((item) => String(item.id_item) !== String(itemId));
  } else {
    const item = state.items.find((row) => String(row.id_item) === String(itemId)) || line;
    const nextQuantity = line.jumlah + (button.dataset.cartAction === "increase" ? 1 : -1);
    if (nextQuantity < 1 || (item.jenis === "Produk" && nextQuantity > Number(item.stok || 0))) return;
    line.jumlah = nextQuantity;
  }
  renderCart();
});

byId("sale-customer").addEventListener("change", renderCart);
byId("sale-date").addEventListener("change", () => {
  const today = bookingToday();
  setSaleDateLimit();
  if (byId("sale-date").value > today) {
    setSaleDateToToday();
    showNotice("Tanggal transaksi tidak boleh setelah hari ini.", "error");
  }
  const transactionDate = byId("sale-date").value || today;
  byId("installment-first-due").min = transactionDate;
  if (byId("sale-method").value === "Kredit") {
    byId("installment-first-due").value = addMonths(transactionDate, 1);
  }
  renderCart();
});

byId("checkout-start").addEventListener("click", () => {
  if (!state.cart.length || !byId("sale-customer").value) return;
  renderCheckoutSummary();
  selectPaymentMethod(byId("sale-method").value || "Tunai");
  setCheckoutStep(1);
  openModal(byId("sale-checkout-modal"));
});

byId("checkout-back-to-cart").addEventListener("click", () => closeModal(byId("sale-checkout-modal")));
byId("checkout-to-payment").addEventListener("click", () => {
  if (!byId("sale-customer").value || !byId("sale-date").value) {
    setCheckoutStep(2);
    byId("checkout-error").textContent = "Pilih pelanggan dan tanggal transaksi terlebih dahulu.";
    byId("checkout-error").hidden = false;
    return;
  }
  setCheckoutStep(2);
});
byId("checkout-back-to-order").addEventListener("click", () => setCheckoutStep(1));
document.querySelectorAll("[data-payment-method]").forEach((button) => {
  button.addEventListener("click", () => selectPaymentMethod(button.dataset.paymentMethod));
});

function renderInstallmentPreview() {
  const preview = byId("installment-preview");
  const months = Number(byId("installment-months").value);
  const total = calculateSaleTotals(state.cart).total;
  const firstDue = byId("installment-first-due").value;
  if (!months || !firstDue || !total) {
    preview.innerHTML = "<span>Tambahkan item dan pilih tenor untuk melihat jadwal cicilan.</span>";
    return;
  }
  const baseAmount = Math.round(total / months);
  preview.innerHTML = Array.from({ length: months }, (_, index) => {
    const amount = index === months - 1 ? total - baseAmount * (months - 1) : baseAmount;
    return `<div class="installment-preview-row"><span>Ke-${index + 1}</span><span>Jatuh tempo ${formatDate(addMonths(firstDue, index))}</span><strong>${formatMoney(amount)}</strong></div>`;
  }).join("");
}

function updateInstallmentFields() {
  const isCredit = byId("sale-method").value === "Kredit";
  byId("installment-fields").hidden = !isCredit;
  byId("installment-months").required = isCredit;
  byId("installment-first-due").required = isCredit;
  byId("installment-first-due").min = byId("sale-date").value || bookingToday();
  if (isCredit) {
    if (!byId("installment-first-due").value) {
      byId("installment-first-due").value = addMonths(byId("sale-date").value || bookingToday(), 1);
    }
  }
  renderInstallmentPreview();
}

byId("installment-months").addEventListener("change", renderInstallmentPreview);
byId("installment-first-due").addEventListener("change", renderInstallmentPreview);

byId("receivables-body").addEventListener("click", (event) => {
  const detailButton = event.target.closest("[data-receivable-detail]");
  if (detailButton) {
    openReceivableDetail(detailButton.dataset.receivableDetail);
    return;
  }
  const payButton = event.target.closest("[data-pay-receivable]");
  if (!payButton) return;
  openReceivableDetail(payButton.dataset.payReceivable);
  const nextInstallment = state.activeReceivable?.jadwal_cicilan.find((installment) => installment.status !== "Lunas");
  openInstallmentConfirmation(nextInstallment);
});

byId("receivable-installments-body").addEventListener("click", (event) => {
  const button = event.target.closest("[data-pay-installment]");
  if (!button || !state.activeReceivable) return;
  const installment = state.activeReceivable.jadwal_cicilan.find((row) => String(row.cicilan_ke) === button.dataset.payInstallment);
  openInstallmentConfirmation(installment);
});

byId("cancel-installment-payment").addEventListener("click", () => {
  byId("installment-payment-form").hidden = true;
});

byId("installment-payment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.activeReceivable || !state.activeInstallmentNumber) return;
  const saleId = state.activeReceivable.id_penjualan;
  const submitButton = byId("installment-payment-form").querySelector("button[type='submit']");
  submitButton.disabled = true;
  try {
    await api(`/api/sales/${saleId}/installments/${state.activeInstallmentNumber}/payments`, {
      method: "POST",
      body: JSON.stringify({
        tanggal_bayar: byId("installment-payment-date").value,
        metode_bayar: byId("installment-payment-method").value,
        catatan: byId("installment-payment-note").value.trim()
      })
    });
    await Promise.all([loadReceivables(), loadSales(), loadReport(), loadJournal()]);
    renderDashboard(await api("/api/dashboard"));
    const updatedSale = state.receivables.find((row) => String(row.id_penjualan) === String(saleId));
    state.activeReceivable = null;
    state.activeInstallmentNumber = null;
    state.activeInstallmentAmount = 0;
    byId("installment-payment-form").hidden = true;
    closeModal(byId("receivable-detail-modal"));
    showNotice(`Pembayaran cicilan transaksi #${saleId} berhasil dicatat.`);
  } catch (error) { handleError(error); }
  finally { submitButton.disabled = false; }
});

byId("checkout-submit").addEventListener("click", async () => {
  const method = byId("sale-method").value;
  const errorNotice = byId("checkout-error");
  const dueDate = byId("installment-first-due").value;
  if (!state.cart.length) {
    errorNotice.textContent = "Keranjang masih kosong.";
    errorNotice.hidden = false;
    return;
  }
  if (!byId("sale-customer").value || !byId("sale-date").value) {
    errorNotice.textContent = "Pilih pelanggan dan tanggal transaksi terlebih dahulu.";
    errorNotice.hidden = false;
    return;
  }
  setSaleDateLimit();
  if (!state.bookingPayment?.id_penjualan && byId("sale-date").value > bookingToday()) {
    errorNotice.textContent = "Tanggal transaksi tidak boleh setelah hari ini.";
    errorNotice.hidden = false;
    return;
  }
  if (method === "Kredit" && (!byId("installment-months").value || !dueDate || dueDate < byId("sale-date").value)) {
    errorNotice.textContent = "Lengkapi tenor dan tanggal jatuh tempo pertama yang valid.";
    errorNotice.hidden = false;
    return;
  }
  const button = byId("checkout-submit");
  button.disabled = true;
  errorNotice.hidden = true;
  try {
    let result;
    if (state.bookingPayment?.id_penjualan) {
      result = { id_penjualan: state.bookingPayment.id_penjualan };
      await api(`/api/bookings/${state.bookingPayment.id_booking}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Selesai", id_penjualan: result.id_penjualan })
      });
    } else {
      result = await api("/api/sales", {
        method: "POST",
        body: JSON.stringify({
          id_pelanggan: Number(byId("sale-customer").value),
          tanggal: byId("sale-date").value,
          metode_pembayaran: byId("sale-method").value,
          cicilan_bulan: Number(byId("installment-months").value),
          tanggal_jatuh_tempo_pertama: byId("installment-first-due").value,
          items: state.cart.map((line) => ({ id_item: line.id_item, jumlah: line.jumlah }))
        })
      });
      if (state.bookingPayment) {
        state.bookingPayment.id_penjualan = result.id_penjualan;
        await api(`/api/bookings/${state.bookingPayment.id_booking}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "Selesai", id_penjualan: result.id_penjualan })
        });
      }
    }
    state.bookingPayment = null;
    closeModal(byId("sale-checkout-modal"));
    state.cart = [];
    state.catalogQuantities = {};
    state.addedItemId = null;
    byId("sale-customer").value = "";
    setSaleDateToToday();
    byId("installment-first-due").value = addMonths(bookingToday(), 1);
    byId("installment-months").value = "";
    selectPaymentMethod("Tunai");
    renderCart();
    await loadInitialData();
    try { await loadBookingPage(); } catch (error) { handleError(error); }
    showSaleSuccessNotice(result.id_penjualan);
  } catch (error) {
    errorNotice.textContent = state.bookingPayment?.id_penjualan
      ? `Transaksi #${state.bookingPayment.id_penjualan} sudah tersimpan, tetapi booking belum diperbarui: ${error?.message || "terjadi kesalahan"}. Tekan tombol lagi untuk mencoba tanpa membuat transaksi baru.`
      : error?.message || "Transaksi gagal disimpan.";
    if (state.bookingPayment?.id_penjualan) button.textContent = "Ulangi tautkan booking";
    errorNotice.hidden = false;
  }
  finally {
    button.disabled = false;
    if (!state.bookingPayment?.id_penjualan) button.textContent = "Konfirmasi & simpan transaksi";
  }
});

byId("report-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (byId("report-start").value && byId("report-end").value && byId("report-start").value > byId("report-end").value) {
    return showNotice("Tanggal awal tidak boleh melewati tanggal akhir.", "error");
  }
  loadReport().catch(handleError);
});

byId("sales-body").addEventListener("click", (event) => {
  const button = event.target.closest("[data-sale-action]");
  if (!button) return;
  if (button.dataset.saleAction === "detail") openSaleDetail(button.dataset.id).catch(handleError);
  if (button.dataset.saleAction === "receipt") openSaleReceipt(button.dataset.id).catch(handleError);
});

byId("notice").addEventListener("click", (event) => {
  const button = event.target.closest("[data-notice-receipt]");
  if (button) openSaleReceipt(button.dataset.noticeReceipt).catch(handleError);
});

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => closeModal(button.closest(".modal-backdrop")));
});
document.querySelectorAll(".modal-backdrop").forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal(modal);
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.querySelectorAll(".modal-backdrop:not([hidden])").forEach(closeModal);
  }
});

byId("detail-open-receipt").addEventListener("click", () => {
  closeModal(byId("sale-detail-modal"));
  openSaleReceipt().catch(handleError);
});

byId("receipt-open-detail").addEventListener("click", () => {
  closeModal(byId("receipt-modal"));
  if (state.activeSale) {
    renderSaleDetail(state.activeSale);
    openModal(byId("sale-detail-modal"));
  }
});

byId("receipt-print").addEventListener("click", () => window.print());

document.querySelectorAll("[data-report-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const selected = button.dataset.reportTab;
    document.querySelectorAll("[data-report-tab]").forEach((tab) => tab.classList.toggle("is-active", tab === button));
    document.getElementById("profit-loss-panel").classList.toggle("is-active", selected === "profit-loss");
    document.getElementById("ledger-panel").classList.toggle("is-active", selected === "ledger");
  });
});

byId("export-report-csv").addEventListener("click", () => {
  const rows = state.report || [];
  if (!rows.length) {
    showNotice("Belum ada data untuk diekspor.", "error");
    return;
  }
  const discountsBySale = new Map(state.reportDiscounts.map((row) => [String(row.id_penjualan), row]));
  const exportedDiscounts = new Set();
  const csv = [
    ["Tanggal", "No. transaksi", "Pelanggan", "Item", "Jenis", "Jumlah", "Subtotal kotor", "Diskon (%)", "Diskon nominal"],
    ...rows.map((row) => {
      const saleId = String(row.id_penjualan);
      const firstSaleRow = !exportedDiscounts.has(saleId);
      exportedDiscounts.add(saleId);
      const discount = discountsBySale.get(saleId);
      return [
        row.tanggal, row.id_penjualan, row.nama_pelanggan, row.nama_item, row.jenis, row.jumlah, row.subtotal,
        firstSaleRow ? discount?.diskon_persen || 0 : "",
        firstSaleRow ? discount?.diskon_nominal || 0 : ""
      ];
    })
  ].map((line) => line.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "laporan-penjualan.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showNotice("Laporan berhasil diekspor ke Excel/CSV.");
});

byId("print-report-pdf").addEventListener("click", () => window.print());

updateInstallmentFields();
renderCart();
initializeAuth();

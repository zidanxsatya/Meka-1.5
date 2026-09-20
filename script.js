/* ============================================================================
   MEKA 1.3 — script.js
   Struktur file (cari header di bawah untuk lompat ke bagian yang diinginkan):
   1. STORAGE HELPERS (localStorage + versioning)
   2. XP, LEVEL & ACHIEVEMENT
   3. DATA MATERI (MATERIALS_DATA)
   4. RENDER MATERI (accordion + lesson view)
   5. DATA & LOGIKA KUIS (bank soal, mode latihan, mode ujian)
   6. SIMULATOR GERBANG LOGIKA (dipertahankan dari MEKA 1.2, logika sama)
   7. NAVIGASI SIDEBAR, HAMBURGER, DASHBOARD BERANDA
   8. INISIALISASI
   ============================================================================ */


/* ============================================================================
   1. STORAGE HELPERS
   Semua data pengguna (progress, XP, achievement, riwayat kuis) disimpan di
   localStorage milik browser masing-masing — tidak ada server/database.
   ============================================================================ */
const STORAGE_KEYS = {
  VERSION: 'mekaDataVersion',
  PROGRESS: 'mekaProgress',       // { completed: [id, id, ...] }
  XP: 'mekaXP',                   // angka (string di localStorage)
  ACHIEVEMENTS: 'mekaAchievements', // [ id, id, ... ] achievement yang sudah terbuka
  HISTORY: 'mekaQuizHistory'      // [ { title, percent, date }, ... ]
};

const CURRENT_DATA_VERSION = '1.3.0';

// Baca JSON dari localStorage dengan aman; kembalikan fallback jika belum ada/rusak
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

// Simpan JSON ke localStorage dengan aman (misal quota penuh tidak membuat website crash)
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('Gagal menyimpan ke localStorage:', key, err);
  }
}

// Dipanggil sekali di awal: pastikan semua key dasar tersedia agar tidak ada
// error "undefined" saat website dibuka pertama kali oleh pengguna baru.
function initStorage() {
  const storedVersion = localStorage.getItem(STORAGE_KEYS.VERSION);

  if (loadJSON(STORAGE_KEYS.PROGRESS, null) === null) {
    saveJSON(STORAGE_KEYS.PROGRESS, { completed: [] });
  }
  if (localStorage.getItem(STORAGE_KEYS.XP) === null) {
    localStorage.setItem(STORAGE_KEYS.XP, '0');
  }
  if (loadJSON(STORAGE_KEYS.ACHIEVEMENTS, null) === null) {
    saveJSON(STORAGE_KEYS.ACHIEVEMENTS, []);
  }
  if (loadJSON(STORAGE_KEYS.HISTORY, null) === null) {
    saveJSON(STORAGE_KEYS.HISTORY, []);
  }

  if (storedVersion !== CURRENT_DATA_VERSION) {
    // Tempat migrasi data jika struktur berubah di versi mendatang.
    // Untuk 1.3.0 (rilis pertama sistem ini) cukup tandai versinya.
    localStorage.setItem(STORAGE_KEYS.VERSION, CURRENT_DATA_VERSION);
  }
}

function getProgress() {
  return loadJSON(STORAGE_KEYS.PROGRESS, { completed: [] });
}

function isLessonDone(lessonId) {
  return getProgress().completed.includes(lessonId);
}

// Menandai/membatalkan status selesai sebuah submateri. Mengembalikan status baru (true/false).
function toggleLessonDone(lessonId) {
  const progress = getProgress();
  const idx = progress.completed.indexOf(lessonId);
  let nowDone;

  if (idx === -1) {
    progress.completed.push(lessonId);
    addXP(20); // +20 XP setiap materi baru ditandai selesai
    nowDone = true;
  } else {
    progress.completed.splice(idx, 1);
    addXP(-20); // batalkan XP jika status dibatalkan, supaya tidak bisa dicurangi
    nowDone = false;
  }

  saveJSON(STORAGE_KEYS.PROGRESS, progress);
  return nowDone;
}

function getXP() {
  const xp = parseInt(localStorage.getItem(STORAGE_KEYS.XP), 10);
  return Number.isNaN(xp) ? 0 : xp;
}

function addXP(amount) {
  const newXP = Math.max(0, getXP() + amount);
  localStorage.setItem(STORAGE_KEYS.XP, String(newXP));
}


/* ============================================================================
   2. XP, LEVEL & ACHIEVEMENT
   ============================================================================ */
const XP_PER_LEVEL = 250;
const LEVEL_TITLES = [
  'Digital Newbie', 'Logic Explorer', 'Digital Learner',
  'Circuit Apprentice', 'Signal Analyst', 'Mekatronika Enthusiast',
  'Mekatronika Master'
];

// Hitung level & posisi XP saat ini berdasarkan total XP (bukan disimpan terpisah,
// supaya level selalu konsisten dengan jumlah XP dan tidak bisa desync).
function getLevelInfo(totalXP) {
  const level = Math.floor(totalXP / XP_PER_LEVEL) + 1;
  const xpIntoLevel = totalXP % XP_PER_LEVEL;
  const title = LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)];
  return { level, xpIntoLevel, xpForNext: XP_PER_LEVEL, title, totalXP };
}

// GANTI/TAMBAH badge di sini. 'check' menerima objek state dan mengembalikan true/false.
const ACHIEVEMENT_DEFS = [
  {
    id: 'first_step', icon: '🏆', title: 'First Step',
    desc: 'Menyelesaikan materi pertama.',
    check: (s) => s.completed.length >= 1
  },
  {
    id: 'logic_beginner', icon: '🏆', title: 'Logic Beginner',
    desc: 'Menyelesaikan semua materi Gerbang Logika.',
    check: (s) => s.gateLessonIds.length > 0 && s.gateLessonIds.every(id => s.completed.includes(id))
  },
  {
    id: 'quiz_master', icon: '🏆', title: 'Quiz Master',
    desc: 'Mendapatkan nilai minimal 80 pada kuis.',
    check: (s) => s.quizHistory.some(h => h.percent >= 80)
  },
  {
    id: 'digital_learner', icon: '🏆', title: 'Digital Learner',
    desc: 'Menyelesaikan 10 materi.',
    check: (s) => s.completed.length >= 10
  },
  {
    id: 'circuit_builder', icon: '🔒', title: 'Circuit Builder',
    desc: 'Selesaikan 20 materi.',
    check: (s) => s.completed.length >= 20
  }
];

// Menghitung ulang achievement mana yang baru terbuka, menyimpannya (achievement
// yang sudah terbuka tidak akan pernah terkunci lagi walau progress berubah).
function refreshAchievements() {
  const progress = getProgress();
  const gateLessonIds = getAllLessonsFlat()
    .filter(l => l.categoryId === 'gerbang-logika')
    .map(l => l.id);

  const state = {
    completed: progress.completed,
    gateLessonIds,
    quizHistory: loadJSON(STORAGE_KEYS.HISTORY, [])
  };

  const unlocked = new Set(loadJSON(STORAGE_KEYS.ACHIEVEMENTS, []));
  ACHIEVEMENT_DEFS.forEach(def => {
    if (!unlocked.has(def.id) && def.check(state)) {
      unlocked.add(def.id);
    }
  });

  saveJSON(STORAGE_KEYS.ACHIEVEMENTS, Array.from(unlocked));
  return Array.from(unlocked);
}

// Cache MURNI VISUAL untuk mendeteksi achievement mana yang BARU terbuka sejak
// render terakhir (dipakai untuk menampilkan toast). Tidak memengaruhi kondisi
// unlock itu sendiri — itu tetap sepenuhnya dihitung oleh refreshAchievements().
let achievementSeenCache = null;

function renderAchievements() {
  const unlockedIds = refreshAchievements();
  const grid = document.getElementById('achievementsGrid');
  if (!grid) return;

  const isFirstRender = achievementSeenCache === null;
  const newlyUnlocked = isFirstRender ? [] : unlockedIds.filter(id => !achievementSeenCache.includes(id));
  achievementSeenCache = unlockedIds;

  grid.innerHTML = '';
  ACHIEVEMENT_DEFS.forEach(def => {
    const isUnlocked = unlockedIds.includes(def.id);
    const card = document.createElement('div');
    card.className = `badge-card ${isUnlocked ? 'unlocked' : 'locked'}`;
    if (newlyUnlocked.includes(def.id)) {
      card.classList.add('just-unlocked');
    }

    const icon = document.createElement('span');
    icon.className = 'badge-icon';
    icon.textContent = isUnlocked ? def.icon : '🔒';

    const textWrap = document.createElement('div');
    const title = document.createElement('p');
    title.className = 'badge-title';
    title.textContent = def.title;
    const desc = document.createElement('p');
    desc.className = 'badge-desc';
    desc.textContent = def.desc;

    textWrap.appendChild(title);
    textWrap.appendChild(desc);
    card.appendChild(icon);
    card.appendChild(textWrap);
    grid.appendChild(card);
  });

  newlyUnlocked.forEach(id => {
    const def = ACHIEVEMENT_DEFS.find(d => d.id === id);
    if (def) showAchievementToast(def);
  });
}

// Menampilkan notifikasi kecil (toast) di pojok bawah layar. Murni visual.
function showAchievementToast(def) {
  const toast = document.getElementById('achievementToast');
  const iconEl = document.getElementById('achievementToastIcon');
  const titleEl = document.getElementById('achievementToastTitle');
  if (!toast || !iconEl || !titleEl) return;

  iconEl.textContent = def.icon;
  titleEl.textContent = def.title;
  toast.classList.add('show');

  clearTimeout(showAchievementToast._timer);
  showAchievementToast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}


/* ============================================================================
   3. DATA MATERI
   Untuk menambah kategori baru: tambahkan object baru di array MATERIALS_DATA.
   Untuk menambah submateri: tambahkan object baru di 'items' kategori terkait.
   Setiap item WAJIB punya id unik (dipakai untuk menyimpan status selesai).
   Untuk submateri Gerbang Logika, tambahkan properti 'gate' agar tombol
   "Coba di Simulator" muncul dan terhubung ke simulator yang benar.
   ============================================================================ */
const MATERIALS_DATA = [
  {
    id: 'dasar-digital',
    title: '01 Dasar Digital',
    items: [
      { id: 'dd-pengertian', title: 'Pengertian Sistem Digital', body:
        `<p>Sistem digital adalah sistem yang memproses dan menyimpan informasi dalam bentuk nilai-nilai
        diskrit (terpisah jelas), umumnya hanya dua kondisi: 0 dan 1. Ini berbeda dengan sistem analog
        yang nilainya berubah secara kontinu (naik-turun secara halus).</p>
        <p>Dalam sistem kontrol mekatronika, rangkaian digital dipakai untuk mengambil keputusan otomatis
        berdasarkan sinyal dari sensor, misalnya menyalakan motor hanya jika dua kondisi sensor terpenuhi
        sekaligus.</p>` },
      { id: 'dd-sinyal', title: 'Sinyal Digital', body:
        `<p>Sinyal digital digambarkan sebagai gelombang kotak yang hanya memiliki dua level tegangan:
        tinggi (mewakili logika 1) dan rendah (mewakili logika 0). Karena hanya ada dua kemungkinan,
        sinyal digital jauh lebih tahan terhadap gangguan/noise dibanding sinyal analog.</p>
        <p>Contoh sinyal digital di dunia nyata: sinyal ON/OFF dari saklar, output sensor limit switch,
        atau data yang dikirim antar mikrokontroler.</p>` },
      { id: 'dd-biner', title: 'Bilangan Biner', body:
        `<p>Bilangan biner adalah sistem bilangan berbasis 2, hanya menggunakan digit 0 dan 1. Inilah
        bahasa dasar yang dipahami oleh seluruh rangkaian digital dan komputer.</p>
        <table class="truth-table"><thead><tr><th>Desimal</th><th>Biner</th></tr></thead><tbody>
        <tr><td>0</td><td>0000</td></tr><tr><td>1</td><td>0001</td></tr><tr><td>2</td><td>0010</td></tr>
        <tr><td>3</td><td>0011</td></tr><tr><td>4</td><td>0100</td></tr><tr><td>8</td><td>1000</td></tr>
        </tbody></table>` },
      { id: 'dd-desimal', title: 'Bilangan Desimal', body:
        `<p>Bilangan desimal adalah sistem bilangan berbasis 10 yang kita pakai sehari-hari, menggunakan
        10 digit (0–9). Setiap posisi digit memiliki bobot berupa pangkat 10 (satuan, puluhan, ratusan,
        dan seterusnya).</p>` },
      { id: 'dd-oktal', title: 'Bilangan Oktal', body:
        `<p>Bilangan oktal adalah sistem bilangan berbasis 8, menggunakan digit 0–7. Sistem ini pernah
        populer di awal perkembangan komputer sebagai cara ringkas menuliskan kelompok 3-bit biner.</p>` },
      { id: 'dd-hexa', title: 'Bilangan Heksadesimal', body:
        `<p>Bilangan heksadesimal berbasis 16, menggunakan digit 0–9 lalu dilanjutkan huruf A–F (A=10
        hingga F=15). Sistem ini banyak dipakai untuk menuliskan alamat memori dan kode warna (misalnya
        <code>#4fd1c5</code>) karena lebih ringkas dari biner.</p>` },
      { id: 'dd-konversi', title: 'Konversi Bilangan Sederhana', body:
        `<p>Cara sederhana mengubah desimal ke biner adalah dengan membagi berulang dengan 2 dan mencatat
        sisa baginya dari bawah ke atas.</p>
        <p>Contoh: 13 ÷ 2 = 6 sisa 1 → 6 ÷ 2 = 3 sisa 0 → 3 ÷ 2 = 1 sisa 1 → 1 ÷ 2 = 0 sisa 1.
        Dibaca dari bawah: <strong>13 (desimal) = 1101 (biner)</strong>.</p>` }
    ]
  },
  {
    id: 'gerbang-logika',
    title: '02 Gerbang Logika',
    items: [
      { id: 'gl-and', title: 'Gerbang AND', gate: 'AND', body:
        `<p>Gerbang AND menghasilkan keluaran 1 hanya jika <strong>semua</strong> masukannya bernilai 1.</p>
        <table class="truth-table"><thead><tr><th>A</th><th>B</th><th>Out</th></tr></thead><tbody>
        <tr><td>0</td><td>0</td><td>0</td></tr><tr><td>0</td><td>1</td><td>0</td></tr>
        <tr><td>1</td><td>0</td><td>0</td></tr><tr><td>1</td><td>1</td><td>1</td></tr></tbody></table>` },
      { id: 'gl-or', title: 'Gerbang OR', gate: 'OR', body:
        `<p>Gerbang OR menghasilkan keluaran 1 jika <strong>salah satu atau lebih</strong> masukannya
        bernilai 1.</p>
        <table class="truth-table"><thead><tr><th>A</th><th>B</th><th>Out</th></tr></thead><tbody>
        <tr><td>0</td><td>0</td><td>0</td></tr><tr><td>0</td><td>1</td><td>1</td></tr>
        <tr><td>1</td><td>0</td><td>1</td></tr><tr><td>1</td><td>1</td><td>1</td></tr></tbody></table>` },
      { id: 'gl-not', title: 'Gerbang NOT', gate: 'NOT', body:
        `<p>Gerbang NOT membalik nilai satu masukan tunggal — sering disebut gerbang inverter.</p>
        <table class="truth-table"><thead><tr><th>A</th><th>Out</th></tr></thead><tbody>
        <tr><td>0</td><td>1</td></tr><tr><td>1</td><td>0</td></tr></tbody></table>` },
      { id: 'gl-nand', title: 'Gerbang NAND', gate: 'NAND', body:
        `<p>Gerbang NAND adalah kebalikan dari AND — keluaran hanya 0 jika semua masukan bernilai 1.</p>
        <table class="truth-table"><thead><tr><th>A</th><th>B</th><th>Out</th></tr></thead><tbody>
        <tr><td>0</td><td>0</td><td>1</td></tr><tr><td>0</td><td>1</td><td>1</td></tr>
        <tr><td>1</td><td>0</td><td>1</td></tr><tr><td>1</td><td>1</td><td>0</td></tr></tbody></table>` },
      { id: 'gl-nor', title: 'Gerbang NOR', gate: 'NOR', body:
        `<p>Gerbang NOR adalah kebalikan dari OR — keluaran hanya 1 jika semua masukan bernilai 0.</p>
        <table class="truth-table"><thead><tr><th>A</th><th>B</th><th>Out</th></tr></thead><tbody>
        <tr><td>0</td><td>0</td><td>1</td></tr><tr><td>0</td><td>1</td><td>0</td></tr>
        <tr><td>1</td><td>0</td><td>0</td></tr><tr><td>1</td><td>1</td><td>0</td></tr></tbody></table>` },
      { id: 'gl-xor', title: 'Gerbang XOR', gate: 'XOR', body:
        `<p>Gerbang XOR menghasilkan keluaran 1 jika kedua masukannya <strong>berbeda</strong> nilai.</p>
        <table class="truth-table"><thead><tr><th>A</th><th>B</th><th>Out</th></tr></thead><tbody>
        <tr><td>0</td><td>0</td><td>0</td></tr><tr><td>0</td><td>1</td><td>1</td></tr>
        <tr><td>1</td><td>0</td><td>1</td></tr><tr><td>1</td><td>1</td><td>0</td></tr></tbody></table>` },
      { id: 'gl-xnor', title: 'Gerbang XNOR', gate: 'XNOR', body:
        `<p>Gerbang XNOR adalah kebalikan dari XOR — keluaran 1 jika kedua masukannya <strong>sama</strong>
        nilainya.</p>
        <table class="truth-table"><thead><tr><th>A</th><th>B</th><th>Out</th></tr></thead><tbody>
        <tr><td>0</td><td>0</td><td>1</td></tr><tr><td>0</td><td>1</td><td>0</td></tr>
        <tr><td>1</td><td>0</td><td>0</td></tr><tr><td>1</td><td>1</td><td>1</td></tr></tbody></table>` }
    ]
  },
  {
    id: 'aljabar-boolean',
    title: '03 Aljabar Boolean',
    items: [
      { id: 'ab-pengertian', title: 'Pengertian Aljabar Boolean', body:
        `<p>Aljabar Boolean adalah cabang matematika yang bekerja dengan nilai benar (1) dan salah (0),
        dipakai untuk menyederhanakan dan menganalisis rangkaian logika secara matematis, bukan hanya
        lewat tabel kebenaran.</p>` },
      { id: 'ab-and', title: 'Operasi AND (·)', body:
        `<p>Operasi AND dilambangkan dengan titik (<code>A · B</code>) atau kadang ditulis tanpa simbol
        (<code>AB</code>). Hasilnya benar hanya jika A dan B sama-sama benar.</p>` },
      { id: 'ab-or', title: 'Operasi OR (+)', body:
        `<p>Operasi OR dilambangkan dengan tanda tambah (<code>A + B</code>). Hasilnya benar jika salah
        satu (atau keduanya) dari A atau B bernilai benar.</p>` },
      { id: 'ab-not', title: 'Operasi NOT (¬ / bar)', body:
        `<p>Operasi NOT dilambangkan dengan garis di atas variabel (<code>Ā</code>) atau tanda petik
        (<code>A'</code>). Operasi ini membalik nilai kebenaran suatu variabel.</p>` },
      { id: 'ab-hukum', title: 'Hukum Dasar Boolean', body:
        `<ul>
          <li><strong>Hukum Identitas:</strong> A + 0 = A, A · 1 = A</li>
          <li><strong>Hukum Null:</strong> A + 1 = 1, A · 0 = 0</li>
          <li><strong>Hukum Idempoten:</strong> A + A = A, A · A = A</li>
          <li><strong>Hukum Komplemen:</strong> A + Ā = 1, A · Ā = 0</li>
        </ul>` },
      { id: 'ab-contoh', title: 'Contoh Ekspresi Boolean Sederhana', body:
        `<p>Ekspresi <code>Y = A · B + C</code> berarti keluaran Y bernilai 1 jika (A DAN B sama-sama 1)
        ATAU C bernilai 1. Ekspresi seperti ini bisa langsung diterjemahkan menjadi rangkaian gerbang
        logika (satu gerbang AND untuk A·B, digabung ke gerbang OR bersama C).</p>` }
    ]
  },
  {
    id: 'tabel-kebenaran',
    title: '04 Tabel Kebenaran',
    items: [
      { id: 'tk-pengertian', title: 'Pengertian Tabel Kebenaran', body:
        `<p>Tabel kebenaran (truth table) adalah tabel yang menampilkan seluruh kemungkinan kombinasi
        nilai masukan beserta hasil keluarannya, sehingga perilaku suatu rangkaian logika bisa dilihat
        secara lengkap dan pasti.</p>` },
      { id: 'tk-cara', title: 'Cara Membuat Tabel Kebenaran', body:
        `<p>Langkah membuatnya: (1) tentukan jumlah variabel masukan (n), (2) buat baris sebanyak
        2 pangkat n untuk mencakup semua kombinasi 0/1, (3) hitung keluaran setiap baris sesuai
        ekspresi atau gerbang logikanya.</p>` },
      { id: 'tk-contoh', title: 'Contoh Tabel Kebenaran', body:
        `<p>Untuk 2 variabel (A dan B), akan ada 2² = 4 baris kombinasi, seperti tabel kebenaran gerbang
        AND/OR yang sudah kamu pelajari di kategori Gerbang Logika.</p>
        <table class="truth-table"><thead><tr><th>A</th><th>B</th></tr></thead><tbody>
        <tr><td>0</td><td>0</td></tr><tr><td>0</td><td>1</td></tr>
        <tr><td>1</td><td>0</td></tr><tr><td>1</td><td>1</td></tr></tbody></table>` }
    ]
  },
  {
    id: 'rangkaian-kombinasional',
    title: '05 Rangkaian Kombinasional',
    items: [
      { id: 'rk-half-adder', title: 'Half Adder', body:
        `<p>Half Adder adalah rangkaian yang menjumlahkan dua bit biner (A dan B), menghasilkan dua
        keluaran: <strong>Sum</strong> (hasil penjumlahan, dari gerbang XOR) dan <strong>Carry</strong>
        (bawaan, dari gerbang AND).</p>` },
      { id: 'rk-full-adder', title: 'Full Adder', body:
        `<p>Full Adder mirip Half Adder, tetapi bisa menjumlahkan tiga bit sekaligus (A, B, dan Carry-in
        dari penjumlahan sebelumnya) — inilah blok bangunan dasar untuk membuat rangkaian penjumlah
        bilangan biner yang lebih panjang.</p>` },
      { id: 'rk-multiplexer', title: 'Multiplexer', body:
        `<p>Multiplexer (MUX) adalah rangkaian yang memilih salah satu dari beberapa sinyal masukan
        untuk diteruskan ke satu keluaran, berdasarkan sinyal kontrol/selektor tertentu. Bayangkan
        seperti saklar pemilih channel.</p>` }
    ]
  }
];

// Meratakan seluruh submateri dari semua kategori menjadi satu array berurutan,
// dipakai untuk menghitung total progress dan mencari "materi berikutnya yang belum selesai".
function getAllLessonsFlat() {
  const flat = [];
  MATERIALS_DATA.forEach(category => {
    category.items.forEach(item => {
      flat.push({ id: item.id, title: item.title, categoryId: category.id, categoryTitle: category.title, gate: item.gate || null });
    });
  });
  return flat;
}


/* ============================================================================
   4. RENDER MATERI (accordion kategori + lesson view)
   ============================================================================ */
const materiCategoriesEl = document.getElementById('materiCategories');
const lessonView = document.getElementById('lessonView');
const lessonBreadcrumb = document.getElementById('lessonBreadcrumb');
const lessonTitle = document.getElementById('lessonTitle');
const lessonContent = document.getElementById('lessonContent');
const btnTandaiSelesai = document.getElementById('btnTandaiSelesai');
const btnKeSimulator = document.getElementById('btnKeSimulator');
const btnKembaliMateri = document.getElementById('btnKembaliMateri');

let openCategoryId = null;   // kategori mana yang sedang terbuka di accordion
let currentLessonId = null;  // submateri mana yang sedang dibuka di lesson-view

function renderMateriCategories() {
  materiCategoriesEl.innerHTML = '';
  const progress = getProgress();

  MATERIALS_DATA.forEach(category => {
    const doneCount = category.items.filter(item => progress.completed.includes(item.id)).length;

    const card = document.createElement('div');
    card.className = `category-card ${openCategoryId === category.id ? 'open' : ''}`;
    card.dataset.categoryId = category.id;

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'category-header';
    header.innerHTML = `
      <span class="category-header-title">
        <strong>${category.title}</strong>
        <span class="category-fraction">${doneCount} / ${category.items.length} selesai</span>
      </span>
      <span class="category-chevron" aria-hidden="true">▾</span>
    `;
    header.addEventListener('click', () => {
      openCategoryId = (openCategoryId === category.id) ? null : category.id;
      renderMateriCategories();
    });

    const body = document.createElement('div');
    body.className = 'category-body';

    category.items.forEach(item => {
      const isDone = progress.completed.includes(item.id);
      const lessonBtn = document.createElement('button');
      lessonBtn.type = 'button';
      lessonBtn.className = `lesson-item ${isDone ? 'done' : ''}`;
      lessonBtn.innerHTML = `<span class="lesson-status">${isDone ? '✓' : '○'}</span> ${item.title}`;
      lessonBtn.addEventListener('click', () => openLesson(category.id, item.id));
      body.appendChild(lessonBtn);
    });

    card.appendChild(header);
    card.appendChild(body);
    materiCategoriesEl.appendChild(card);
  });
}

// Membuka kategori tertentu saja (dipakai oleh klik sub-menu sidebar)
function expandCategoryOnly(categoryId) {
  openCategoryId = categoryId;
  closeLesson();
  renderMateriCategories();
}

function openLesson(categoryId, itemId) {
  const category = MATERIALS_DATA.find(c => c.id === categoryId);
  const item = category && category.items.find(i => i.id === itemId);
  if (!item) return;

  currentLessonId = itemId;

  lessonBreadcrumb.textContent = category.title;
  lessonTitle.textContent = item.title;
  lessonContent.innerHTML = item.body;

  updateTandaiSelesaiButton();

  if (item.gate) {
    btnKeSimulator.classList.remove('hidden');
    btnKeSimulator.dataset.gate = item.gate;
  } else {
    btnKeSimulator.classList.add('hidden');
    btnKeSimulator.removeAttribute('data-gate');
  }

  materiCategoriesEl.classList.add('hidden');
  lessonView.classList.remove('hidden');
  lessonView.classList.remove('fade-in');
  void lessonView.offsetWidth;
  lessonView.classList.add('fade-in');

  lessonView.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeLesson() {
  currentLessonId = null;
  lessonView.classList.add('hidden');
  materiCategoriesEl.classList.remove('hidden');
}

function updateTandaiSelesaiButton() {
  const done = isLessonDone(currentLessonId);
  btnTandaiSelesai.textContent = done ? '✓ Materi selesai' : 'Tandai sebagai selesai';
  btnTandaiSelesai.classList.toggle('is-done', done);
}

btnTandaiSelesai.addEventListener('click', () => {
  if (!currentLessonId) return;
  toggleLessonDone(currentLessonId);
  updateTandaiSelesaiButton();
  renderDashboard();       // progress di Beranda & Progress ikut ter-update langsung
  renderAchievements();
});

btnKeSimulator.addEventListener('click', () => {
  const gateName = btnKeSimulator.dataset.gate;
  if (!gateName) return;
  closeLesson();
  document.getElementById('simulator').scrollIntoView({ behavior: 'smooth', block: 'start' });
  openSimulation(gateName);
});

btnKembaliMateri.addEventListener('click', closeLesson);


/* ============================================================================
   5. DATA & LOGIKA KUIS
   Untuk menambah soal: tambahkan object baru di array QUIZ_BANK.
   Setiap soal butuh: question, options, answerIndex, explanation, category, difficulty.
   ============================================================================ */
const QUIZ_BANK = [
  { question: 'Sistem digital merepresentasikan informasi dalam bentuk apa?', options: ['Gelombang sinus kontinu', 'Nilai diskrit 0 dan 1', 'Warna cahaya', 'Suhu ruangan'], answerIndex: 1, explanation: 'Sistem digital hanya mengenal dua kondisi diskrit: 0 (rendah) dan 1 (tinggi).', category: 'Dasar Digital', difficulty: 'Mudah' },
  { question: 'Bilangan biner menggunakan basis berapa?', options: ['Basis 2', 'Basis 8', 'Basis 10', 'Basis 16'], answerIndex: 0, explanation: 'Biner adalah sistem bilangan berbasis 2, hanya terdiri dari digit 0 dan 1.', category: 'Sistem Bilangan', difficulty: 'Mudah' },
  { question: 'Hasil konversi bilangan desimal 13 ke biner adalah...', options: ['1100', '1101', '1011', '1110'], answerIndex: 1, explanation: '13 = 8 + 4 + 1 = 1101 dalam biner.', category: 'Sistem Bilangan', difficulty: 'Sedang' },
  { question: 'Bilangan heksadesimal menggunakan digit apa saja?', options: ['0–7', '0–9', '0–9 dan A–F', '0 dan 1 saja'], answerIndex: 2, explanation: 'Heksadesimal berbasis 16, menggunakan 0–9 lalu dilanjutkan A–F.', category: 'Sistem Bilangan', difficulty: 'Mudah' },
  { question: 'Gerbang logika apa yang keluarannya 1 hanya jika SEMUA masukan bernilai 1?', options: ['OR', 'AND', 'NOT', 'XOR'], answerIndex: 1, explanation: 'Gerbang AND membutuhkan seluruh input bernilai 1 agar outputnya 1.', category: 'Gerbang Logika', difficulty: 'Mudah' },
  { question: 'Gerbang OR akan menghasilkan output 0 jika...', options: ['Salah satu input 1', 'Semua input 1', 'Semua input 0', 'Input berbeda'], answerIndex: 2, explanation: 'OR hanya menghasilkan 0 ketika seluruh inputnya juga 0.', category: 'Gerbang Logika', difficulty: 'Mudah' },
  { question: 'Berapa jumlah input pada gerbang NOT?', options: ['1', '2', '3', 'Tidak terbatas'], answerIndex: 0, explanation: 'NOT adalah gerbang inverter dengan satu input tunggal.', category: 'Gerbang Logika', difficulty: 'Mudah' },
  { question: 'NAND adalah kebalikan dari gerbang...', options: ['OR', 'AND', 'XOR', 'NOT'], answerIndex: 1, explanation: 'NAND = NOT AND, membalik hasil dari gerbang AND.', category: 'Gerbang Logika', difficulty: 'Sedang' },
  { question: 'NOR adalah kebalikan dari gerbang...', options: ['AND', 'NAND', 'OR', 'XNOR'], answerIndex: 2, explanation: 'NOR = NOT OR, membalik hasil dari gerbang OR.', category: 'Gerbang Logika', difficulty: 'Sedang' },
  { question: 'Gerbang XOR menghasilkan output 1 ketika...', options: ['Kedua input sama', 'Kedua input berbeda', 'Semua input 0', 'Semua input 1'], answerIndex: 1, explanation: 'XOR aktif (1) hanya saat kedua inputnya berbeda nilai.', category: 'Gerbang Logika', difficulty: 'Sedang' },
  { question: 'Gerbang XNOR menghasilkan output 1 ketika...', options: ['Kedua input berbeda', 'Salah satu input 1', 'Kedua input sama', 'Semua input 0'], answerIndex: 2, explanation: 'XNOR adalah kebalikan XOR: aktif ketika kedua input bernilai sama.', category: 'Gerbang Logika', difficulty: 'Sedang' },
  { question: 'Tabel kebenaran digunakan untuk...', options: ['Menghitung arus listrik', 'Menampilkan semua kombinasi input & output', 'Mengukur tegangan', 'Menyimpan data biner'], answerIndex: 1, explanation: 'Tabel kebenaran menampilkan seluruh kombinasi input beserta hasil outputnya.', category: 'Tabel Kebenaran', difficulty: 'Mudah' },
  { question: 'Untuk 3 variabel input, berapa jumlah baris pada tabel kebenaran?', options: ['3', '6', '8', '9'], answerIndex: 2, explanation: 'Jumlah baris = 2 pangkat jumlah variabel = 2³ = 8.', category: 'Tabel Kebenaran', difficulty: 'Sedang' },
  { question: 'Dalam aljabar Boolean, simbol "·" biasanya mewakili operasi...', options: ['OR', 'AND', 'NOT', 'XOR'], answerIndex: 1, explanation: 'Titik "·" adalah lambang umum untuk operasi AND dalam aljabar Boolean.', category: 'Aljabar Boolean', difficulty: 'Sedang' },
  { question: 'Dalam aljabar Boolean, simbol "+" biasanya mewakili operasi...', options: ['AND', 'NOT', 'OR', 'NAND'], answerIndex: 2, explanation: 'Tanda "+" adalah lambang umum untuk operasi OR dalam aljabar Boolean.', category: 'Aljabar Boolean', difficulty: 'Sedang' },
  { question: 'Menurut hukum null aljabar Boolean, hasil dari A + 1 adalah...', options: ['A', '0', '1', 'Ā'], answerIndex: 2, explanation: 'Hukum null: A + 1 selalu bernilai 1, apa pun nilai A.', category: 'Aljabar Boolean', difficulty: 'Sulit' },
  { question: 'Menurut hukum komplemen, hasil dari A · Ā adalah...', options: ['1', 'A', '0', 'Ā'], answerIndex: 2, explanation: 'Suatu variabel dan komplemennya jika di-AND-kan selalu menghasilkan 0.', category: 'Aljabar Boolean', difficulty: 'Sulit' },
  { question: 'Half Adder menghasilkan dua output, yaitu...', options: ['Input dan Output', 'Sum dan Carry', 'AND dan OR', 'Clock dan Reset'], answerIndex: 1, explanation: 'Half Adder menghasilkan Sum (dari XOR) dan Carry (dari AND).', category: 'Rangkaian Kombinasional', difficulty: 'Sedang' }
];

const btnModeLatihan = document.getElementById('btnModeLatihan');
const btnModeUjian = document.getElementById('btnModeUjian');
const quizStage = document.getElementById('quizStage');
const quizHistoryList = document.getElementById('quizHistoryList');

// Mengacak urutan array tanpa mengubah array asli (Fisher-Yates sederhana)
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* ---------- MODE LATIHAN: satu soal per waktu, feedback + penjelasan langsung ---------- */
let practiceQuestions = [];
let practiceIndex = 0;

function startPractice() {
  practiceQuestions = shuffleArray(QUIZ_BANK);
  practiceIndex = 0;
  renderPracticeQuestion();
}

function renderPracticeQuestion() {
  const q = practiceQuestions[practiceIndex];
  quizStage.innerHTML = '';

  const progressLabel = document.createElement('p');
  progressLabel.className = 'quiz-progress-label';
  progressLabel.textContent = `Soal ${practiceIndex + 1} dari ${practiceQuestions.length} — Mode Latihan`;

  const card = document.createElement('div');
  card.className = 'quiz-question';

  const metaRow = document.createElement('div');
  metaRow.className = 'quiz-meta-row';
  metaRow.innerHTML = `<span class="quiz-tag">${q.category}</span><span class="quiz-tag">${q.difficulty}</span>`;

  const questionText = document.createElement('p');
  questionText.className = 'question-text';
  questionText.textContent = q.question;

  const optionsWrap = document.createElement('div');
  optionsWrap.className = 'quiz-options';

  q.options.forEach((optionText, oIndex) => {
    const label = document.createElement('label');
    label.className = 'quiz-option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'practice-q';
    radio.value = oIndex;
    radio.addEventListener('change', () => handlePracticeAnswer(oIndex, optionsWrap, explanationBox));
    label.appendChild(radio);
    label.appendChild(document.createTextNode(optionText));
    optionsWrap.appendChild(label);
  });

  const explanationBox = document.createElement('div');
  explanationBox.className = 'explanation-box hidden';

  const navRow = document.createElement('div');
  navRow.className = 'quiz-nav-row';
  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn-primary hidden';
  nextBtn.id = 'btnPracticeNext';
  nextBtn.textContent = (practiceIndex === practiceQuestions.length - 1) ? 'Selesai' : 'Soal Berikutnya →';
  nextBtn.addEventListener('click', () => {
    if (practiceIndex < practiceQuestions.length - 1) {
      practiceIndex++;
      renderPracticeQuestion();
    } else {
      renderPracticeComplete();
    }
  });
  navRow.appendChild(nextBtn);

  card.appendChild(metaRow);
  card.appendChild(questionText);
  card.appendChild(optionsWrap);
  card.appendChild(explanationBox);

  quizStage.appendChild(progressLabel);
  quizStage.appendChild(card);
  quizStage.appendChild(navRow);
}

function handlePracticeAnswer(selectedIndex, optionsWrap, explanationBox) {
  const q = practiceQuestions[practiceIndex];
  const optionLabels = optionsWrap.querySelectorAll('.quiz-option');

  optionLabels.forEach((label, i) => {
    label.classList.add('disabled');
    label.querySelector('input').disabled = true;
    if (i === q.answerIndex) label.classList.add('correct');
  });

  if (selectedIndex === q.answerIndex) {
    addXP(10); // +10 XP untuk tiap jawaban benar
  } else {
    const wrongLabel = optionLabels[selectedIndex];
    wrongLabel.classList.add('incorrect', 'shake');
    wrongLabel.addEventListener('animationend', () => wrongLabel.classList.remove('shake'), { once: true });
  }

  explanationBox.textContent = `💡 ${q.explanation}`;
  explanationBox.classList.remove('hidden');

  document.getElementById('btnPracticeNext').classList.remove('hidden');
  renderDashboard();
}

function renderPracticeComplete() {
  quizStage.innerHTML = `
    <div class="exam-result">
      <h3>Mode Latihan Selesai</h3>
      <p class="score-big">🎉</p>
      <p style="color:var(--text-muted); margin-bottom:20px;">Kamu sudah menyelesaikan semua soal latihan. Yuk coba Mode Ujian untuk menguji dirimu sendiri!</p>
      <div class="exam-result-actions">
        <button class="btn-primary" id="btnPracticeAgain">Ulangi Latihan</button>
        <button class="btn-secondary" id="btnGoToExam">Coba Mode Ujian →</button>
      </div>
    </div>
  `;
  document.getElementById('btnPracticeAgain').addEventListener('click', startPractice);
  document.getElementById('btnGoToExam').addEventListener('click', startExam);
}

/* ---------- MODE UJIAN: 10 soal acak, opsi diacak, hasil di akhir ---------- */
let examQuestions = [];
let examUserAnswers = [];

function startExam() {
  const picked = shuffleArray(QUIZ_BANK).slice(0, 10);

  // Acak urutan opsi jawaban tiap soal, sambil menyesuaikan ulang answerIndex-nya
  examQuestions = picked.map(q => {
    const optionOrder = shuffleArray(q.options.map((text, idx) => ({ text, idx })));
    const newOptions = optionOrder.map(o => o.text);
    const newAnswerIndex = optionOrder.findIndex(o => o.idx === q.answerIndex);
    return { ...q, options: newOptions, answerIndex: newAnswerIndex };
  });

  examUserAnswers = new Array(examQuestions.length).fill(null);
  renderExam();
}

function renderExam() {
  quizStage.innerHTML = '';

  const progressLabel = document.createElement('p');
  progressLabel.className = 'quiz-progress-label';
  progressLabel.textContent = `Mode Ujian — 10 Soal Acak (jawaban baru diberi tahu di akhir)`;
  quizStage.appendChild(progressLabel);

  examQuestions.forEach((q, qIndex) => {
    const card = document.createElement('div');
    card.className = 'quiz-question';

    const metaRow = document.createElement('div');
    metaRow.className = 'quiz-meta-row';
    metaRow.innerHTML = `<span class="quiz-tag">${q.category}</span><span class="quiz-tag">${q.difficulty}</span>`;

    const questionText = document.createElement('p');
    questionText.className = 'question-text';
    questionText.textContent = `${qIndex + 1}. ${q.question}`;

    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'quiz-options';

    q.options.forEach((optionText, oIndex) => {
      const label = document.createElement('label');
      label.className = 'quiz-option';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `exam-q-${qIndex}`;
      radio.value = oIndex;
      radio.addEventListener('change', () => { examUserAnswers[qIndex] = oIndex; });
      label.appendChild(radio);
      label.appendChild(document.createTextNode(optionText));
      optionsWrap.appendChild(label);
    });

    card.appendChild(metaRow);
    card.appendChild(questionText);
    card.appendChild(optionsWrap);
    quizStage.appendChild(card);
  });

  const navRow = document.createElement('div');
  navRow.className = 'quiz-nav-row';
  const finishBtn = document.createElement('button');
  finishBtn.className = 'btn-primary';
  finishBtn.textContent = 'Selesai Ujian';
  finishBtn.addEventListener('click', finishExam);
  navRow.appendChild(finishBtn);
  quizStage.appendChild(navRow);
}

function finishExam() {
  const unanswered = examUserAnswers.filter(a => a === null).length;
  if (unanswered > 0) {
    const confirmSubmit = confirm(`Masih ada ${unanswered} soal belum dijawab. Tetap kumpulkan jawaban?`);
    if (!confirmSubmit) return;
  }

  const total = examQuestions.length;
  const correctCount = examUserAnswers.filter((ans, i) => ans === examQuestions[i].answerIndex).length;
  const wrongCount = total - correctCount;
  const percent = Math.round((correctCount / total) * 100);

  addXP(correctCount * 10); // XP dari jawaban benar
  addXP(30);                // XP bonus menyelesaikan ujian

  saveQuizHistory('Kuis Gerbang Logika & Sistem Digital', percent);
  renderDashboard();
  renderAchievements();
  renderQuizHistory();

  quizStage.innerHTML = `
    <div class="exam-result">
      <h3>Hasil Ujian</h3>
      <p class="score-big">${percent}%</p>
      <div class="exam-result-stats">
        <div><span class="stat-value">${correctCount}</span><span class="stat-label">Jawaban Benar</span></div>
        <div><span class="stat-value">${wrongCount}</span><span class="stat-label">Jawaban Salah</span></div>
        <div><span class="stat-value">${correctCount * 10}/${total * 10}</span><span class="stat-label">Skor</span></div>
      </div>
      <div class="exam-result-actions">
        <button class="btn-primary" id="btnExamRetry">Coba Lagi</button>
        <button class="btn-secondary" id="btnExamBackToMateri">Kembali ke Materi</button>
      </div>
    </div>
  `;
  document.getElementById('btnExamRetry').addEventListener('click', startExam);
  document.getElementById('btnExamBackToMateri').addEventListener('click', () => {
    document.getElementById('materi').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function saveQuizHistory(title, percent) {
  const history = loadJSON(STORAGE_KEYS.HISTORY, []);
  const dateLabel = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  history.unshift({ title, percent, date: dateLabel });
  saveJSON(STORAGE_KEYS.HISTORY, history.slice(0, 10)); // simpan 10 riwayat terakhir saja
}

function renderQuizHistory() {
  const history = loadJSON(STORAGE_KEYS.HISTORY, []);
  quizHistoryList.innerHTML = '';

  if (history.length === 0) {
    quizHistoryList.innerHTML = '<li class="history-empty">Belum ada percobaan. Yuk coba satu kuis dulu — gak akan lama kok.</li>';
    return;
  }

  history.forEach(h => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.innerHTML = `
      <span class="history-title">${h.title}</span>
      <span class="history-score">${h.percent}%</span>
      <span class="history-date">${h.date}</span>
    `;
    quizHistoryList.appendChild(li);
  });
}

btnModeLatihan.addEventListener('click', startPractice);
btnModeUjian.addEventListener('click', startExam);


/* ============================================================================
   6. SIMULATOR GERBANG LOGIKA
   Dipertahankan dari MEKA 1.2 — hanya dipindah ke section #simulator, logika
   dan struktur data (gateLogic) sama persis seperti sebelumnya.
   ============================================================================ */
const gateLogic = {
  AND:  { inputs: 2, calculate: (a, b) => (a && b) ? 1 : 0 },
  OR:   { inputs: 2, calculate: (a, b) => (a || b) ? 1 : 0 },
  NOT:  { inputs: 1, calculate: (a)    => (a === 0) ? 1 : 0 },
  NAND: { inputs: 2, calculate: (a, b) => (a && b) ? 0 : 1 },
  NOR:  { inputs: 2, calculate: (a, b) => (a || b) ? 0 : 1 },
  XOR:  { inputs: 2, calculate: (a, b) => (a !== b) ? 1 : 0 },
  XNOR: { inputs: 2, calculate: (a, b) => (a === b) ? 1 : 0 }
};

const gateGrid = document.getElementById('gateGrid');
const simulationPanel = document.getElementById('simulationPanel');
const simTitle = document.getElementById('simTitle');
const simSwitches = document.getElementById('simSwitches');
const simLamp = document.getElementById('simLamp');
const simStatus = document.getElementById('simStatus');
const btnKembaliSimulasi = document.getElementById('btnKembaliSimulasi');

let simState = { a: 0, b: 0 };
let currentGateName = null;

function openSimulation(gateName) {
  const gate = gateLogic[gateName];
  if (!gate) return;

  currentGateName = gateName;
  simState = { a: 0, b: 0 };

  simTitle.textContent = `Simulasi Gerbang ${gateName}`;

  simSwitches.innerHTML = '';
  simSwitches.appendChild(buildSwitchGroup('A'));
  if (gate.inputs === 2) {
    simSwitches.appendChild(buildSwitchGroup('B'));
  }

  updateSimulationOutput();

  gateGrid.classList.add('hidden');
  simulationPanel.classList.remove('hidden');
  simulationPanel.classList.remove('fade-in');
  void simulationPanel.offsetWidth;
  simulationPanel.classList.add('fade-in');
}

function closeSimulation() {
  simulationPanel.classList.add('hidden');
  gateGrid.classList.remove('hidden');
  currentGateName = null;
}

function buildSwitchGroup(inputName) {
  const key = inputName.toLowerCase();

  const group = document.createElement('div');
  group.className = 'switch-group';

  const label = document.createElement('span');
  label.className = 'switch-label';
  label.textContent = `Input ${inputName}`;

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'toggle-switch';
  toggleBtn.setAttribute('aria-pressed', 'false');
  toggleBtn.setAttribute('aria-label', `Saklar Input ${inputName}`);

  const knob = document.createElement('span');
  knob.className = 'toggle-knob';
  toggleBtn.appendChild(knob);

  const valueText = document.createElement('span');
  valueText.className = 'switch-value';
  valueText.textContent = '0';

  toggleBtn.addEventListener('click', () => {
    simState[key] = simState[key] === 0 ? 1 : 0;
    toggleBtn.classList.toggle('on', simState[key] === 1);
    toggleBtn.setAttribute('aria-pressed', String(simState[key] === 1));
    valueText.textContent = String(simState[key]);
    updateSimulationOutput();
  });

  group.appendChild(label);
  group.appendChild(toggleBtn);
  group.appendChild(valueText);
  return group;
}

function updateSimulationOutput() {
  const gate = gateLogic[currentGateName];
  if (!gate) return;

  const output = gate.inputs === 1
    ? gate.calculate(simState.a)
    : gate.calculate(simState.a, simState.b);

  simLamp.classList.toggle('lamp-on', output === 1);

  simStatus.textContent = gate.inputs === 1
    ? `A: ${simState.a} => Output: ${output}`
    : `A: ${simState.a}, B: ${simState.b} => Output: ${output}`;
}

document.querySelectorAll('.gate-card[data-gate]').forEach(card => {
  card.addEventListener('click', () => openSimulation(card.dataset.gate));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openSimulation(card.dataset.gate);
    }
  });
});

btnKembaliSimulasi.addEventListener('click', closeSimulation);


/* ============================================================================
   7. NAVIGASI SIDEBAR, HAMBURGER, DASHBOARD BERANDA
   ============================================================================ */
const navLinks = document.querySelectorAll('.nav-link');
const navSublinks = document.querySelectorAll('.nav-sublink');
const sections = document.querySelectorAll('.main-content > section');

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const targetEl = document.getElementById(link.dataset.target);
    if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    closeSidebar();
  });
});

navSublinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    expandCategoryOnly(link.dataset.category);
    document.getElementById('materi').scrollIntoView({ behavior: 'smooth', block: 'start' });
    closeSidebar();
  });
});

const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.getAttribute('id');
      navLinks.forEach(link => link.classList.toggle('active', link.dataset.target === id));
    }
  });
}, { rootMargin: '-40% 0px -50% 0px' });

sections.forEach(section => sectionObserver.observe(section));

const hamburgerBtn = document.getElementById('hamburgerBtn');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

function openSidebarMenu() {
  sidebar.classList.add('is-open');
  sidebarOverlay.classList.add('is-visible');
  hamburgerBtn.classList.add('is-open');
  hamburgerBtn.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  sidebar.classList.remove('is-open');
  sidebarOverlay.classList.remove('is-visible');
  hamburgerBtn.classList.remove('is-open');
  hamburgerBtn.setAttribute('aria-expanded', 'false');
}

hamburgerBtn.addEventListener('click', () => {
  sidebar.classList.contains('is-open') ? closeSidebar() : openSidebarMenu();
});
sidebarOverlay.addEventListener('click', closeSidebar);

/* ---------- Dashboard: Beranda + Progress, dipanggil ulang tiap ada perubahan ---------- */
// Helper MURNI VISUAL: menambahkan micro-animation singkat pada elemen angka
// ketika nilainya benar-benar berubah. Tidak menghitung/mengubah data apa pun.
let dashboardRenderedOnce = false;
function setTextWithPulse(elId, newText) {
  const el = document.getElementById(elId);
  if (!el) return;
  const changed = el.textContent !== newText;
  el.textContent = newText;
  if (dashboardRenderedOnce && changed) {
    el.classList.remove('value-updated');
    void el.offsetWidth; // restart animasi
    el.classList.add('value-updated');
  }
}

function renderDashboard() {
  const allLessons = getAllLessonsFlat();
  const progress = getProgress();
  const doneCount = progress.completed.length;
  const totalCount = allLessons.length;
  const percent = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  // --- Beranda ---
  setTextWithPulse('dashProgressValue', `${percent}%`);
  document.getElementById('dashMateriValue').textContent = `${doneCount} / ${totalCount} selesai`;

  const history = loadJSON(STORAGE_KEYS.HISTORY, []);
  document.getElementById('dashQuizValue').textContent =
    history.length > 0 ? `Skor terakhir: ${history[0].percent}%` : 'Belum ada';

  // --- Progress ---
  setTextWithPulse('progressLessonCount', `${doneCount} / ${totalCount}`);
  document.getElementById('progressBarFill').style.width = `${percent}%`;
  document.getElementById('progressPercentText').textContent = `${percent}%`;

  // Progress ring (MEKA 1.5): dekorasi visual tambahan di samping bar, memakai
  // nilai 'percent' yang SAMA PERSIS dengan bar di atas — tidak ada kalkulasi baru.
  const ringFill = document.getElementById('progressRingFill');
  const ringLabel = document.getElementById('progressRingLabel');
  if (ringFill && ringLabel) {
    const circumference = 263.9; // 2 * PI * r(42), harus sama dengan nilai stroke-dasharray di CSS
    ringFill.style.strokeDashoffset = String(circumference - (percent / 100) * circumference);
    ringLabel.textContent = `${percent}%`;
  }

  const levelInfo = getLevelInfo(getXP());
  setTextWithPulse('progressLevelValue', `Level ${levelInfo.level}`);
  document.getElementById('progressLevelTitle').textContent = levelInfo.title;
  document.getElementById('xpBarFill').style.width = `${(levelInfo.xpIntoLevel / levelInfo.xpForNext) * 100}%`;
  document.getElementById('xpText').textContent = `${levelInfo.xpIntoLevel} / ${levelInfo.xpForNext} XP`;

  dashboardRenderedOnce = true;
}

// Tombol "Lanjutkan Belajar": buka submateri pertama yang BELUM ditandai selesai
document.getElementById('btnLanjutBelajar').addEventListener('click', () => {
  const allLessons = getAllLessonsFlat();
  const progress = getProgress();
  const next = allLessons.find(l => !progress.completed.includes(l.id));

  document.getElementById('materi').scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (next) {
    expandCategoryOnly(next.categoryId);
    // Beri jeda singkat agar scroll ke section selesai dulu sebelum membuka lesson-view
    setTimeout(() => openLesson(next.categoryId, next.id), 350);
  }
});


/* ============================================================================
   8. INISIALISASI
   ============================================================================ */
initStorage();
renderMateriCategories();
renderDashboard();
renderAchievements();
renderQuizHistory();

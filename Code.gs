/*
  GOOGLE APPS SCRIPT — LAYANAN & PENGADUAN SIRUMAH v45

  Cara memakai:
  1. Pertahankan SPREADSHEET_ID yang sudah digunakan pada script Anda.
  2. Pastikan nama sheet: LAYANAN_PENGADUAN.
  3. Ganti seluruh isi Code.gs dengan kode ini.
  4. Simpan, lalu Deploy > Manage deployments > Edit > New version > Deploy.

  ADMIN_PIN_HASH di bawah sesuai dengan PIN Mode Internal HTML v45: 2026.
  Apabila PIN HTML diganti, hash pada Apps Script juga wajib diganti.
*/

const SPREADSHEET_ID = "GANTI_DENGAN_ID_GOOGLE_SHEETS_ANDA";
const SHEET_NAME = "LAYANAN_PENGADUAN";
const ADMIN_PIN_HASH = "158a323a7ba44870f23d96f1516dd70aa48e9a72db4ebb026b0a89e212a208ab";
const MAX_INTERNAL_ROWS = 1000;

function doPost(e) {
  try {
    const data = parseRequestBody_(e);
    const action = String(data.action || "submit").trim().toLowerCase();

    if (action === "list") {
      return handleInternalList_(data);
    }

    if (action !== "submit") {
      return jsonResponse({
        success: false,
        message: "Aksi POST tidak tersedia."
      });
    }

    return handleSubmit_(data);
  } catch (error) {
    return jsonResponse({
      success: false,
      message: error && error.message ? error.message : String(error)
    });
  }
}

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || "summary")
      .trim()
      .toLowerCase();

    if (action === "summary") {
      return handleSummary_();
    }

    if (action === "health") {
      return jsonResponse({
        success: true,
        service: "SIRUMAH Layanan & Pengaduan",
        status: "ok"
      });
    }

    // Daftar rinci sengaja tidak disediakan melalui GET agar PIN tidak masuk URL.
    return jsonResponse({
      success: false,
      message: "Aksi GET tidak tersedia."
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      message: error && error.message ? error.message : String(error)
    });
  }
}

function handleSubmit_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const nama = cleanValue(data.nama);
    const hp = cleanValue(data.hp);
    const jenis = cleanValue(data.jenis);
    const kecamatan = cleanValue(data.kecamatan);
    const uraian = cleanValue(data.uraian);

    if (!nama || !hp || !jenis || !kecamatan || !uraian) {
      return jsonResponse({
        success: false,
        message: "Nama, nomor HP, jenis layanan, kecamatan, dan uraian wajib diisi."
      });
    }

    const sheet = getLayananSheet_();
    const now = new Date();
    const id = createTicketId_(now);

    sheet.appendRow([
      id,                // A ID_LAYANAN
      now,               // B TANGGAL_MASUK
      nama,              // C NAMA_PEMOHON
      hp,                // D NO_HP
      jenis,             // E JENIS_LAYANAN
      kecamatan,         // F KECAMATAN
      uraian,            // G URAIAN
      "Diterima",       // H STATUS
      "",                // I CATATAN_TINDAK_LANJUT
      now,               // J TANGGAL_UPDATE
      "SIRUMAH Publik"  // K OPERATOR
    ]);

    return jsonResponse({
      success: true,
      id: id,
      message: "Layanan berhasil disimpan."
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}

function handleSummary_() {
  const rows = getLayananRows_();
  const summary = {
    total: rows.length,
    diterima: 0,
    diverifikasi: 0,
    ditindaklanjuti: 0,
    selesai: 0
  };

  rows.forEach(function(row) {
    const status = String(row[7] || "").trim().toLowerCase();

    if (status === "diterima") summary.diterima += 1;
    else if (status === "diverifikasi") summary.diverifikasi += 1;
    else if (status === "ditindaklanjuti") summary.ditindaklanjuti += 1;
    else if (status === "selesai") summary.selesai += 1;
  });

  return jsonResponse({
    success: true,
    summary: summary
  });
}

function handleInternalList_(data) {
  const pin = String(data.pin || "").trim();

  if (!pin || sha256Hex_(pin) !== ADMIN_PIN_HASH) {
    return jsonResponse({
      success: false,
      message: "PIN Mode Internal tidak sesuai."
    });
  }

  const rows = getLayananRows_()
    .slice()
    .reverse()
    .slice(0, MAX_INTERNAL_ROWS)
    .map(function(row) {
      return {
        id: cleanOutput_(row[0]),
        tanggal: formatDateTime_(row[1]),
        nama: cleanOutput_(row[2]),
        hp: cleanOutput_(row[3]),
        jenis: cleanOutput_(row[4]),
        kecamatan: cleanOutput_(row[5]),
        uraian: cleanOutput_(row[6]),
        status: cleanOutput_(row[7]) || "Diterima",
        catatan: cleanOutput_(row[8]),
        tanggalUpdate: formatDateTime_(row[9]),
        operator: cleanOutput_(row[10])
      };
    });

  return jsonResponse({
    success: true,
    rows: rows,
    total: rows.length
  });
}

function getLayananSheet_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID.indexOf("GANTI_DENGAN") === 0) {
    throw new Error("SPREADSHEET_ID belum diisi pada Code.gs.");
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error("Sheet " + SHEET_NAME + " tidak ditemukan.");
  }

  return sheet;
}

function getLayananRows_() {
  const sheet = getLayananSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, 11)
    .getValues()
    .filter(function(row) {
      return String(row[0] || "").trim() !== "";
    });
}

function parseRequestBody_(e) {
  const raw = e && e.postData ? e.postData.contents : "";
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (_) {
    throw new Error("Format data permintaan tidak valid.");
  }
}

function createTicketId_(dateValue) {
  return "LYN-" +
    Utilities.formatDate(
      dateValue,
      Session.getScriptTimeZone(),
      "yyyyMMdd-HHmmss"
    ) +
    "-" +
    Utilities.getUuid().slice(0, 6).toUpperCase();
}

function formatDateTime_(value) {
  if (!value) return "";

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "dd/MM/yyyy HH:mm:ss"
    );
  }

  return cleanOutput_(value);
}

function cleanValue(value) {
  let text = String(value == null ? "" : value).trim();

  // Mencegah input pengguna dibaca sebagai formula oleh Google Sheets.
  if (/^[=+\-@]/.test(text)) {
    text = "'" + text;
  }

  return text;
}

function cleanOutput_(value) {
  return String(value == null ? "" : value).trim();
}

function sha256Hex_(value) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  );

  return digest
    .map(function(byte) {
      const unsigned = byte < 0 ? byte + 256 : byte;
      return ("0" + unsigned.toString(16)).slice(-2);
    })
    .join("");
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/*
  Otomatis memperbarui TANGGAL_UPDATE ketika STATUS pada kolom H diubah manual.
  Jangan menjalankan fungsi ini melalui tombol Run; uji dengan mengubah sel di Sheet.
*/
function onEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  const column = e.range.getColumn();

  if (sheet.getName() !== SHEET_NAME || row < 2 || column !== 8) return;

  const allowedStatuses = [
    "Diterima",
    "Diverifikasi",
    "Ditindaklanjuti",
    "Selesai"
  ];

  const status = String(e.range.getValue() || "").trim();
  if (allowedStatuses.indexOf(status) === -1) return;

  sheet.getRange(row, 10).setValue(new Date());

  const operatorCell = sheet.getRange(row, 11);
  if (!operatorCell.getValue()) {
    operatorCell.setValue("Petugas Perkim");
  }
}

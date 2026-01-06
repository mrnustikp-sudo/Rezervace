const fs = require('fs');
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const DATA_FILE = path.join(__dirname, 'reservations.json');

// --- CONFIG ---
// To use Google Sheets, set env vars:
// GOOGLE_SHEET_ID
// GOOGLE_SERVICE_ACCOUNT_EMAIL
// GOOGLE_PRIVATE_KEY
const USE_SHEETS = !!process.env.GOOGLE_SHEET_ID;

let doc = null;

async function initSheets() {
    if (!USE_SHEETS) return;
    try {
        doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        });
        await doc.loadInfo();
        console.log('Connected to Google Sheet:', doc.title);
    } catch (e) {
        console.error('Google Sheets connection failed:', e.message);
        console.log('Falling back to local file mode.');
    }
}

// Ensure init is called
initSheets();

// --- PUBLIC API ---

async function getData() {
    if (doc) {
        return await readFromSheets();
    }
    return readFromFile();
}

async function saveData(data) {
    if (doc) {
        return await writeToSheets(data);
    }
    return writeToFile(data);
}

// --- FILE IMPLEMENTATION ---

function readFromFile() {
    if (!fs.existsSync(DATA_FILE)) {
        return { settings: { teachers: [], adminPassword: 'admin' }, reservations: {} };
    }
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return { settings: { teachers: [], adminPassword: 'admin' }, reservations: {} };
    }
}

function writeToFile(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- SHEET IMPLEMENTATION (Placeholder logic) ---
// This is complex because we need to map hierarchical JSON to flat tables.
// We will use 2 sheets:
// "Settings" (Key, Value) or just store JSON in a cell? 
// Storing JSON in a cell is hacky but "robust" for simple JSON storage. 
// A database row approach is better but harder to map.
//
// STRATEGY: 
// Sheet 1: "DataStore". Column A: "JSON_BLOB". Row 1 contains the entire JSON.
// This effectively uses Sheets as a remote file system. Simple and works "at all costs".

async function readFromSheets() {
    try {
        const sheet = doc.sheetsByIndex[0];
        await sheet.loadCells('A1:A1');
        const cell = sheet.getCell(0, 0); // A1
        const val = cell.value;

        if (!val) {
            return { settings: { teachers: [], adminPassword: 'admin' }, reservations: {} };
        }

        return JSON.parse(val);
    } catch (e) {
        console.error('Read from Sheet failed:', e);
        // Return default so app stays alive even if sheet is broken/unshared
        return { settings: { teachers: [], adminPassword: 'admin' }, reservations: {} };
    }
}

async function writeToSheets(data) {
    const sheet = doc.sheetsByIndex[0];
    await sheet.loadCells('A1:A1');
    const cell = sheet.getCell(0, 0);
    cell.value = JSON.stringify(data);
    await sheet.saveUpdatedCells();
}

module.exports = {
    getData,
    saveData
};

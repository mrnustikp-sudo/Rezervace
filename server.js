const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Get public config (teachers, intervals)
app.get('/api/config', async (req, res) => {
    const data = await db.getData();
    // Check storage mode
    const storageMode = process.env.GOOGLE_SHEET_ID ? 'Google Sheets' : 'Local File';

    const publicSettings = {
        teachers: data.settings.teachers.map(t => ({
            id: t.id,
            name: t.name,
            interval: t.interval
        })),
        storageMode: storageMode
    };
    res.json(publicSettings);
});

// Get all reservations (Safe view)
app.get('/api/reservations', async (req, res) => {
    const data = await db.getData();
    const safeReservations = {};
    const reservations = data.reservations || {};

    // Sanitize data
    Object.keys(reservations).forEach(teacherName => {
        safeReservations[teacherName] = {};
        Object.keys(reservations[teacherName]).forEach(time => {
            const entry = reservations[teacherName][time];
            if (entry) {
                safeReservations[teacherName][time] = {
                    name: entry.name,
                    id: entry.id
                };
            }
        });
    });

    res.json(safeReservations);
});

// Update/Create reservation
app.post('/api/reserve', async (req, res) => {
    // 'teacher' param is NAME for compatibility
    const { teacher, time, studentName, secretToken } = req.body;

    if (!teacher || !time) {
        return res.status(400).json({ error: 'Missing teacher or time' });
    }

    const data = await db.getData();
    data.reservations = data.reservations || {};

    if (!data.reservations[teacher]) {
        data.reservations[teacher] = {};
    }

    const currentReservation = data.reservations[teacher][time];

    // CANCELLATION or UPDATE
    if (studentName === '') {
        if (currentReservation) {
            if (currentReservation.token !== secretToken) {
                return res.status(403).json({ error: 'Unauthorized: Invalid token' });
            }
            delete data.reservations[teacher][time];
        }
    } else {
        if (currentReservation) {
            if (currentReservation.token !== secretToken) {
                return res.status(403).json({ error: 'Unauthorized: Slot is taken' });
            }
            currentReservation.name = studentName;
        } else {
            const newToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
            const newId = Math.random().toString(36).substring(7);

            data.reservations[teacher][time] = {
                name: studentName,
                id: newId,
                token: newToken
            };

            await db.saveData(data);

            return res.json({
                success: true,
                reservation: {
                    id: newId,
                    token: newToken
                }
            });
        }
    }

    await db.saveData(data);
    res.json({ success: true });
});

// --- ADMIN API ---

app.post('/api/admin/login', async (req, res) => {
    const { password } = req.body;
    try {
        const data = await db.getData();
        // Fallback if data is corrupted but db.getData didn't catch it
        const savedPassword = (data.settings && data.settings.adminPassword) ? data.settings.adminPassword : 'admin';

        if (password === savedPassword) {
            res.json({ success: true, token: 'admin-session-ok' });
        } else {
            console.log(`Login failed. Expected: ${savedPassword}, Got: ${password}`);
            res.status(401).json({ error: 'Invalid password' });
        }
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ error: 'Server error during login' });
    }
});

app.post('/api/admin/settings', async (req, res) => {
    const { token, teachers } = req.body;
    if (token !== 'admin-session-ok') return res.status(401).json({ error: 'Unauthorized' });

    const data = await db.getData();
    data.settings.teachers = teachers;

    // Ensure reservation buckets exist for new teachers
    teachers.forEach(t => {
        if (!data.reservations[t.name]) {
            data.reservations[t.name] = {};
        }
    });

    await db.saveData(data);
    res.json({ success: true });
});

app.post('/api/admin/delete-reservation', async (req, res) => {
    const { token, teacher, time } = req.body;
    if (token !== 'admin-session-ok') return res.status(401).json({ error: 'Unauthorized' });

    const data = await db.getData();

    // Ensure structure
    if (!data.reservations) data.reservations = {};
    if (!data.reservations[teacher]) data.reservations[teacher] = {};

    if (data.reservations[teacher][time]) {
        delete data.reservations[teacher][time];
        await db.saveData(data);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Rezervace nenalezena (již smazána?)' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

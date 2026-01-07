let teachers = []; // Now fetched from server
const startHour = 16;
const endHour = 17; // ends at 17:50 (approx)

let currentTeacherName = ''; // Changed from currentTeacher to clarify it's a name or ID
let currentTeacherObj = null;
let reservations = {};
let localTokens = {};

document.addEventListener('DOMContentLoaded', () => {
    init();
    setupMenu();
});

function setupMenu() {
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');

    if (menuToggle && sidebar && overlay) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
}

async function init() {
    loadTokens();
    await fetchConfig();

    // Open sidebar by default on load
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (sidebar && overlay) {
        sidebar.classList.add('active');
        overlay.classList.add('active');
    }

    setupTeacherList();
    // Do NOT automatically switch to first teacher anymore
    // await fetchReservations(); // Only fetch when teacher is selected

    // Add placeholder message
    currentTeacherNameHeader.textContent = 'Výběr učitele';
    const container = document.getElementById('slots-container');
    container.innerHTML = '<p style="text-align:center; padding: 20px;">Prosím vyberte učitele ze seznamu vlevo.</p>';
}

async function fetchConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        teachers = data.teachers;
    } catch (e) {
        console.error('Failed to load config', e);
    }
}

function loadTokens() {
    const stored = localStorage.getItem('reservation_tokens');
    if (stored) {
        localTokens = JSON.parse(stored);
    }
}

function saveTokens() {
    localStorage.setItem('reservation_tokens', JSON.stringify(localTokens));
}

function setupTeacherList() {
    const list = document.getElementById('teacher-list');
    list.innerHTML = '';
    teachers.forEach(teacher => {
        const li = document.createElement('li');
        li.textContent = teacher.name;
        li.dataset.name = teacher.name;

        if (teacher.name === currentTeacherName) {
            li.classList.add('active');
        }
        li.addEventListener('click', () => {
            switchTeacher(teacher.name);
        });
        list.appendChild(li);
    });
}

async function switchTeacher(name) {
    currentTeacherName = name;
    currentTeacherObj = teachers.find(t => t.name === name);

    document.getElementById('current-teacher-name').textContent = `Rezervace: ${name}`;

    const listItems = document.querySelectorAll('#teacher-list li');
    listItems.forEach(li => {
        if (li.dataset.name === name) li.classList.add('active');
        else li.classList.remove('active');
    });

    closeSidebar();
    await fetchReservations(); // Critical: Fetch latest data from server when switching
    renderSlots();
}

async function fetchReservations() {
    try {
        const response = await fetch('/api/reservations');
        reservations = await response.json();
        renderSlots();
    } catch (error) {
        console.error('Failed to fetch reservations:', error);
    }
}

function generateTimeSlots() {
    if (!currentTeacherObj) return [];

    const slots = [];
    let h = startHour;
    let m = 0;
    const interval = currentTeacherObj.interval || 10;

    // We end strictly at 17:50 for consistency, or we can just loop until 18:00?
    // User requirement: "first 16:00, last 17:50".
    // Which means last slot starts at 17:50.
    // 17:50 is 17*60 + 50 = 1070 mins.

    // Let's implement generic loop relative to start time
    const startMins = startHour * 60;
    const endMins = 17 * 60 + 50; // Last slot START time

    let currentMins = startMins;

    while (currentMins <= endMins) {
        const hh = Math.floor(currentMins / 60);
        const mm = currentMins % 60;

        const timeString = `${hh}:${mm.toString().padStart(2, '0')}`;
        slots.push(timeString);

        currentMins += interval;
    }
    return slots;
}

function renderSlots() {
    const container = document.getElementById('slots-container');
    container.innerHTML = '';

    if (!currentTeacherObj) return;

    const slots = generateTimeSlots();
    const teacherReservations = reservations[currentTeacherName] || {};

    slots.forEach(time => {
        const reservation = teacherReservations[time];
        const isOccupied = !!reservation;
        const studentName = isOccupied ? reservation.name : '';
        const reservationId = isOccupied ? reservation.id : null;

        // Determine ownership
        let isOwner = false;
        if (isOccupied && reservationId && localTokens[reservationId]) {
            isOwner = true;
        }

        const row = document.createElement('div');
        row.className = 'slot-row';

        const timeCol = document.createElement('div');
        timeCol.className = 'time-col';
        timeCol.textContent = time;

        const nameCol = document.createElement('div');
        nameCol.className = 'name-col';

        let input;

        if (isOccupied && !isOwner) {
            // Locked view
            const span = document.createElement('span');
            span.textContent = studentName;
            span.style.fontWeight = 'bold';
            span.style.padding = '8px 0';
            span.style.color = '#333';
            span.title = 'Tuto rezervaci vytvořil někdo jiný';
            nameCol.appendChild(span);
        } else {
            // Editable view (Empty OR Owner)
            input = document.createElement('input');
            input.type = 'text';
            input.className = 'name-input';
            input.value = studentName;
            input.placeholder = 'Volno';
            input.maxLength = 50; // Requested limit
            nameCol.appendChild(input);
        }

        const actionCol = document.createElement('div');
        actionCol.className = 'action-col';

        if (!isOccupied || isOwner) {
            const saveBtn = document.createElement('button');
            saveBtn.className = 'save-btn';

            if (isOccupied && isOwner) {
                saveBtn.textContent = 'Upravit';
                saveBtn.style.backgroundColor = '#ff9800';
            } else {
                saveBtn.textContent = 'Uložit';
            }

            saveBtn.onclick = () => saveReservation(time, input.value, reservationId);
            actionCol.appendChild(saveBtn);
        }

        row.appendChild(timeCol);
        row.appendChild(nameCol);
        row.appendChild(actionCol);

        container.appendChild(row);
    });
}

async function saveReservation(time, studentName, existingId) {
    const payload = {
        teacher: currentTeacherName,
        time: time,
        studentName: studentName
    };

    if (existingId && localTokens[existingId]) {
        payload.secretToken = localTokens[existingId];
    }

    try {
        const response = await fetch('/api/reserve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
            if (result.reservation && result.reservation.token) {
                localTokens[result.reservation.id] = result.reservation.token;
                saveTokens();
            }

            if (!studentName && existingId) {
                delete localTokens[existingId];
                saveTokens();
            }

            // Reload data from server (server.js doesn't return list anymore to be efficient)
            await fetchReservations(); // This updates 'reservations' and calls 'renderSlots'
        } else {
            alert('Chyba: ' + (result.error || 'Neznámá chyba'));
        }
    } catch (error) {
        console.error('Error saving:', error);
        alert('Chyba připojení');
    }
}

// Patient App State & Authentication
const API_BASE = 'https://hospital-queue-system-production.up.railway.app/api/v1';
const PATIENT_AUTH_KEY = 'mediflow_patient_auth';

let currentHospitalId = null; // BUG 34 FIX: set from auth.hospitalId only — never mutated client-side
let currentDoctorId = '';
let selectedBookingDoctorId = '';
let selectedBookingDoctorSlots = []; // track selected doctor's real slots
let myActiveAppointment = null;
let stompClient = null;
let queueStompSubscription = null;
let doctorsData = [];

function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getPatientAuth() {
    try {
        return JSON.parse(localStorage.getItem(PATIENT_AUTH_KEY) || 'null');
    } catch (e) {
        return null;
    }
}

function authFetch(url, options = {}) {
    const auth = getPatientAuth();
    const headers = options.headers || {};
    if (auth && auth.token) {
        headers['Authorization'] = `Bearer ${auth.token}`;
    }
    return fetch(url, { ...options, headers }).then(response => {
        if (response.status === 401) {
            // BUG 38 FIX: 'login.html' does not exist in patient-app — authentication
            // lives as a modal inside index.html. Clear the stale token and show the
            // modal in-place, exactly as DOMContentLoaded does on a fresh load.
            localStorage.removeItem(PATIENT_AUTH_KEY);
            alert('Your session has expired. Please log in again.');
            openPatientAuthModal();
        }
        return response;
    });
}


document.addEventListener('DOMContentLoaded', () => {
    const auth = getPatientAuth();
    if (!auth || !auth.token) {
        openPatientAuthModal();
    } else {
        initAuthenticatedSession(auth);
    }
});

function initAuthenticatedSession(auth) {
    // BUG 34 FIX: hospitalId is locked to whatever the JWT says — never changeable client-side.
    // A patient's tenant context is set at registration and enforced by TenantSecurityService.
    if (auth.hospitalId) {
        currentHospitalId = auth.hospitalId;
    }

    // Update User Profile UI
    const nameEl = document.getElementById('pUserName');
    if (nameEl) nameEl.textContent = auth.name || 'Patient';

    const avatarEl = document.getElementById('pUserAvatar');
    if (avatarEl && auth.name) {
        const initials = auth.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        avatarEl.textContent = initials;
    }

    // BUG 34 FIX: Show hospital name as static text — not a clickable switcher
    const hospNameEl = document.getElementById('selectedHospitalName');
    if (hospNameEl) hospNameEl.textContent = auth.hospitalName || 'My Hospital';

    fetchHospitalDetails();
    fetchDoctorsList();
    fetchPatientAppointments();
    connectWebSocket();
}

function fetchHospitalDetails() {
    if (!currentHospitalId) return;
    authFetch(`${API_BASE}/hospitals/${currentHospitalId}`)
        .then(r => r.ok ? r.json() : null)
        .then(hosp => {
            if (hosp && hosp.name) {
                const hospNameEl = document.getElementById('selectedHospitalName');
                if (hospNameEl) hospNameEl.textContent = hosp.name;
                const profileHospEl = document.getElementById('profileHospital');
                if (profileHospEl) profileHospEl.textContent = hosp.name;
            }
        })
        .catch(err => console.error('Error fetching hospital details:', err));
}

function openPatientAuthModal() {
    const modal = document.getElementById('patientAuthModal');
    if (modal) modal.style.display = 'flex';
    if (window.lucide) lucide.createIcons();
}

function closePatientAuthModal() {
    const modal = document.getElementById('patientAuthModal');
    if (modal) modal.style.display = 'none';
}

function togglePatientAuthMode(mode) {
    const alertBox = document.getElementById('patientAuthAlert');
    if (alertBox) alertBox.style.display = 'none';

    const loginForm = document.getElementById('patientLoginForm');
    const regForm = document.getElementById('patientRegisterForm');
    const title = document.getElementById('patientAuthTitle');

    if (mode === 'register') {
        loginForm.style.display = 'none';
        regForm.style.display = 'block';
        title.textContent = 'Register Patient Account';
    } else {
        regForm.style.display = 'none';
        loginForm.style.display = 'block';
        title.textContent = 'Patient Sign In';
    }
}

function showPatientAuthAlert(msg) {
    const alertBox = document.getElementById('patientAuthAlert');
    if (alertBox) {
        alertBox.textContent = msg;
        alertBox.style.display = 'block';
    }
}

function fillPatientDemo(email, password) {
    document.getElementById('pLoginEmail').value = email;
    document.getElementById('pLoginPassword').value = password;
}

async function handlePatientLogin(e) {
    e.preventDefault();
    const email = document.getElementById('pLoginEmail').value.trim();
    const password = document.getElementById('pLoginPassword').value;

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (!res.ok) {
            if (res.status === 429) {
                const err = await res.text();
                throw new Error(`🚫 LOCKED OUT: ${err}`);
            }
            const err = await res.text();
            throw new Error(err || 'Invalid email or password');
        }

        const data = await res.json();
        localStorage.setItem(PATIENT_AUTH_KEY, JSON.stringify(data));
        closePatientAuthModal();
        initAuthenticatedSession(data);
    } catch (err) {
        showPatientAuthAlert(err.message || 'Login failed.');
    }
}

async function handlePatientRegister(e) {
    e.preventDefault();
    const name = document.getElementById('pRegName').value.trim();
    const email = document.getElementById('pRegEmail').value.trim();
    const password = document.getElementById('pRegPassword').value;
    const hospitalCode = document.getElementById('pRegHospitalCode').value.trim().toUpperCase();

    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, role: 'PATIENT', hospitalCode })
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(err || 'Registration failed');
        }

        const data = await res.json();
        localStorage.setItem(PATIENT_AUTH_KEY, JSON.stringify(data));
        closePatientAuthModal();
        initAuthenticatedSession(data);
    } catch (err) {
        showPatientAuthAlert(err.message || 'Registration failed.');
    }
}

function patientLogout() {
    localStorage.removeItem(PATIENT_AUTH_KEY);
    window.location.reload();
}

function fetchDoctorsList() {
    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/doctors`)
        .then(r => r.ok ? r.json() : [])
        .then(doctors => {
            doctorsData = doctors || [];
            renderDoctorList();
            renderDepartmentPills();
        })
        .catch(err => {
            console.error('Error fetching doctors:', err);
            renderDoctorList();
        });
}



function fetchPatientAppointments() {
    const auth = getPatientAuth();
    if (!auth || !auth.userId) return;

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/appointments?patientId=${auth.userId}`)
        .then(r => r.ok ? r.json() : [])
        .then(appts => {
            const cancelBtn = document.getElementById('btnCancelAppointment');
            const multiSelector = document.getElementById('multiApptSelector');
            const multiPills = document.getElementById('multiApptPills');
            const multiTitle = document.getElementById('multiApptTitle');

            if (appts && appts.length > 0) {
                const activeList = appts.filter(a => a.status === 'BOOKED' || a.status === 'CHECKED_IN' || a.status === 'WAITING' || a.status === 'CALLED' || a.status === 'IN_CONSULTATION');
                
                if (multiSelector && multiPills && activeList.length > 1) {
                    multiSelector.style.display = 'block';
                    if (multiTitle) multiTitle.textContent = `Active Appointments (${activeList.length})`;
                    multiPills.innerHTML = activeList.map(a => {
                        const isSel = myActiveAppointment && myActiveAppointment.id === a.id;
                        return `<button onclick="selectActiveAppointment('${a.id}')" style="background:${isSel ? 'var(--primary)' : 'rgba(255,255,255,0.06)'}; color:${isSel ? '#090D16' : '#fff'}; border:1px solid ${isSel ? 'var(--primary)' : 'rgba(255,255,255,0.12)'}; padding:6px 12px; border-radius:20px; font-size:0.8rem; font-weight:700; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;">
                            <i data-lucide="cross" style="width:12px; height:12px;"></i> ${a.doctorName} (${a.queueNumber || a.timeSlot})
                        </button>`;
                    }).join('');
                    if (window.lucide) lucide.createIcons();
                } else if (multiSelector) {
                    multiSelector.style.display = 'none';
                }

                // Pick active appointment
                const active = (myActiveAppointment && activeList.find(a => a.id === myActiveAppointment.id)) || activeList[0] || appts[appts.length - 1];
                if (active) {
                    myActiveAppointment = active;
                    currentDoctorId = active.doctorId;
                    document.getElementById('patientToken').textContent = active.queueNumber || '--';
                    document.getElementById('ticketDoctorName').textContent = `${active.doctorName || 'Doctor'} (${active.departmentName || 'General'})`;
                    document.getElementById('ticketScheduledTime').textContent = `${active.appointmentDate} ${active.timeSlot}`;
                    document.getElementById('queueStatusText').textContent = `Status: ${active.status}`;
                    
                    if (cancelBtn) {
                        cancelBtn.style.display = (active.status !== 'CANCELLED' && active.status !== 'COMPLETED') ? 'inline-flex' : 'none';
                    }

                    fetchQueueSummaryForDoctor(currentDoctorId);
                    subscribeToQueueTopic(currentDoctorId);
                } else if (cancelBtn) {
                    cancelBtn.style.display = 'none';
                }
            } else {
                if (multiSelector) multiSelector.style.display = 'none';
                if (cancelBtn) cancelBtn.style.display = 'none';
            }
        })
        .catch(err => console.error('Error fetching patient appointments:', err));
}

function selectActiveAppointment(apptId) {
    const auth = getPatientAuth();
    if (!auth || !auth.userId) return;
    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/appointments?patientId=${auth.userId}`)
        .then(r => r.ok ? r.json() : [])
        .then(appts => {
            const found = (appts || []).find(a => a.id === apptId);
            if (found) {
                myActiveAppointment = found;
                fetchPatientAppointments();
            }
        });
}

function cancelMyAppointment() {
    if (!myActiveAppointment || !myActiveAppointment.id) return;
    if (!confirm('Are you sure you want to cancel your appointment?')) return;

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/appointments/${myActiveAppointment.id}/cancel`, {
        method: 'POST'
    })
    .then(r => {
        if (!r.ok) return r.text().then(t => { throw new Error(t || 'Failed to cancel appointment'); });
        return r.json();
    })
    .then(data => {
        alert('Appointment cancelled successfully.');
        myActiveAppointment = null;
        document.getElementById('patientToken').textContent = '--';
        document.getElementById('ticketDoctorName').textContent = 'No active booking';
        document.getElementById('ticketScheduledTime').textContent = 'None';
        document.getElementById('queueStatusText').textContent = 'Select a doctor below to book an appointment';
        const cancelBtn = document.getElementById('btnCancelAppointment');
        if (cancelBtn) cancelBtn.style.display = 'none';
        fetchPatientAppointments();
        fetchAppointmentHistory();
    })
    .catch(err => {
        console.error('Error cancelling appointment:', err);
        alert(err.message || 'Error cancelling appointment');
    });
}

function renderDoctorList(data) {
    const doctors = data || doctorsData;
    const container = document.getElementById('doctorListContainer');
    if (!container) return;

    if (doctors.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); padding:16px;">No doctors found.</p>`;
        return;
    }

    container.innerHTML = doctors.map(doc => {
        const hasReviews = doc.totalRatings && doc.totalRatings > 0;
        const ratingText = hasReviews ? `⭐ ${doc.averageRating.toFixed(1)} (${doc.totalRatings} ${doc.totalRatings === 1 ? 'review' : 'reviews'})` : `★ New Doctor`;
        const ratingStyle = hasReviews 
            ? 'background:rgba(251,191,36,0.15); color:#FBBF24;' 
            : 'background:rgba(56,189,248,0.12); color:#38BDF8;';

        return `
            <div class="doctor-card-item">
                <div class="doc-info">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <h5>${escapeHtml(doc.name)}</h5>
                        <span style="${ratingStyle} padding:1px 6px; border-radius:8px; font-size:0.72rem; font-weight:700;">${ratingText}</span>
                    </div>
                    <p>${escapeHtml(doc.departmentName || 'General')} &bull; ${escapeHtml(doc.roomNumber || 'Room --')}</p>
                    <p style="color:var(--primary); font-size:0.75rem; margin-top:2px;">${escapeHtml(doc.specialization || 'Specialist')}</p>
                    ${!doc.available ? '<span style="font-size:0.72rem; color:#F87171; font-weight:600; background:rgba(248,113,113,0.12); padding:2px 8px; border-radius:12px;">&#9679; On Leave</span>' : ''}
                </div>
                ${ doc.available
                    ? `<button class="btn-book" onclick="openBookingModal('${escapeHtml(doc.id)}', '${escapeHtml(doc.name)}', '${escapeHtml(doc.departmentName || 'General')}', '${escapeHtml(doc.roomNumber || '')}')">Book</button>`
                    : `<button class="btn-book" disabled style="opacity:0.35; cursor:not-allowed;">Book</button>`
                }
            </div>
        `;
    }).join('');
}

// BUG 36 FIX: Pills now have onclick handlers that filter the doctor list.
function renderDepartmentPills() {
    const container = document.getElementById('departmentPills');
    if (!container) return;

    const depts = [...new Set(doctorsData.map(d => d.departmentName || 'General'))];
    if (depts.length === 0) {
        container.innerHTML = `<button class="dept-pill active" onclick="filterByDept(this,'ALL')">All</button>`;
        return;
    }

    // "All" pill always first, then one per unique department
    container.innerHTML =
        `<button class="dept-pill active" onclick="filterByDept(this,'ALL')">All</button>` +
        depts.map(dept =>
            `<button class="dept-pill" onclick="filterByDept(this,'${escapeHtml(dept)}')">${escapeHtml(dept)}</button>`
        ).join('');
}

// BUG 36 FIX: Filter doctorsData by the clicked department, re-render the list,
// and move the 'active' CSS class to the clicked pill.
function filterByDept(clickedBtn, dept) {
    // Update pill active state
    document.querySelectorAll('#departmentPills .dept-pill').forEach(b => b.classList.remove('active'));
    clickedBtn.classList.add('active');

    // Filter and render
    const filtered = dept === 'ALL' ? doctorsData : doctorsData.filter(d => (d.departmentName || 'General') === dept);
    renderDoctorList(filtered);

    // Scroll the doctor list into view so the user sees the result immediately
    const doctorSection = document.getElementById('view-doctors');
    if (doctorSection) doctorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openBookingModal(docId, name, department, room) {
    selectedBookingDoctorId = docId;
    document.getElementById('modalDocName').textContent = name;
    document.getElementById('modalDocSpec').textContent = `${department} Specialist ${room ? '&bull; ' + room : ''}`;
    
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const dateInput = document.getElementById('bookingDateInput');
    if (dateInput) {
        dateInput.min = today;
        dateInput.value = today;
    }

    // BUG 30 FIX: Populate slot grid from the doctor's real availableSlots
    const doc = doctorsData.find(d => d.id === docId);
    selectedBookingDoctorSlots = (doc && doc.availableSlots && doc.availableSlots.length > 0)
        ? doc.availableSlots
        : ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30'];

    const modal = document.getElementById('bookingModal');
    modal.style.display = 'flex';

    // BUG 42 FIX: Fetch existing appointments for doctor & date to disable booked slots
    refreshBookingSlots();
}

// BUG 42 FIX: Re-fetch doctor's appointments for selected date and disable already-booked slots
function refreshBookingSlots() {
    if (!selectedBookingDoctorId || !currentHospitalId) return;

    const dateInput = document.getElementById('bookingDateInput');
    const selectedDate = dateInput ? dateInput.value : '';
    const slotGrid = document.getElementById('slotGrid');
    if (!slotGrid) return;

    if (!selectedDate) {
        slotGrid.innerHTML = `<p style="color:var(--text-muted); font-size:0.8rem; grid-column:1/-1;">Please select a date.</p>`;
        return;
    }

    slotGrid.innerHTML = `<p style="color:var(--text-muted); font-size:0.8rem; grid-column:1/-1;">Checking slot availability...</p>`;

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/appointments?doctorId=${selectedBookingDoctorId}`)
        .then(r => r.ok ? r.json() : [])
        .then(appts => {
            const bookedSlots = new Set(
                (appts || [])
                    .filter(a => a.appointmentDate === selectedDate && a.status !== 'CANCELLED')
                    .map(a => a.timeSlot)
            );

            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const isToday = selectedDate === todayStr;
            const currentMins = now.getHours() * 60 + now.getMinutes();

            let firstAvailableSelected = false;

            let html = selectedBookingDoctorSlots.map(slot => {
                const [hh, mm] = slot.split(':');
                const h = parseInt(hh, 10);
                const period = h < 12 ? 'AM' : 'PM';
                const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
                const displayStr = `${String(displayH).padStart(2, '0')}:${mm} ${period}`;

                const slotMins = parseInt(hh, 10) * 60 + parseInt(mm, 10);
                const isPast = isToday && slotMins <= currentMins;
                const isBooked = bookedSlots.has(slot);

                if (isPast) {
                    return `<button class="slot-btn booked" data-slot="${slot}" disabled title="Time has passed for today">${displayStr} (Passed)</button>`;
                } else if (isBooked) {
                    return `<button class="slot-btn booked" data-slot="${slot}" disabled title="Already booked for this date">${displayStr} (Booked)</button>`;
                } else {
                    const isActive = !firstAvailableSelected;
                    if (isActive) firstAvailableSelected = true;
                    return `<button class="slot-btn ${isActive ? 'active' : ''}" data-slot="${slot}" onclick="selectSlot(this)">${displayStr}</button>`;
                }
            }).join('');

            if (!firstAvailableSelected) {
                html += `<p style="color:#F87171; font-size:0.78rem; grid-column:1/-1; margin-top:4px;">No available slots remaining for this date. Please choose another date.</p>`;
            }

            slotGrid.innerHTML = html;
        })
        .catch(err => {
            console.error('Error checking slot availability:', err);
            let firstAvailableSelected = false;
            slotGrid.innerHTML = selectedBookingDoctorSlots.map(slot => {
                const [hh, mm] = slot.split(':');
                const h = parseInt(hh, 10);
                const period = h < 12 ? 'AM' : 'PM';
                const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
                const displayStr = `${String(displayH).padStart(2, '0')}:${mm} ${period}`;
                const isActive = !firstAvailableSelected;
                firstAvailableSelected = true;
                return `<button class="slot-btn ${isActive ? 'active' : ''}" data-slot="${slot}" onclick="selectSlot(this)">${displayStr}</button>`;
            }).join('');
        });
}

function selectSlot(btn) {
    document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function closeBookingModal() {
    document.getElementById('bookingModal').style.display = 'none';
}

function confirmAppointmentBooking() {
    const auth = getPatientAuth();
    if (!auth || !auth.userId) {
        alert('Please sign in to book an appointment.');
        openPatientAuthModal();
        return;
    }

    if (!selectedBookingDoctorId) {
        alert('No doctor selected.');
        return;
    }

    const bookingDate = document.getElementById('bookingDateInput').value;
    const activeSlotBtn = document.querySelector('.slot-btn.active');
    if (!activeSlotBtn) {
        alert('Please select an available time slot.');
        return;
    }
    const timeSlot = activeSlotBtn.getAttribute('data-slot') || activeSlotBtn.textContent.trim();


    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/appointments/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            patientId: auth.userId, // REAL authenticated patient ID (BUG 4 FIX)
            patientName: auth.name, // REAL authenticated patient name
            doctorId: selectedBookingDoctorId,
            appointmentDate: bookingDate,
            timeSlot: timeSlot
        })
    })
    .then(res => {
        if (!res.ok) throw new Error('Booking failed');
        return res.json();
    })
    .then(savedAppt => {
        closeBookingModal();
        myActiveAppointment = savedAppt;
        currentDoctorId = savedAppt.doctorId;

        const doc = doctorsData.find(d => d.id === currentDoctorId);
        document.getElementById('patientToken').textContent = savedAppt.queueNumber || '--';
        document.getElementById('ticketDoctorName').textContent = `${savedAppt.doctorName || doc?.name || 'Doctor'} (${savedAppt.departmentName || 'General'})`;
        document.getElementById('ticketScheduledTime').textContent = `${savedAppt.appointmentDate} ${savedAppt.timeSlot}`;
        document.getElementById('queueStatusText').textContent = `Appointment Confirmed! Token: ${savedAppt.queueNumber}`;
        document.getElementById('queueStatusBanner').className = 'queue-status-banner status-waiting';

        alert(`🎉 Appointment Booked Successfully!\n\nPatient: ${auth.name}\nDoctor: ${savedAppt.doctorName}\nQueue Token: ${savedAppt.queueNumber}`);

        // Fetch current queue summary and subscribe WebSocket
        fetchQueueSummaryForDoctor(currentDoctorId);
        subscribeToQueueTopic(currentDoctorId);
    })
    .catch(err => {
        console.error('Error booking appointment:', err);
        alert('Could not connect to backend to book appointment.');
    });
}

function fetchQueueSummaryForDoctor(doctorId) {
    if (!doctorId) return;
    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/queues/doctor/${doctorId}`)
        .then(r => r.ok ? r.json() : null)
        .then(summary => {
            if (summary) updateLiveQueueTicket(summary);
        })
        .catch(err => console.error('Error fetching queue summary:', err));
}

// WebSocket STOMP Connection
function connectWebSocket() {
    try {
        const auth = getPatientAuth();
        const headers = auth && auth.token ? { 'Authorization': 'Bearer ' + auth.token } : {};
        const socket = new SockJS('https://hospital-queue-system-production.up.railway.app/ws-queue');
        stompClient = Stomp.over(socket);
        stompClient.debug = null;

        stompClient.connect(headers, (frame) => {
            console.log('Patient App STOMP WebSocket Connected');
            if (currentDoctorId) {
                subscribeToQueueTopic(currentDoctorId);
            }
            subscribeToPatientNotificationsTopic();
            subscribeToDoctorsTopic();
            fetchPatientUnreadNotificationsCount();
        });
    } catch (e) {
        console.log('WebSocket SockJS initialization error', e);
    }
}

let doctorsStompSubscription = null;

function subscribeToDoctorsTopic() {
    if (!stompClient || !stompClient.connected || !currentHospitalId) return;

    if (doctorsStompSubscription) {
        doctorsStompSubscription.unsubscribe();
        doctorsStompSubscription = null;
    }

    const topic = `/topic/hospital/${currentHospitalId}/doctors`;
    doctorsStompSubscription = stompClient.subscribe(topic, (message) => {
        try {
            const updatedDoctor = JSON.parse(message.body);
            if (!updatedDoctor || !updatedDoctor.id) return;
            const idx = doctorsData.findIndex(d => d.id === updatedDoctor.id);
            if (idx >= 0) {
                doctorsData[idx] = { ...doctorsData[idx], ...updatedDoctor };
            } else {
                doctorsData.push(updatedDoctor);
            }
            renderDoctors();
            renderDepartmentPills();
        } catch (e) {
            console.error('Error parsing doctor update in patient app:', e);
        }
    });
}

function subscribeToQueueTopic(doctorId) {
    if (!stompClient || !stompClient.connected || !doctorId) return;

    if (queueStompSubscription) {
        queueStompSubscription.unsubscribe();
        queueStompSubscription = null;
    }

    const topic = `/topic/hospital/${currentHospitalId}/queue/${doctorId}`;
    queueStompSubscription = stompClient.subscribe(topic, (message) => {
        const summary = JSON.parse(message.body);
        updateLiveQueueTicket(summary);
    });
}

function updateLiveQueueTicket(summary) {
    if (!summary) return;

    const serving = summary.currentlyServingToken || '--';
    document.getElementById('currentServingToken').textContent = serving;
    // BUG 35 FIX: also mirror into the dedicated Queue tab
    const qts = document.getElementById('queueTabServing');
    if (qts) qts.textContent = serving;

    if (!myActiveAppointment || !myActiveAppointment.queueNumber) {
        return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = myActiveAppointment.appointmentDate === todayStr;

    const doc = doctorsData.find(d => d.id === (summary.doctorId || currentDoctorId));
    const roomName = doc ? (doc.roomNumber || 'Doctor Room') : 'Doctor Room';

    if (!isToday) {
        const scheduledText = `📅 Scheduled for ${myActiveAppointment.appointmentDate} at ${myActiveAppointment.timeSlot || ''}`;
        document.getElementById('peopleAheadCount').textContent = '--';
        document.getElementById('estWaitTime').textContent = '--';
        document.getElementById('queueStatusBanner').className = 'queue-status-banner status-waiting';
        document.getElementById('queueStatusText').textContent = scheduledText;
        const qa = document.getElementById('queueTabAhead'); if (qa) qa.textContent = '--';
        const qw = document.getElementById('queueTabWait'); if (qw) qw.textContent = '--';
        const qb = document.getElementById('queueTabStatusBanner'); if (qb) qb.className = 'queue-status-banner status-waiting';
        const qt = document.getElementById('queueTabStatusText'); if (qt) qt.textContent = scheduledText;
        return;
    }

    const myToken = myActiveAppointment.queueNumber;
    const entries = summary.entries || [];
    const myEntry = entries.find(e => (myToken && e.queueNumber === myToken) || e.appointmentId === myActiveAppointment.id || e.id === myActiveAppointment.id);

    if (serving === myToken || (myEntry && (myEntry.status === 'CALLED' || myEntry.status === 'IN_CONSULTATION'))) {
        document.getElementById('peopleAheadCount').textContent = '0';
        document.getElementById('estWaitTime').textContent = 'Now!';
        document.getElementById('queueStatusBanner').className = 'queue-status-banner status-in-consultation';
        document.getElementById('queueStatusText').textContent = `Your turn! Please enter ${roomName}`;
        // Mirror to queue tab
        const qa = document.getElementById('queueTabAhead'); if (qa) qa.textContent = '0';
        const qw = document.getElementById('queueTabWait'); if (qw) qw.textContent = 'Now!';
        const qb = document.getElementById('queueTabStatusBanner'); if (qb) qb.className = 'queue-status-banner status-in-consultation';
        const qt = document.getElementById('queueTabStatusText'); if (qt) qt.textContent = `Your turn! Please enter ${roomName}`;
    } else if (myEntry && myEntry.status === 'COMPLETED') {
        document.getElementById('peopleAheadCount').textContent = '0';
        document.getElementById('estWaitTime').textContent = 'Done';
        document.getElementById('queueStatusBanner').className = 'queue-status-banner status-completed';
        document.getElementById('queueStatusText').textContent = 'Consultation Completed. Thank you!';
        const qa = document.getElementById('queueTabAhead'); if (qa) qa.textContent = '0';
        const qw = document.getElementById('queueTabWait'); if (qw) qw.textContent = 'Done';
        const qb = document.getElementById('queueTabStatusBanner'); if (qb) qb.className = 'queue-status-banner status-completed';
        const qt = document.getElementById('queueTabStatusText'); if (qt) qt.textContent = 'Consultation Completed. Thank you!';
    } else if (myEntry && myEntry.status === 'WAITING') {
        let waitingEntries = entries.filter(e => e.status === 'WAITING');
        let myIndex = waitingEntries.findIndex(e => (myToken && e.queueNumber === myToken) || e.appointmentId === myActiveAppointment.id || e.id === myActiveAppointment.id);
        let aheadCount = myIndex >= 0 ? myIndex : 0;
        const waitStr = aheadCount === 0 ? 'Next up!' : `${aheadCount * 10} mins`;
        
        let statusStr = `Waiting in queue (${aheadCount} patient${aheadCount !== 1 ? 's' : ''} ahead)`;
        if (aheadCount === 0) {
            statusStr = `🔔 You're next in line! Please wait outside ${roomName}`;
        } else if (aheadCount === 1) {
            statusStr = `🔔 Almost your turn (1 ahead)! Proceed towards ${roomName}`;
        } else if (aheadCount === 2) {
            statusStr = `🔔 2 tokens away! Please head towards ${roomName}`;
        }

        document.getElementById('peopleAheadCount').textContent = aheadCount;
        document.getElementById('estWaitTime').textContent = waitStr;
        document.getElementById('queueStatusBanner').className = 'queue-status-banner status-waiting';
        document.getElementById('queueStatusText').textContent = statusStr;
        // Mirror to queue tab
        const qa = document.getElementById('queueTabAhead'); if (qa) qa.textContent = aheadCount;
        const qw = document.getElementById('queueTabWait'); if (qw) qw.textContent = waitStr;
        const qb = document.getElementById('queueTabStatusBanner'); if (qb) qb.className = 'queue-status-banner status-waiting';
        const qt = document.getElementById('queueTabStatusText'); if (qt) qt.textContent = statusStr;
    } else {
        const waitingCount = summary.waitingCount || 0;
        const statusStr = `📅 Today at ${myActiveAppointment.timeSlot || ''} (Token ${myActiveAppointment.queueNumber || '--'})`;
        document.getElementById('peopleAheadCount').textContent = waitingCount;
        document.getElementById('estWaitTime').textContent = waitingCount ? `${waitingCount * 10} mins` : '--';
        document.getElementById('queueStatusBanner').className = 'queue-status-banner status-waiting';
        document.getElementById('queueStatusText').textContent = statusStr;
        const qa = document.getElementById('queueTabAhead'); if (qa) qa.textContent = waitingCount;
        const qw = document.getElementById('queueTabWait'); if (qw) qw.textContent = waitingCount ? `${waitingCount * 10} mins` : '--';
        const qb = document.getElementById('queueTabStatusBanner'); if (qb) qb.className = 'queue-status-banner status-waiting';
        const qt = document.getElementById('queueTabStatusText'); if (qt) qt.textContent = statusStr;
    }
}

function showTicketQr() {
    if (!myActiveAppointment) {
        alert('Please book an appointment first to view ticket QR code.');
        return;
    }
    alert(`🎫 QUEUE TICKET DETAILS\n\nToken: ${myActiveAppointment.queueNumber}\nDoctor: ${myActiveAppointment.doctorName}\nStatus: ${myActiveAppointment.status || 'CHECKED_IN'}`);
}

// ─── BUG 35 FIX: Tab Navigation ─────────────────────────────────────────────
// switchNav() is the single source of truth for which view is visible.
// It hides every view panel, then shows the matching one, and updates
// the bottom nav button active states using element IDs.

const ALL_VIEWS = ['home', 'appointments', 'queue', 'profile'];

function switchNav(tab) {
    // Hide all views
    ALL_VIEWS.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.style.display = 'none';
    });

    // Show the target view
    const target = document.getElementById(`view-${tab}`);
    if (target) target.style.display = '';

    // Update nav button active states
    ALL_VIEWS.forEach(v => {
        const btn = document.getElementById(`nav-${v}`);
        if (btn) btn.classList.toggle('active', v === tab);
    });

    // Lazy data fetch when switching to Appointments tab
    if (tab === 'appointments') {
        fetchAppointmentHistory();
    }

    // Populate profile info when switching to Profile tab
    if (tab === 'profile') {
        populateProfileTab();
    }

    // Sync queue tab token/doctor display when switching to queue tab
    if (tab === 'queue' && myActiveAppointment) {
        const qt = document.getElementById('queueTabToken');
        if (qt) qt.textContent = myActiveAppointment.queueNumber || '--';
        const qd = document.getElementById('queueTabDoctorName');
        if (qd) qd.textContent = myActiveAppointment.doctorName ? `${myActiveAppointment.doctorName} (${myActiveAppointment.departmentName || 'General'})` : 'No active booking';
    }

    // Scroll view panel to top
    const appBody = document.querySelector('.app-body');
    if (appBody) appBody.scrollTop = 0;
}

// Scrolls to a section within the home view without changing the active tab
function scrollToSection(sectionId) {
    // Make sure home view is visible first
    switchNav('home');
    setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
}

// ─── BUG 35 FIX: Full Appointment History ────────────────────────────────────

function fetchAppointmentHistory() {
    const auth = getPatientAuth();
    if (!auth || !auth.userId || !currentHospitalId) return;

    const container = document.getElementById('appointmentHistoryContainer');
    if (container) container.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem; padding:16px 0;">Loading…</p>`;

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/appointments?patientId=${auth.userId}`)
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(appts => renderAppointmentHistory(appts || []))
        .catch(err => {
            // Never fail silently — show a visible error message (BUG 34 pattern)
            if (container) container.innerHTML = `
                <div style="background:rgba(248,113,113,0.1); border:1px solid rgba(248,113,113,0.3); border-radius:12px; padding:16px; color:#F87171; font-size:0.85rem;">
                    <strong>Could not load appointments.</strong><br>
                    ${escapeHtml(err.message || 'Network error')}
                </div>`;
        });
}

const STATUS_COLORS = {
    BOOKED:          { bg: 'rgba(56,189,248,0.12)',  color: '#38BDF8' },
    CHECKED_IN:      { bg: 'rgba(56,189,248,0.12)',  color: '#38BDF8' },
    WAITING:         { bg: 'rgba(251,191,36,0.12)',  color: '#FBBF24' },
    CALLED:          { bg: 'rgba(168,85,247,0.15)',  color: '#C084FC' },
    IN_CONSULTATION: { bg: 'rgba(52,211,153,0.15)',  color: '#34D399' },
    COMPLETED:       { bg: 'rgba(52,211,153,0.12)',  color: '#34D399' },
    CANCELLED:       { bg: 'rgba(248,113,113,0.12)', color: '#F87171' },
};

function renderAppointmentHistory(appts) {
    const container = document.getElementById('appointmentHistoryContainer');
    if (!container) return;

    if (!appts || appts.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:32px 0; color:var(--text-muted);">
                <p style="font-size:2rem; margin-bottom:8px;">&#128197;</p>
                <p style="font-size:0.88rem;">No appointments yet.</p>
                <p style="font-size:0.78rem; margin-top:4px;">Book your first appointment from the Home tab.</p>
            </div>`;
        return;
    }

    // Sort newest first
    const sorted = [...appts].sort((a, b) => {
        const da = a.appointmentDate || '';
        const db = b.appointmentDate || '';
        return db.localeCompare(da) || (b.timeSlot || '').localeCompare(a.timeSlot || '');
    });

    container.innerHTML = sorted.map(appt => {
        const sc = STATUS_COLORS[appt.status] || { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' };
        const canCancel = appt.status !== 'CANCELLED' && appt.status !== 'COMPLETED';
        return `
            <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:14px; padding:16px; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <div>
                        <p style="font-weight:700; font-size:0.92rem;">${escapeHtml(appt.doctorName || 'Doctor')}</p>
                        <p style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">${escapeHtml(appt.departmentName || 'General')}</p>
                    </div>
                    <span style="font-size:0.72rem; font-weight:700; padding:3px 10px; border-radius:20px; background:${sc.bg}; color:${sc.color};">
                        ${escapeHtml(appt.status || '—')}
                    </span>
                </div>
                <div style="display:flex; gap:16px; font-size:0.78rem; color:var(--text-muted); margin-bottom:${canCancel ? '10px' : '0'};">
                    <span>&#128197; ${escapeHtml(appt.appointmentDate || '—')}</span>
                    <span>&#128336; ${escapeHtml(appt.timeSlot || '—')}</span>
                    ${appt.queueNumber ? `<span>&#127915; Token: <strong style="color:var(--primary);">${escapeHtml(appt.queueNumber)}</strong></span>` : ''}
                </div>
                ${appt.status === 'COMPLETED' ? `
                    <div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.06);">
                        ${appt.rating ? `
                            <div style="display:flex; align-items:center; justify-content:space-between;">
                                <span style="color:#FBBF24; font-size:0.8rem; font-weight:700;">⭐ You Rated: ${appt.rating}/5 ${appt.feedbackComment ? `"${escapeHtml(appt.feedbackComment)}"` : ''}</span>
                                <button onclick="openPatientRatingModal('${escapeHtml(appt.id)}', '${escapeHtml(appt.doctorName)}', ${appt.rating}, '${escapeHtml(appt.feedbackComment || '')}')" style="font-size:0.75rem; color:var(--primary); background:none; border:none; cursor:pointer;">Edit</button>
                            </div>
                        ` : `
                            <button onclick="openPatientRatingModal('${escapeHtml(appt.id)}', '${escapeHtml(appt.doctorName)}', 5, '')" style="width:100%; font-size:0.8rem; color:#FBBF24; background:rgba(251,191,36,0.1); border:1px solid rgba(251,191,36,0.3); border-radius:8px; padding:6px; cursor:pointer; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px;">
                                ⭐ Rate Doctor & Consultation
                            </button>
                        `}
                    </div>
                ` : ''}
                ${canCancel ? `
                    <div style="display:flex; gap:8px; margin-top:8px;">
                        <button onclick="openPatientRescheduleModal('${escapeHtml(appt.id)}', '${escapeHtml(appt.doctorId)}', '${escapeHtml(appt.doctorName)}')" style="font-size:0.78rem; color:var(--primary); background:rgba(56,189,248,0.08); border:1px solid rgba(56,189,248,0.25); border-radius:8px; padding:5px 12px; cursor:pointer; font-family:var(--font);">Reschedule</button>
                        <button onclick="cancelAppointmentById('${escapeHtml(appt.id)}')" style="font-size:0.78rem; color:#F87171; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25); border-radius:8px; padding:5px 12px; cursor:pointer; font-family:var(--font);">Cancel</button>
                    </div>
                ` : ''}
            </div>`;
    }).join('');
}

// Doctor Rating Modal Logic
let currentWebRatingScore = 5;

function openPatientRatingModal(apptId, doctorName, currentScore = 5, feedbackComment = '') {
    document.getElementById('ratingApptId').value = apptId;
    document.getElementById('ratingDocName').textContent = doctorName;
    document.getElementById('ratingFeedbackComment').value = feedbackComment;
    setWebRatingScore(currentScore || 5);
    const modal = document.getElementById('patientRatingModal');
    if (modal) modal.style.display = 'flex';
}

function closePatientRatingModal() {
    const modal = document.getElementById('patientRatingModal');
    if (modal) modal.style.display = 'none';
}

function setWebRatingScore(score) {
    currentWebRatingScore = score;
    const container = document.getElementById('ratingStarContainer');
    if (!container) return;
    const buttons = container.querySelectorAll('.star-btn');
    buttons.forEach((btn, idx) => {
        btn.style.color = idx < score ? '#FBBF24' : '#64748B';
    });
}

function submitPatientRating() {
    const apptId = document.getElementById('ratingApptId').value;
    const feedback = document.getElementById('ratingFeedbackComment').value.trim();

    if (!apptId || !currentHospitalId) return;

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/appointments/${apptId}/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            rating: currentWebRatingScore,
            feedbackComment: feedback || undefined
        })
    })
    .then(async r => {
        if (!r.ok) {
            const err = await r.text();
            throw new Error(err || 'Failed to submit rating');
        }
        return r.json();
    })
    .then(() => {
        alert('Thank you! Your feedback and star rating have been submitted successfully.');
        closePatientRatingModal();
        fetchAppointmentHistory();
        fetchDoctorsList();
    })
    .catch(err => {
        alert(err.message || 'Error submitting rating');
    });
}

// Cancel an appointment from the history list by ID
function cancelAppointmentById(appointmentId) {
    if (!confirm('Cancel this appointment?')) return;
    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/appointments/${appointmentId}/cancel`, { method: 'POST' })
        .then(r => {
            if (!r.ok) return r.text().then(t => { throw new Error(t || 'Cancel failed'); });
            return r.json();
        })
        .then(() => {
            fetchAppointmentHistory(); // refresh the list
            fetchPatientAppointments(); // also refresh the home ticket card
        })
        .catch(err => alert(err.message || 'Error cancelling appointment'));
}

// Populate profile tab with data from localStorage auth object
function populateProfileTab() {
    const auth = getPatientAuth();
    if (!auth) return;
    const initials = auth.name ? auth.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 'P';
    const pa = document.getElementById('profileAvatar'); if (pa) pa.textContent = initials;
    const pn = document.getElementById('profileName'); if (pn) pn.textContent = auth.name || 'Patient';
    const pe = document.getElementById('profileEmail'); if (pe) pe.textContent = auth.email || '—';
    const ph = document.getElementById('profileHospital'); if (ph) ph.textContent = auth.hospitalName || auth.hospitalId || '—';
    const pl = document.getElementById('profileLanguageSelect');
    if (pl) {
        pl.value = auth.preferredLanguage || localStorage.getItem('mediflow_patient_lang') || 'ta';
    }
}

function updateWebPatientLanguage(lang) {
    localStorage.setItem('mediflow_patient_lang', lang);
    const auth = getPatientAuth();
    if (auth) {
        auth.preferredLanguage = lang;
        localStorage.setItem(PATIENT_AUTH_KEY, JSON.stringify(auth));
    }
    authFetch(`${API_BASE}/auth/profile/language`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang })
    })
    .then(r => r.ok ? r.json() : null)
    .then(() => {
        alert(lang === 'ta' 
            ? 'அறிவிப்புகள் இனி தமிழில் வரும். (Notifications set to Tamil)' 
            : 'Notifications will now be delivered in English.');
    })
    .catch(err => console.log('Error updating language preference:', err));
}

// --- Missing Spec Features: Patient Notifications ---
function togglePatientNotifications() {
    const el = document.getElementById('patientNotificationsModal');
    if (!el) return;
    if (el.style.display === 'none') {
        el.style.display = 'flex';
        fetchPatientNotifications();
    } else {
        el.style.display = 'none';
    }
}

function closePatientNotificationsModal() {
    document.getElementById('patientNotificationsModal').style.display = 'none';
}

function fetchPatientUnreadNotificationsCount() {
    const auth = getPatientAuth();
    const hospId = currentHospitalId || (auth && auth.hospitalId);
    if (!hospId || !auth || !auth.userId) return;

    authFetch(`${API_BASE}/hospitals/${hospId}/notifications/unread-count?userId=${encodeURIComponent(auth.userId)}`)
        .then(r => r.ok ? r.json() : { unreadCount: 0 })
        .then(data => {
            const dot = document.getElementById('patientBellDot');
            if (dot) {
                dot.style.display = data.unreadCount > 0 ? 'block' : 'none';
            }
        })
        .catch(err => console.error(err));
}

function fetchPatientNotifications() {
    const auth = getPatientAuth();
    const hospId = currentHospitalId || (auth && auth.hospitalId);
    if (!hospId || !auth || !auth.userId) return;

    authFetch(`${API_BASE}/hospitals/${hospId}/notifications?userId=${encodeURIComponent(auth.userId)}`)
        .then(r => r.ok ? r.json() : [])
        .then(notifications => {
            renderPatientNotifications(notifications);
        })
        .catch(err => console.error(err));
}

function renderPatientNotifications(notifications) {
    const container = document.getElementById('patientNotificationsList');
    if (!container) return;

    if (notifications.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem; padding:8px 0; text-align:center;">No new notifications</p>`;
        return;
    }

    container.innerHTML = notifications.map(n => {
        const timeStr = new Date(n.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        return `
            <div onclick="markPatientNotificationRead('${n.id}')" style="background:${n.read ? 'rgba(255,255,255,0.02)' : 'rgba(56,189,248,0.08)'}; border:1px solid ${n.read ? 'rgba(255,255,255,0.05)' : 'rgba(56,189,248,0.3)'}; padding:12px; border-radius:10px; cursor:pointer; margin-bottom:6px; text-align:left;">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <strong style="font-size:0.85rem; color:${n.read ? '#fff' : 'var(--primary)'};">${escapeHtml(n.title)}</strong>
                    <span style="font-size:0.7rem; color:var(--text-muted);">${timeStr}</span>
                </div>
                <p style="font-size:0.78rem; color:var(--text-muted); margin:0; line-height:1.35;">${escapeHtml(n.message)}</p>
            </div>
        `;
    }).join('');
}

function markPatientNotificationRead(id) {
    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/notifications/${id}/read`, { method: 'POST' })
        .then(() => {
            fetchPatientNotifications();
            fetchPatientUnreadNotificationsCount();
        })
        .catch(err => console.error(err));
}

function markAllPatientNotificationsAsRead() {
    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/notifications/read-all`, { method: 'POST' })
        .then(() => {
            fetchPatientNotifications();
            fetchPatientUnreadNotificationsCount();
        })
        .catch(err => console.error(err));
}

function subscribeToPatientNotificationsTopic() {
    if (!stompClient || !stompClient.connected) return;
    const auth = getPatientAuth();
    if (!auth || !auth.userId) return;

    const topic = `/topic/hospital/${currentHospitalId}/user/${auth.userId}/notifications`;
    stompClient.subscribe(topic, (message) => {
        fetchPatientUnreadNotificationsCount();
        const modal = document.getElementById('patientNotificationsModal');
        if (modal && modal.style.display !== 'none') {
            fetchPatientNotifications();
        }
    });
}

// --- Missing Spec Features: Patient Reschedule ---
let patientRescheduleApptId = null;
let patientRescheduleDocId = null;

function openPatientRescheduleModal(apptId, docId, docName) {
    patientRescheduleApptId = apptId;
    patientRescheduleDocId = docId;

    document.getElementById('patReschDocName').textContent = docName;
    const todayStr = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('patReschDateInput');
    dateInput.value = todayStr;
    dateInput.min = todayStr;

    document.getElementById('patientRescheduleModal').style.display = 'flex';
    refreshPatientRescheduleSlots();
}

function closePatientRescheduleModal() {
    document.getElementById('patientRescheduleModal').style.display = 'none';
    patientRescheduleApptId = null;
    patientRescheduleDocId = null;
}

function refreshPatientRescheduleSlots() {
    const date = document.getElementById('patReschDateInput').value;
    const grid = document.getElementById('patReschSlotGrid');
    if (!date || !patientRescheduleDocId) return;

    grid.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem; padding:8px 0;">Loading slots...</p>';

    const doctor = doctorsData.find(d => d.id === patientRescheduleDocId);
    const slots = doctor && doctor.availableSlots ? doctor.availableSlots : ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30"];

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/appointments?doctorId=${patientRescheduleDocId}`)
        .then(r => r.ok ? r.json() : [])
        .then(appts => {
            const booked = new Set(appts
                .filter(a => a.appointmentDate === date && a.status !== 'CANCELLED' && a.id !== patientRescheduleApptId)
                .map(a => a.timeSlot)
            );

            let firstActive = false;
            grid.innerHTML = slots.map(s => {
                const [hh, mm] = s.split(':');
                const h = parseInt(hh, 10);
                const period = h < 12 ? 'AM' : 'PM';
                const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
                const dStr = `${String(dh).padStart(2, '0')}:${mm} ${period}`;

                const isBooked = booked.has(s);
                if (isBooked) {
                    return `<button class="slot-btn booked" disabled>${dStr}</button>`;
                } else {
                    const activeClass = !firstActive ? 'active' : '';
                    firstActive = true;
                    return `<button class="slot-btn ${activeClass}" data-slot="${s}" onclick="selectPatientReschSlot(this)">${dStr}</button>`;
                }
            }).join('');
        })
        .catch(err => {
            console.error(err);
            grid.innerHTML = slots.map((s, idx) => `<button class="slot-btn ${idx === 0 ? 'active' : ''}" data-slot="${s}" onclick="selectPatientReschSlot(this)">${s}</button>`).join('');
        });
}

function selectPatientReschSlot(btn) {
    document.querySelectorAll('#patReschSlotGrid .slot-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function confirmPatientReschedule() {
    if (!patientRescheduleApptId) return;
    const date = document.getElementById('patReschDateInput').value;
    const activeBtn = document.querySelector('#patReschSlotGrid .slot-btn.active');
    if (!activeBtn) {
        alert('Please select a time slot.');
        return;
    }
    const slot = activeBtn.getAttribute('data-slot');

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/appointments/${patientRescheduleApptId}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentDate: date, timeSlot: slot })
    })
    .then(res => {
        if (!res.ok) return res.text().then(t => { throw new Error(t || 'Reschedule failed'); });
        return res.json();
    })
    .then(saved => {
        alert('Rescheduled successfully!');
        closePatientRescheduleModal();
        fetchAppointmentHistory();
        fetchPatientAppointments(); // refresh active ticket card
    })
    .catch(err => alert(err.message || 'Error rescheduling'));
}

// --- Missing Spec Features: Patient Forgot / Reset Password ---
function openPatientForgotModal(e) {
    if (e) e.preventDefault();
    document.getElementById('patientForgotModal').style.display = 'flex';
}

function closePatientForgotModal() {
    document.getElementById('patientForgotModal').style.display = 'none';
}

function openPatientResetModal(token) {
    document.getElementById('patResetToken').value = token;
    document.getElementById('patientResetModal').style.display = 'flex';
}

function closePatientResetModal() {
    document.getElementById('patientResetModal').style.display = 'none';
}

async function submitPatientForgotPassword() {
    const email = document.getElementById('patForgotEmail').value.trim();
    if (!email) return;
    try {
        const res = await fetch(`${API_BASE}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        if (res.ok) {
            const data = await res.json();
            closePatientForgotModal();
            const token = data.resetToken || data.token || '';
            if (token) {
                alert(`Verification code generated: ${token}\n\nAuto-filling code to reset password.`);
                openPatientResetModal(token);
            } else {
                alert(data.message || 'Verification code sent to your email. Please enter it on the next screen.');
                openPatientResetModal('');
            }
        } else {
            alert(await res.text());
        }
    } catch (err) {
        alert('Connection error');
    }
}

async function submitPatientResetPassword() {
    const token = document.getElementById('patResetToken').value;
    const password = document.getElementById('patResetNewPassword').value;
    if (!password) return;
    try {
        const res = await fetch(`${API_BASE}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password })
        });
        if (res.ok) {
            closePatientResetModal();
            alert('Password reset successfully! Please sign in.');
        } else {
            alert(await res.text());
        }
    } catch (err) {
        alert('Connection error');
    }
}

// Check for token on load
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
        openPatientResetModal(token);
    }
});

// Patient In-App Change Password Logic
function openPatientChangePasswordModal() {
    document.getElementById('patientCurrentPass').value = '';
    document.getElementById('patientNewPass').value = '';
    document.getElementById('patientConfirmPass').value = '';
    const modal = document.getElementById('patientChangePasswordModal');
    if (modal) modal.style.display = 'flex';
}

function closePatientChangePasswordModal() {
    const modal = document.getElementById('patientChangePasswordModal');
    if (modal) modal.style.display = 'none';
}

async function submitPatientChangePassword() {
    const currentPassword = document.getElementById('patientCurrentPass').value.trim();
    const newPassword = document.getElementById('patientNewPass').value.trim();
    const confirmPassword = document.getElementById('patientConfirmPass').value.trim();

    if (!currentPassword || !newPassword) {
        alert('Please enter both current and new password.');
        return;
    }

    if (newPassword.length < 6) {
        alert('New password must be at least 6 characters long.');
        return;
    }

    if (newPassword !== confirmPassword) {
        alert('New password and confirmation do not match.');
        return;
    }

    try {
        const res = await authFetch('/auth/change-password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        if (res.ok) {
            closePatientChangePasswordModal();
            alert('🎉 Password changed successfully!');
        } else {
            const err = await res.text();
            alert(err || 'Failed to change password. Please check your current password.');
        }
    } catch (e) {
        console.error('Error changing password:', e);
        alert('Network error. Please try again.');
    }
}


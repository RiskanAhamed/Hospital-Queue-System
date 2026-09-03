// Global App State
const API_BASE = 'https://hospital-queue-system-production.up.railway.app/api/v1';
let currentHospitalId = 'HOSP001_ID'; // Will be overridden from JWT auth
let currentDoctorId = '';
let stompClient = null;
let queueStompSubscription = null;
let doctorsStompSubscription = null;

let queueData = [];
let doctorsData = [];
let departmentsData = [];
let currentSubscriptionPlan = 'PRO';

function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
    // ── Bootstrap from auth token ──
    const auth = window._auth || getAuth();
    if (auth) {
        // Set hospital context from logged-in user
        currentHospitalId = auth.hospitalId || 'HOSP001_ID';

        // Populate sidebar brand
        document.getElementById('currentHospitalBadge').textContent = auth.hospitalName || currentHospitalId;

        // Subscription badge
        const subPlanEl = document.getElementById('subPlanText');
        if (subPlanEl) {
            subPlanEl.textContent  = auth.label  || '★ Pro Plan';
            subPlanEl.className    = 'sub-plan ' + (auth.color || 'pro');
        }

        // Settings tab subscription plan display
        const settingsPlanEl = document.getElementById('settingsPlanText');
        if (settingsPlanEl) {
            const planText = (auth.plan || 'PRO').toUpperCase();
            settingsPlanEl.textContent = planText;
            if (planText === 'PRO') {
                settingsPlanEl.style.color = '#38BDF8';
            } else if (planText === 'ENTERPRISE') {
                settingsPlanEl.style.color = '#FBBF24';
            } else {
                settingsPlanEl.style.color = '#94A3B8';
            }
        }

        // Locked hospital name
        const lockedHospEl = document.getElementById('lockedHospitalName');
        if (lockedHospEl) lockedHospEl.textContent = auth.hospitalName || currentHospitalId;

        // User profile
        const avatarEl = document.getElementById('userAvatarEl');
        const nameEl   = document.getElementById('userNameEl');
        const roleEl   = document.getElementById('userRoleEl');
        const chipEl   = document.getElementById('userRoleChip');
        if (avatarEl) avatarEl.textContent = getInitials(auth.name);
        if (nameEl)   nameEl.textContent   = auth.name  || 'User';
        if (roleEl)   roleEl.textContent   = getRoleLabel(auth.role);
        if (chipEl)   chipEl.textContent   = auth.role  || 'STAFF';

        // ── Strict Role-Based UI Filtering ──
        const isAdmin = auth.role === 'HOSPITAL_ADMIN' || auth.role === 'SUPER_ADMIN';
        const isSuperAdmin = auth.role === 'SUPER_ADMIN';

        // Settings tab: Only Admin & Super Admin
        const settingsTab = document.getElementById('navSettingsTab');
        if (settingsTab) settingsTab.style.display = isAdmin ? 'flex' : 'none';

        // Operational Reports tab: Only Admin & Super Admin
        const reportsTab = document.getElementById('navReportsTab');
        if (reportsTab) reportsTab.style.display = isAdmin ? 'flex' : 'none';

        // Audit Log tab: Only Admin & Super Admin
        const auditTab = document.getElementById('navAuditTab');
        if (auditTab) auditTab.style.display = isAdmin ? 'flex' : 'none';

        // Multi-Tenant tab & Switcher: Super Admin ONLY
        const hospitalsTab = document.getElementById('navHospitalsTab');
        const superAdminBox = document.getElementById('superAdminTenantBox');
        const hospLockBox = document.getElementById('hospitalLockBox');

        if (hospitalsTab) hospitalsTab.style.display = isSuperAdmin ? 'flex' : 'none';
        if (superAdminBox) superAdminBox.style.display = isSuperAdmin ? 'block' : 'none';
        if (hospLockBox) hospLockBox.style.display = isSuperAdmin ? 'none' : 'flex';

        // Sidebar Upgrade Button: Only Admins can upgrade plan
        const upgradeBtn = document.getElementById('btnSidebarUpgrade');
        if (upgradeBtn) upgradeBtn.style.display = isAdmin ? 'inline-block' : 'none';

        // Action Buttons: Only Admins can onboard doctors, staff, or departments
        const addDoctorBtn = document.getElementById('btnAddDoctorBtn');
        const addStaffBtn = document.getElementById('btnAddStaffBtn');
        const addDeptBtn = document.getElementById('btnAddDepartmentBtn');

        if (addDoctorBtn) addDoctorBtn.style.display = isAdmin ? 'inline-flex' : 'none';
        if (addStaffBtn) addStaffBtn.style.display = isAdmin ? 'inline-flex' : 'none';
        if (addDeptBtn) addDeptBtn.style.display = isAdmin ? 'inline-flex' : 'none';

        if (isSuperAdmin) {
            fetchSuperAdminHospitalsList();
        }
    }

    const dateEl = document.getElementById('currentDateText');
    if (dateEl) {
        const now = new Date();
        const options = { month: 'short', day: 'numeric', year: 'numeric' };
        dateEl.textContent = `Today, ${now.toLocaleDateString('en-US', options)}`;
    }

    initChart();
    fetchHospitalDetails();
    fetchDoctorsList();
    fetchDepartmentsList();
    fetchMasterAppointments();
    connectWebSocket();
    fetchDashboardStats();
});

// Fetch hospital record & dynamic subscription plan
function fetchHospitalDetails() {
    if (!currentHospitalId) return;
    authFetch(`${API_BASE}/hospitals/${currentHospitalId}`)
        .then(r => r.ok ? r.json() : null)
        .then(hospital => {
            if (!hospital) return;
            const subPlanEl = document.getElementById('subPlanText');
            if (subPlanEl && hospital.subscriptionPlan) {
                const subInfo = formatSubscriptionPlan(hospital.subscriptionPlan);
                subPlanEl.textContent = subInfo.label;
                subPlanEl.className = subInfo.className;
            }
            if (hospital.name) {
                const brandBadge = document.getElementById('currentHospitalBadge');
                if (brandBadge) brandBadge.textContent = hospital.name;
                const lockedHosp = document.getElementById('lockedHospitalName');
                if (lockedHosp) lockedHosp.textContent = hospital.name;
            }

            // Populate Settings tab fields dynamically (BUG 33 FIX: include address, phone, email)
            const nameInput = document.getElementById('settingsHospitalName');
            if (nameInput) nameInput.value = hospital.name || '';
            const codeInput = document.getElementById('settingsTenantCode');
            if (codeInput) codeInput.value = hospital.code || currentHospitalId;
            const addrInput = document.getElementById('settingsAddress');
            if (addrInput) addrInput.value = hospital.address || '';
            const phoneInput = document.getElementById('settingsPhone');
            if (phoneInput) phoneInput.value = hospital.phone || '';
            const emailInput = document.getElementById('settingsEmail');
            if (emailInput) emailInput.value = hospital.email || '';
            const queueAlgoSelect = document.getElementById('queueAlgorithmSelect');
            if (queueAlgoSelect) queueAlgoSelect.value = hospital.queueAlgorithm || 'FIFO';

            // Populate SaaS Subscription Level info on Settings tab
            const plan = (hospital.subscriptionPlan || 'BASIC').toUpperCase();
            currentSubscriptionPlan = plan;
            const settingsPlanEl = document.getElementById('settingsPlanText');
            if (settingsPlanEl) {
                settingsPlanEl.textContent = plan;
                if (plan === 'PRO') {
                    settingsPlanEl.style.color = '#38BDF8';
                } else if (plan === 'ENTERPRISE') {
                    settingsPlanEl.style.color = '#FBBF24';
                } else {
                    settingsPlanEl.style.color = '#94A3B8';
                }
            }

            // Update Subscription Card & Quota Limits
            updateSubscriptionTierUI(currentSubscriptionPlan);

            if (window.lucide) lucide.createIcons();
        })
        .catch(err => {
            console.error('Error fetching hospital subscription plan details:', err);
        });
}

function updateSubscriptionTierUI(plan) {
    const badgeEl = document.getElementById('settingsPlanBadgeLg');
    if (badgeEl) {
        if (plan === 'PRO') {
            badgeEl.textContent = '★ PRO PLAN ($99/mo)';
            badgeEl.className = 'sub-plan-badge-lg pro';
        } else if (plan === 'ENTERPRISE') {
            badgeEl.textContent = '◆ ENTERPRISE PLAN ($299/mo)';
            badgeEl.className = 'sub-plan-badge-lg enterprise';
        } else {
            badgeEl.textContent = '✦ BASIC PLAN (FREE / $0)';
            badgeEl.className = 'sub-plan-badge-lg basic';
        }
    }

    // Doctor Quotas: Basic = 2, Pro = 10, Enterprise = Unlimited
    const currentDocs = doctorsData.length || 0;
    const docTextEl = document.getElementById('quotaDoctorText');
    const docBarEl = document.getElementById('quotaDoctorBar');
    if (docTextEl && docBarEl) {
        if (plan === 'ENTERPRISE') {
            docTextEl.textContent = `${currentDocs} Active (Unlimited)`;
            docBarEl.style.width = '25%';
            docBarEl.className = 'quota-bar-fill';
        } else {
            const maxDocs = plan === 'PRO' ? 10 : 2;
            const pct = Math.min(100, Math.round((currentDocs / maxDocs) * 100));
            docTextEl.textContent = `${currentDocs} / ${maxDocs} (${pct}%)`;
            docBarEl.style.width = `${pct}%`;
            docBarEl.className = `quota-bar-fill ${pct >= 100 ? 'danger' : pct >= 75 ? 'warning' : ''}`;
        }
    }

    // Department Quotas: Basic = 1, Pro = 5, Enterprise = Unlimited
    const currentDepts = departmentsData.length || 0;
    const deptTextEl = document.getElementById('quotaDeptText');
    const deptBarEl = document.getElementById('quotaDeptBar');
    if (deptTextEl && deptBarEl) {
        if (plan === 'ENTERPRISE') {
            deptTextEl.textContent = `${currentDepts} Active (Unlimited)`;
            deptBarEl.style.width = '25%';
            deptBarEl.className = 'quota-bar-fill';
        } else {
            const maxDepts = plan === 'PRO' ? 5 : 1;
            const pct = Math.min(100, Math.round((currentDepts / maxDepts) * 100));
            deptTextEl.textContent = `${currentDepts} / ${maxDepts} (${pct}%)`;
            deptBarEl.style.width = `${pct}%`;
            deptBarEl.className = `quota-bar-fill ${pct >= 100 ? 'danger' : pct >= 75 ? 'warning' : ''}`;
        }
    }
}

// Subscription Plan Modal Handlers
function openUpgradePlanModal() {
    const modal = document.getElementById('modalUpgradePlan');
    if (!modal) return;

    // Fetch latest hospital plan to highlight current card
    authFetch(`${API_BASE}/hospitals/${currentHospitalId}`)
        .then(r => r.ok ? r.json() : null)
        .then(hosp => {
            const currentPlan = hosp ? (hosp.subscriptionPlan || 'BASIC').toUpperCase() : 'BASIC';
            
            const btnBasic = document.getElementById('btnSelectPlanBasic');
            const btnPro = document.getElementById('btnSelectPlanPro');
            const btnEnt = document.getElementById('btnSelectPlanEnterprise');

            if (btnBasic) {
                btnBasic.textContent = currentPlan === 'BASIC' ? '✓ Current Active Plan' : 'Switch to Basic';
                btnBasic.disabled = currentPlan === 'BASIC';
            }
            if (btnPro) {
                btnPro.textContent = currentPlan === 'PRO' ? '✓ Current Active Plan' : (currentPlan === 'ENTERPRISE' ? 'Downgrade to Pro' : 'Upgrade to Pro');
                btnPro.disabled = currentPlan === 'PRO';
            }
            if (btnEnt) {
                btnEnt.textContent = currentPlan === 'ENTERPRISE' ? '✓ Current Active Plan' : 'Upgrade to Enterprise';
                btnEnt.disabled = currentPlan === 'ENTERPRISE';
            }

            modal.classList.add('active');
            if (window.lucide) lucide.createIcons();
        })
        .catch(() => {
            modal.classList.add('active');
        });
}

function closeUpgradePlanModal() {
    const modal = document.getElementById('modalUpgradePlan');
    if (modal) modal.classList.remove('active');
}

function applyPlanChange(newPlan) {
    if (!confirm(`Are you sure you want to change your hospital subscription plan to ${newPlan}?`)) {
        return;
    }

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/subscription`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionPlan: newPlan })
    })
    .then(async r => {
        if (!r.ok) {
            const errText = await r.text();
            throw new Error(errText || 'Failed to update subscription plan');
        }
        return r.json();
    })
    .then(savedHospital => {
        closeUpgradePlanModal();
        alert(`🎉 Subscription plan updated to ${newPlan} successfully!`);
        fetchHospitalDetails();
    })
    .catch(err => {
        console.error('Error changing subscription plan:', err);
        alert(err.message || 'Error updating subscription plan.');
    });
}

function saveHospitalSettings(event) {
    if (event) event.preventDefault();
    const nameInput = document.getElementById('settingsHospitalName');
    const newName = nameInput ? nameInput.value.trim() : '';

    if (!newName) {
        alert('Hospital Name cannot be empty.');
        return;
    }

    // BUG 33 FIX: collect address, phone, email and send together with name
    const address = (document.getElementById('settingsAddress')?.value || '').trim();
    const phone = (document.getElementById('settingsPhone')?.value || '').trim();
    const email = (document.getElementById('settingsEmail')?.value || '').trim();
    const queueAlgorithm = (document.getElementById('queueAlgorithmSelect')?.value || 'FIFO').trim();

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, address, phone, email, queueAlgorithm })
    })
    .then(r => {
        if (!r.ok) {
            return r.text().then(text => { throw new Error(text || 'Failed to update hospital settings'); });
        }
        return r.json();
    })
    .then(updatedHospital => {
        alert('Hospital settings saved successfully!');
        if (updatedHospital.name) {
            const brandBadge = document.getElementById('currentHospitalBadge');
            if (brandBadge) brandBadge.textContent = updatedHospital.name;
            const lockedHosp = document.getElementById('lockedHospitalName');
            if (lockedHosp) lockedHosp.textContent = updatedHospital.name;
        }
        if (updatedHospital.queueAlgorithm) {
            const queueAlgoSelect = document.getElementById('queueAlgorithmSelect');
            if (queueAlgoSelect) queueAlgoSelect.value = updatedHospital.queueAlgorithm;
        }
    })
    .catch(err => {
        console.error('Error saving hospital settings:', err);
        alert(err.message || 'Error updating hospital settings.');
    });
}

// Live Search Handler
function handleSearch(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
        renderQueueTable();
        return;
    }

    const tbody = document.getElementById('queueTableBody');
    if (tbody) {
        const filteredQueue = queueData.filter(item => 
            (item.patientName || '').toLowerCase().includes(q) ||
            (item.queueNumber || '').toLowerCase().includes(q) ||
            (item.status || '').toLowerCase().includes(q)
        );

        if (filteredQueue.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">No matching queue entries found for "${escapeHtml(query)}".</td></tr>`;
        } else {
            tbody.innerHTML = filteredQueue.map(item => {
                const statusClass = (item.status || '').toLowerCase().replace('_', '-');
                let actionBtnHTML = '';
                if (item.status === 'WAITING') {
                    actionBtnHTML = `<button class="btn btn-sm btn-secondary" onclick="executeQueueAction('CALL_NEXT')">Call</button>`;
                } else if (item.status === 'CALLED') {
                    actionBtnHTML = `<button class="btn btn-sm btn-primary" onclick="executeQueueAction('START_CONSULTATION', '${item.id}')">Start</button>`;
                } else if (item.status === 'IN_CONSULTATION') {
                    actionBtnHTML = `<button class="btn btn-sm btn-secondary" onclick="executeQueueAction('COMPLETE', '${item.id}')">Complete</button> <button class="btn btn-sm btn-warning" onclick="executeQueueAction('SKIP', '${item.id}')">Skip</button>`;
                } else if (item.status === 'COMPLETED') {
                    actionBtnHTML = `<span style="color:var(--success); font-size:0.8rem; font-weight:600;">✓ Completed</span>`;
                } else if (item.status === 'SKIPPED') {
                    actionBtnHTML = `<span style="color:var(--warning); font-size:0.8rem; font-weight:600;">⏩ Skipped</span>`;
                }
                return `
                    <tr>
                        <td>#${item.sequenceNumber}</td>
                        <td><strong style="color:var(--primary); font-size:1.1rem;">${escapeHtml(item.queueNumber)}</strong></td>
                        <td><strong>${escapeHtml(item.patientName)}</strong></td>
                        <td>${escapeHtml(item.scheduledTime || '09:00 AM')}</td>
                        <td><span class="status-badge status-${statusClass}">${escapeHtml(item.status)}</span></td>
                        <td>${actionBtnHTML}</td>
                    </tr>
                `;
            }).join('');
        }
    }
}


// Tab Switching
function switchTab(tabId) {
    const auth = window._auth || getAuth();
    const role = auth ? auth.role : 'STAFF';
    const isAdmin = role === 'HOSPITAL_ADMIN' || role === 'SUPER_ADMIN';
    const isSuperAdmin = role === 'SUPER_ADMIN';

    // Role-based navigation guard
    if (['settings', 'reports', 'audit'].includes(tabId) && !isAdmin) {
        alert('Access denied: Admin role required for this tab.');
        return;
    }
    if (tabId === 'hospitals' && !isSuperAdmin) {
        alert('Access denied: Super Admin role required for this tab.');
        return;
    }

    document.querySelectorAll('.tab-page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    const targetPage = document.getElementById(`tab-${tabId}`);
    if (targetPage) targetPage.classList.add('active');

    const clickedBtn = Array.from(document.querySelectorAll('.nav-item')).find(b => b.getAttribute('onclick')?.includes(tabId));
    if (clickedBtn) clickedBtn.classList.add('active');

    if (tabId === 'settings') {
        fetchHospitalDetails();
    } else if (tabId === 'departments') {
        fetchDepartmentsList();
    } else if (tabId === 'reports') {
        fetchReports();
    } else if (tabId === 'audit') {
        fetchAuditLogs();
    } else if (tabId === 'hospitals') {
        fetchSuperAdminHospitalsList();
    }
}

// ── Super Admin Multi-Tenant Management ──
let allHospitalsData = [];

function fetchSuperAdminHospitalsList() {
    authFetch(`${API_BASE}/hospitals/public/list`)
        .then(r => r.ok ? r.json() : [])
        .then(hospitals => {
            allHospitalsData = hospitals || [];
            
            // Populate sidebar Super Admin switcher
            const selectEl = document.getElementById('superAdminHospitalSelect');
            if (selectEl) {
                selectEl.innerHTML = allHospitalsData.map(h => `
                    <option value="${h.id || h.code}" ${h.id === currentHospitalId || h.code === currentHospitalId ? 'selected' : ''}>
                        🏥 ${escapeHtml(h.name)} (${escapeHtml(h.code)})
                    </option>
                `).join('');
            }

            // Populate Super Admin directory table
            const tbody = document.getElementById('superAdminHospitalsTableBody');
            if (tbody) {
                if (allHospitalsData.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:20px;">No hospital tenants registered yet.</td></tr>`;
                    return;
                }
                tbody.innerHTML = allHospitalsData.map(h => {
                    const isCurrent = h.id === currentHospitalId || h.code === currentHospitalId;
                    const plan = (h.subscriptionPlan || 'BASIC').toUpperCase();
                    const planBadgeClass = plan === 'PRO' ? 'pro' : plan === 'ENTERPRISE' ? 'enterprise' : 'basic';
                    return `
                        <tr>
                            <td><strong style="color:var(--primary); font-family:monospace;">${escapeHtml(h.code)}</strong></td>
                            <td><strong>${escapeHtml(h.name)}</strong></td>
                            <td><span class="sub-plan-badge-lg ${planBadgeClass}" style="font-size:0.7rem; padding:3px 8px;">${plan}</span></td>
                            <td>${escapeHtml(h.phone || '—')}</td>
                            <td>${escapeHtml(h.email || '—')}</td>
                            <td><span class="status-badge status-available">Active</span></td>
                            <td>
                                ${isCurrent ? 
                                    `<span style="color:#34D399; font-size:0.8rem; font-weight:700;">✓ Active Context</span>` :
                                    `<button class="btn btn-sm btn-secondary" onclick="onSuperAdminHospitalChange('${h.id || h.code}')" style="font-size:0.75rem; padding:4px 8px;">Switch Context</button>`
                                }
                            </td>
                        </tr>
                    `;
                }).join('');
            }

            if (window.lucide) lucide.createIcons();
        })
        .catch(err => {
            console.error('Error fetching all hospitals list:', err);
        });
}

function onSuperAdminHospitalChange(selectedHospitalId) {
    if (!selectedHospitalId || selectedHospitalId === currentHospitalId) return;

    currentHospitalId = selectedHospitalId;
    currentDoctorId = '';

    // Re-fetch all data under the selected hospital context
    fetchHospitalDetails();
    fetchDoctorsList();
    fetchDepartmentsList();
    fetchMasterAppointments();
    fetchDashboardStats();
    if (stompClient && stompClient.connected) {
        connectWebSocket();
    }
    fetchSuperAdminHospitalsList();
}

function openAddHospitalModal() {
    const modal = document.getElementById('modalAddHospital');
    if (modal) modal.classList.add('active');
}

function closeAddHospitalModal() {
    const modal = document.getElementById('modalAddHospital');
    if (modal) modal.classList.remove('active');
}

function submitAddHospital(event) {
    if (event) event.preventDefault();
    const name = document.getElementById('newHospName').value.trim();
    const code = document.getElementById('newHospCode').value.trim().toUpperCase();
    const subscriptionPlan = document.getElementById('newHospPlan').value;
    const address = document.getElementById('newHospAddress').value.trim();
    const phone = document.getElementById('newHospPhone').value.trim();
    const email = document.getElementById('newHospEmail').value.trim();
    const adminName = document.getElementById('newHospAdminName')?.value.trim();
    const adminEmail = document.getElementById('newHospAdminEmail')?.value.trim();
    const adminPassword = document.getElementById('newHospAdminPassword')?.value.trim();

    if (!name || !code) {
        alert('Hospital Name and Code are required.');
        return;
    }
    if (!adminEmail || !adminPassword) {
        alert('Initial Hospital Admin Email and Password are required.');
        return;
    }

    authFetch(`${API_BASE}/hospitals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code, subscriptionPlan, address, phone, email, adminName, adminEmail, adminPassword })
    })
    .then(async r => {
        if (!r.ok) {
            const errText = await r.text();
            throw new Error(errText || 'Failed to create hospital tenant');
        }
        return r.json();
    })
    .then(newHospital => {
        closeAddHospitalModal();
        alert(`🎉 Successfully registered new hospital tenant: ${newHospital.name} (${newHospital.code})!\n\n👨‍💼 Initial Admin Account Created:\nEmail: ${adminEmail}\nPassword: ${adminPassword}`);
        document.getElementById('newHospName').value = '';
        document.getElementById('newHospCode').value = '';
        document.getElementById('newHospAddress').value = '';
        document.getElementById('newHospPhone').value = '';
        document.getElementById('newHospEmail').value = '';
        if (document.getElementById('newHospAdminName')) document.getElementById('newHospAdminName').value = '';
        if (document.getElementById('newHospAdminEmail')) document.getElementById('newHospAdminEmail').value = '';
        if (document.getElementById('newHospAdminPassword')) document.getElementById('newHospAdminPassword').value = '';
        
        onSuperAdminHospitalChange(newHospital.id || newHospital.code);
    })
    .catch(err => {
        console.error('Error creating hospital tenant:', err);
        alert(err.message || 'Error creating hospital tenant.');
    });
}

// Fetch dashboard stats from API
function fetchDashboardStats() {
    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/dashboard/stats`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (!data) return;

            const total = data.totalAppointmentsToday !== undefined ? data.totalAppointmentsToday : (data.totalAppointments || 0);
            const waiting = data.waitingCount !== undefined ? data.waitingCount : (data.activeQueuePatients || 0);
            const completed = data.completedCount !== undefined ? data.completedCount : (data.completedAppointments || 0);
            const avgWait = data.avgWaitMinutes !== undefined ? data.avgWaitMinutes : 0;
            const peakHours = data.peakHours || 'Not enough data';

            const totalEl = document.getElementById('statTotalAppts');
            if (totalEl) totalEl.textContent = total;

            const waitingEl = document.getElementById('statWaiting');
            if (waitingEl) waitingEl.textContent = waiting;

            const completedEl = document.getElementById('statCompleted');
            if (completedEl) completedEl.textContent = completed;

            const avgWaitEl = document.getElementById('statAvgWait');
            if (avgWaitEl) avgWaitEl.textContent = avgWait;

            const peakHoursEl = document.getElementById('statPeakHours');
            if (peakHoursEl) peakHoursEl.textContent = peakHours;

            const rateEl = document.getElementById('statCompletionRate');
            if (rateEl) {
                const rate = total > 0 ? Math.round((completed / total) * 100) : (completed > 0 ? 100 : 0);
                rateEl.textContent = `${rate}%`;
            }

            if (data.hourlyDistribution) {
                updateThroughputChart(data.hourlyDistribution);
            }
        })
        .catch(err => {
            console.error('Error fetching dashboard stats:', err);
        });
}

// Fetch Doctors list and populate room dropdown
function fetchDoctorsList() {
    return authFetch(`${API_BASE}/hospitals/${currentHospitalId}/doctors`)
        .then(r => r.ok ? r.json() : [])
        .then(doctors => {
            doctorsData = doctors || [];
            populateDoctorDropdown();
            renderDoctorRooms();
            renderDoctorsGrid();
            renderDepartments();
            updateSubscriptionTierUI(currentSubscriptionPlan);

            if (doctorsData.length > 0) {
                // If currentDoctorId is not set or not in list, pick first doctor
                if (!currentDoctorId || !doctorsData.some(d => d.id === currentDoctorId)) {
                    currentDoctorId = doctorsData[0].id;
                }
                const selectEl = document.getElementById('queueDoctorSelect');
                if (selectEl) selectEl.value = currentDoctorId;
                
                fetchQueueForCurrentDoctor();
                subscribeToDoctorQueueTopic();
            } else {
                const selectEl = document.getElementById('queueDoctorSelect');
                if (selectEl) selectEl.innerHTML = '<option value="">No Doctors Found</option>';
            }
        })
        .catch(err => {
            console.error('Error fetching doctors list:', err);
        });
}

function populateDoctorDropdown() {
    const selectEl = document.getElementById('queueDoctorSelect');
    if (!selectEl) return;

    if (doctorsData.length === 0) {
        selectEl.innerHTML = '<option value="">No doctors available</option>';
        return;
    }

    selectEl.innerHTML = doctorsData.map(doc => {
        const roomInfo = doc.roomNumber ? ` - ${escapeHtml(doc.roomNumber)}` : '';
        const deptInfo = doc.departmentName ? ` (${escapeHtml(doc.departmentName)}${roomInfo})` : '';
        return `<option value="${escapeHtml(doc.id)}">${escapeHtml(doc.name)}${deptInfo}</option>`;
    }).join('');
}

function loadQueueForSelectedDoctor() {
    const selectEl = document.getElementById('queueDoctorSelect');
    if (selectEl && selectEl.value) {
        currentDoctorId = selectEl.value;
        fetchQueueForCurrentDoctor();
        subscribeToDoctorQueueTopic();
    }
}

function fetchQueueForCurrentDoctor() {
    if (!currentDoctorId) return;
    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/queues/doctor/${currentDoctorId}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (data) {
                handleLiveQueueUpdate(data);
            }
        })
        .catch(err => console.error('Error fetching queue state:', err));
}

// WebSocket STOMP Connection
function connectWebSocket() {
    try {
        const auth = getAuth();
        const headers = auth && auth.token ? { 'Authorization': 'Bearer ' + auth.token } : {};
        const socket = new SockJS('https://hospital-queue-system-production.up.railway.app/ws-queue');
        stompClient = Stomp.over(socket);
        stompClient.debug = null; // Quiet console

        stompClient.connect(headers, (frame) => {
            document.getElementById('wsStatus').className = 'ws-status connected';
            document.getElementById('wsStatusText').textContent = 'WebSocket Live Synchronized';

            subscribeToDoctorQueueTopic();
            subscribeToNotificationsTopic();
            subscribeToDoctorsTopic();
            fetchUnreadNotificationsCount();
        }, (error) => {
            console.log('WS Connection error', error);
            document.getElementById('wsStatus').className = 'ws-status disconnected';
            document.getElementById('wsStatusText').textContent = 'WebSocket Disconnected';
        });
    } catch (e) {
        console.log('WebSocket SockJS initialization error', e);
    }
}

function subscribeToDoctorQueueTopic() {
    if (!stompClient || !stompClient.connected || !currentDoctorId) return;

    if (queueStompSubscription) {
        queueStompSubscription.unsubscribe();
        queueStompSubscription = null;
    }

    const topic = `/topic/hospital/${currentHospitalId}/queue/${currentDoctorId}`;
    queueStompSubscription = stompClient.subscribe(topic, (message) => {
        const updatedSummary = JSON.parse(message.body);
        handleLiveQueueUpdate(updatedSummary);
    });
}

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
            handleLiveDoctorUpdate(updatedDoctor);
        } catch (e) {
            console.error('Error parsing live doctor update:', e);
        }
    });
}

function handleLiveDoctorUpdate(updatedDoctor) {
    if (!updatedDoctor || !updatedDoctor.id) return;

    const idx = doctorsData.findIndex(d => d.id === updatedDoctor.id);
    if (idx >= 0) {
        doctorsData[idx] = { ...doctorsData[idx], ...updatedDoctor };
    } else {
        doctorsData.push(updatedDoctor);
    }

    // Refresh Doctor Dropdown in Queue Control Desk, Doctor Cards in Doctors & Schedules, and Department lists
    populateDoctorDropdown();
    renderDoctorRooms();
    renderDoctorsGrid();
    renderDepartments();

    // Preserve selection in dropdown
    const selectEl = document.getElementById('queueDoctorSelect');
    if (selectEl && currentDoctorId && doctorsData.some(d => d.id === currentDoctorId)) {
        selectEl.value = currentDoctorId;
    } else if (doctorsData.length > 0) {
        currentDoctorId = doctorsData[0].id;
        if (selectEl) selectEl.value = currentDoctorId;
        fetchQueueForCurrentDoctor();
        subscribeToDoctorQueueTopic();
    }
}

// Live Queue Update Handler
function handleLiveQueueUpdate(summary) {
    if (!summary) return;

    const tokenEl = document.getElementById('callerTokenDisplay');
    const patientEl = document.getElementById('callerPatientName');
    const statusEl = document.getElementById('callerStatusPill');
    const roomEl = document.getElementById('callerRoomPill');
    const headerEl = document.getElementById('queueDoctorHeader');

    if (tokenEl) tokenEl.textContent = summary.currentlyServingToken || '--';
    if (patientEl) patientEl.textContent = summary.currentlyServingPatient || 'None';
    if (statusEl) statusEl.textContent = summary.currentlyServingStatus || 'IDLE';

    const activeDoc = doctorsData.find(d => d.id === currentDoctorId);
    if (activeDoc) {
        if (roomEl) roomEl.textContent = activeDoc.roomNumber || 'Room --';
        if (headerEl) headerEl.textContent = `Today's Queue List for ${activeDoc.name}`;
    }

    queueData = summary.entries || [];
    renderQueueTable();

    const waitingCount = summary.waitingCount !== undefined 
        ? summary.waitingCount 
        : queueData.filter(q => q.status === 'WAITING').length;

    const liveWaitingBadge = document.getElementById('liveWaitingBadge');
    const statWaiting = document.getElementById('statWaiting');
    const queueTotalCount = document.getElementById('queueTotalCount');

    if (liveWaitingBadge) liveWaitingBadge.textContent = `${waitingCount} Waiting`;
    if (statWaiting) statWaiting.textContent = waitingCount;
    if (queueTotalCount) queueTotalCount.textContent = `${queueData.length} Patients`;
}

// Queue Actions (Call Next, Start, Complete, Skip)
function executeQueueAction(action, targetQueueId = null) {
    if (!currentDoctorId) {
        console.error('No doctor selected for queue action.');
        return;
    }

    let queueId = targetQueueId;
    if (!queueId) {
        const activeEntry = queueData.find(q => {
            const st = (q.status || '').toUpperCase();
            return st === 'CALLED' || st === 'IN_CONSULTATION';
        });
        queueId = activeEntry ? activeEntry.id : null;
    }

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/queues/action`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            hospitalId: currentHospitalId,
            doctorId: currentDoctorId,
            action: action,
            queueId: queueId
        })
    })
    .then(res => {
        if (!res.ok) {
            throw new Error(`Server returned HTTP ${res.status}`);
        }
        return res.json();
    })
    .then(() => {
        fetchQueueForCurrentDoctor();
        fetchDashboardStats();
    })
    .catch(err => {
        console.error('Failed to execute queue action on server:', err);
    });
}

function renderQueueTable() {
    const tbody = document.getElementById('queueTableBody');
    if (!tbody) return;

    if (queueData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">No patients in queue for this doctor room.</td></tr>`;
        return;
    }

    tbody.innerHTML = queueData.map(q => {
        const statusClass = (q.status || '').toLowerCase().replace('_', '-');
        let actionBtnHTML = '';

        if (q.status === 'WAITING') {
            actionBtnHTML = `<button class="btn btn-sm btn-secondary" onclick="executeQueueAction('CALL_NEXT')">Call</button>`;
        } else if (q.status === 'CALLED') {
            actionBtnHTML = `<button class="btn btn-sm btn-primary" onclick="executeQueueAction('START_CONSULTATION', '${q.id}')">Start</button>`;
        } else if (q.status === 'IN_CONSULTATION') {
            actionBtnHTML = `<button class="btn btn-sm btn-secondary" onclick="executeQueueAction('COMPLETE', '${q.id}')">Complete</button> <button class="btn btn-sm btn-warning" onclick="executeQueueAction('SKIP', '${q.id}')">Skip</button>`;
        } else if (q.status === 'COMPLETED') {
            actionBtnHTML = `<span style="color:var(--success); font-size:0.8rem; font-weight:600;">✓ Completed</span>`;
        } else if (q.status === 'SKIPPED') {
            actionBtnHTML = `<span style="color:var(--warning); font-size:0.8rem; font-weight:600;">⏩ Skipped</span>`;
        }

        return `
            <tr>
                <td>#${q.sequenceNumber}</td>
                <td><strong style="color:var(--primary); font-size:1.1rem;">${escapeHtml(q.queueNumber)}</strong></td>
                <td><strong>${escapeHtml(q.patientName)}</strong></td>
                <td>${escapeHtml(q.scheduledTime || '09:00 AM')}</td>
                <td><span class="status-badge status-${statusClass}">${escapeHtml(q.status)}</span></td>
                <td>${actionBtnHTML}</td>
            </tr>
        `;
    }).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}


function renderDoctorRooms() {
    const container = document.getElementById('doctorRoomList');
    if (!container) return;

    const badgeEl = document.querySelector('.live-doctor-desk .badge');
    if (badgeEl) {
        const activeCount = doctorsData.filter(d => d.available !== false).length;
        badgeEl.textContent = `${activeCount} Active Doctor${activeCount !== 1 ? 's' : ''}`;
    }

    if (doctorsData.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); padding:12px;">No active doctor rooms.</p>`;
        return;
    }

    container.innerHTML = doctorsData.map(doc => {
        const rating = doc.averageRating || 5.0;
        const reviews = doc.totalRatings || 0;
        return `
            <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); padding:16px; border-radius:12px; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <h4 style="font-weight:700; font-size:0.95rem;">${escapeHtml(doc.name)}</h4>
                            <span style="background:rgba(251,191,36,0.15); color:#FBBF24; padding:1px 6px; border-radius:8px; font-size:0.72rem; font-weight:700;">⭐ ${rating.toFixed(1)}</span>
                        </div>
                        <p style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">${escapeHtml(doc.departmentName || 'General')} &bull; ${escapeHtml(doc.roomNumber || 'Room --')}</p>
                    </div>
                    <span class="status-badge status-${doc.available ? 'called' : 'idle'}">${doc.available ? 'ACTIVE' : 'OFFLINE'}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderDoctorsGrid() {
    const container = document.getElementById('doctorsGrid');
    if (!container) return;

    if (doctorsData.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); grid-column: 1/-1;">No doctors found in backend directory.</p>`;
        return;
    }

    container.innerHTML = doctorsData.map(doc => {
        const rating = doc.averageRating || 5.0;
        const reviews = doc.totalRatings || 0;
        const slotCount = (doc.availableSlots && doc.availableSlots.length) || 0;
        return `
            <div class="card glass doctor-card" style="padding: 20px;">
                <div style="display: flex; gap: 16px; align-items: center; margin-bottom: 16px;">
                    <div class="avatar" style="width: 48px; height: 48px; font-size: 1.1rem; background: rgba(56, 189, 248, 0.15); color: var(--primary);">${getInitials(doc.name)}</div>
                    <div style="flex:1;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <h3 style="font-size: 1.1rem; font-weight: 700;">${escapeHtml(doc.name)}</h3>
                            <span style="background:rgba(251,191,36,0.12); color:#FBBF24; border:1px solid rgba(251,191,36,0.3); padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;">
                                ⭐ ${rating.toFixed(1)} ${reviews > 0 ? `(${reviews} reviews)` : '(New)'}
                            </span>
                        </div>
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top:2px;">${escapeHtml(doc.specialization || doc.departmentName || 'Specialist')} &bull; ${escapeHtml(doc.roomNumber || 'Room --')}</p>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid var(--border-color); flex-wrap: wrap; gap: 8px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="status-badge status-${doc.available ? 'called' : 'idle'}">${doc.available ? '● Available' : '○ On Leave'}</span>
                        <span style="font-size: 0.75rem; color: var(--primary); background: rgba(56,189,248,0.1); padding: 2px 8px; border-radius: 8px; font-weight:600;">⏰ ${slotCount} Slots</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <button class="btn btn-sm btn-secondary" onclick="openDoctorScheduleModal('${doc.id}')"><i data-lucide="clock"></i> Edit Schedule</button>
                        <button class="btn btn-sm ${doc.available ? 'btn-warning' : 'btn-primary'}" onclick="toggleDoctorAvailability('${doc.id}', ${!!doc.available})">${doc.available ? 'Mark Unavailable' : 'Mark Available'}</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// --- Doctor Schedule & Time Slots Management Logic ---
const DEFAULT_SYSTEM_SLOTS = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
    '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'
];
let _currentEditingDoctorSlots = new Set();

function openDoctorScheduleModal(docId) {
    const doc = doctorsData.find(d => d.id === docId);
    if (!doc) return;

    document.getElementById('schedDocId').value = doc.id;
    document.getElementById('schedDocName').textContent = `Schedule for ${doc.name}`;
    document.getElementById('schedRoomNumber').value = doc.roomNumber || 'Room 302';
    document.getElementById('schedMaxPatients').value = doc.maxDailyAppointments || 30;

    const existingSlots = (doc.availableSlots && doc.availableSlots.length > 0)
        ? doc.availableSlots
        : ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00'];

    _currentEditingDoctorSlots = new Set(existingSlots);
    renderScheduleSlotPills();

    const modal = document.getElementById('modalDoctorSchedule');
    if (modal) modal.classList.add('active');
}

function closeDoctorScheduleModal() {
    const modal = document.getElementById('modalDoctorSchedule');
    if (modal) modal.classList.remove('active');
}

function renderScheduleSlotPills() {
    const container = document.getElementById('slotsGridContainer');
    const countEl = document.getElementById('selectedSlotsCount');
    if (!container) return;

    if (countEl) countEl.textContent = _currentEditingDoctorSlots.size;

    // Union of default slots and any custom ones added
    const allSlots = Array.from(new Set([...DEFAULT_SYSTEM_SLOTS, ..._currentEditingDoctorSlots])).sort();

    container.innerHTML = allSlots.map(slot => {
        const isSelected = _currentEditingDoctorSlots.has(slot);
        const [hh, mm] = slot.split(':');
        const h = parseInt(hh, 10);
        const p = h < 12 ? 'AM' : 'PM';
        const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const formatted = `${String(dh).padStart(2, '0')}:${mm} ${p}`;

        return `
            <div onclick="toggleSlotSelection('${slot}')" style="display:flex; align-items:center; justify-content:center; padding:7px 10px; border-radius:8px; font-size:0.78rem; font-weight:700; cursor:pointer; transition:all 0.2s; user-select:none; background:${isSelected ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.04)'}; color:${isSelected ? '#38BDF8' : '#94A3B8'}; border:1px solid ${isSelected ? '#38BDF8' : 'rgba(255,255,255,0.08)'};">
                ${isSelected ? '✓ ' : ''}${formatted}
            </div>
        `;
    }).join('');
}

function toggleSlotSelection(slot) {
    if (_currentEditingDoctorSlots.has(slot)) {
        _currentEditingDoctorSlots.delete(slot);
    } else {
        _currentEditingDoctorSlots.add(slot);
    }
    renderScheduleSlotPills();
}

function applySlotPreset(preset) {
    if (preset === 'morning') {
        _currentEditingDoctorSlots = new Set(['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00']);
    } else if (preset === 'evening') {
        _currentEditingDoctorSlots = new Set(['16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00']);
    } else if (preset === 'fullday') {
        _currentEditingDoctorSlots = new Set(['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30']);
    }
    renderScheduleSlotPills();
}

function clearAllSlots() {
    _currentEditingDoctorSlots.clear();
    renderScheduleSlotPills();
}

function addCustomSlot() {
    const input = document.getElementById('customSlotInput');
    if (!input || !input.value) return;
    _currentEditingDoctorSlots.add(input.value);
    input.value = '';
    renderScheduleSlotPills();
}

function submitDoctorSchedule(event) {
    event.preventDefault();
    const docId = document.getElementById('schedDocId').value;
    const roomNumber = document.getElementById('schedRoomNumber').value.trim();
    const maxDailyAppointments = parseInt(document.getElementById('schedMaxPatients').value, 10) || 30;
    const slots = Array.from(_currentEditingDoctorSlots).sort();

    if (!docId) return;

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/doctors/${docId}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            roomNumber,
            maxDailyAppointments,
            availableSlots: slots
        })
    })
    .then(async r => {
        if (!r.ok) {
            const err = await r.text();
            throw new Error(err || 'Failed to update doctor schedule');
        }
        return r.json();
    })
    .then(updatedDoc => {
        closeDoctorScheduleModal();
        alert(`🎉 Schedule updated successfully for ${updatedDoc.name} with ${slots.length} available slots!`);
        handleLiveDoctorUpdate(updatedDoc);
    })
    .catch(err => {
        console.error('Error updating doctor schedule:', err);
        alert(err.message || 'Error updating doctor schedule.');
    });
}

// BUG 37 FIX: Module-level state for the appointment detail modal
let _currentDetailAppt = null;
const _appointmentsCache = new Map();
const TERMINAL_STATUSES = new Set(['CANCELLED', 'COMPLETED']);

function fetchMasterAppointments() {
    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/appointments`)
        .then(r => r.ok ? r.json() : [])
        .then(appointments => {
            renderMasterAppointments(appointments || []);
        })
        .catch(err => {
            console.error('Error fetching master appointments:', err);
            renderMasterAppointments([]);
        });
}

function renderMasterAppointments(appointments = []) {
    const tbody = document.getElementById('masterAppointmentsBody');
    if (!tbody) return;

    if (appointments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:24px;">No appointments found in database.</td></tr>`;
        _appointmentsCache.clear();
        return;
    }

    // BUG 37 FIX: Cache appointment objects by ID so the View button can look them up
    // without embedding raw JSON in onclick attributes (safe with special chars in names).
    _appointmentsCache.clear();
    appointments.forEach(a => { if (a.id) _appointmentsCache.set(a.id, a); });

    tbody.innerHTML = appointments.map(a => `
        <tr>
            <td>${a.id ? escapeHtml(a.id.slice(-6).toUpperCase()) : '--'}</td>
            <td><strong>${escapeHtml(a.patientName || 'Patient')}</strong></td>
            <td>${escapeHtml(a.departmentName || '--')}</td>
            <td>${escapeHtml(a.doctorName || '--')}</td>
            <td>${escapeHtml(a.appointmentDate || '')} ${escapeHtml(a.timeSlot || '')}</td>
            <td><strong style="color:var(--primary);">${escapeHtml(a.queueNumber || '--')}</strong></td>
            <td><span class="status-badge status-${(a.status || '').toLowerCase()}">${escapeHtml(a.status || 'PENDING')}</span></td>
            <td><button class="btn btn-sm btn-ghost" onclick="openAppointmentDetailModal('${escapeHtml(a.id || '')}')">View</button></td>
        </tr>
    `).join('');
}

function openAppointmentDetailModal(apptId) {
    const appt = _appointmentsCache.get(apptId);
    if (!appt) { console.error('Appointment not found in cache:', apptId); return; }
    _currentDetailAppt = appt;

    // Build a tidy key-value detail panel
    const statusColor = {
        BOOKED: '#38BDF8', CHECKED_IN: '#38BDF8', WAITING: '#FBBF24',
        CALLED: '#C084FC', IN_CONSULTATION: '#34D399', COMPLETED: '#34D399',
        CANCELLED: '#F87171'
    }[appt.status] || 'var(--text-muted)';

    document.getElementById('apptDetailContent').innerHTML = `
        <dl style="display:grid; grid-template-columns:140px 1fr; gap:10px 16px; font-size:0.88rem;">
            <dt style="color:var(--text-muted); font-weight:600;">Appointment ID</dt>
            <dd style="font-family:monospace; color:var(--text-main);">${escapeHtml(appt.id || '--')}</dd>

            <dt style="color:var(--text-muted); font-weight:600;">Patient</dt>
            <dd style="font-weight:700;">${escapeHtml(appt.patientName || '--')}</dd>

            <dt style="color:var(--text-muted); font-weight:600;">Doctor</dt>
            <dd>${escapeHtml(appt.doctorName || '--')}</dd>

            <dt style="color:var(--text-muted); font-weight:600;">Department</dt>
            <dd>${escapeHtml(appt.departmentName || '--')}</dd>

            <dt style="color:var(--text-muted); font-weight:600;">Date &amp; Time</dt>
            <dd>${escapeHtml(appt.appointmentDate || '--')} &nbsp; ${escapeHtml(appt.timeSlot || '--')}</dd>

            <dt style="color:var(--text-muted); font-weight:600;">Queue Token</dt>
            <dd style="font-weight:700; color:var(--primary);">${escapeHtml(appt.queueNumber || '--')}</dd>

            <dt style="color:var(--text-muted); font-weight:600;">Status</dt>
            <dd><span style="font-weight:700; color:${statusColor};">${escapeHtml(appt.status || '--')}</span></dd>
        </dl>`;

    // Show Cancel and Reschedule buttons only for non-terminal statuses
    const cancelBtn = document.getElementById('btnCancelApptDetail');
    if (cancelBtn) {
        cancelBtn.style.display = TERMINAL_STATUSES.has(appt.status) ? 'none' : 'inline-flex';
    }

    const rescheduleBtn = document.getElementById('btnRescheduleApptDetail');
    if (rescheduleBtn) {
        rescheduleBtn.style.display = TERMINAL_STATUSES.has(appt.status) ? 'none' : 'inline-flex';
    }

    document.getElementById('modalViewAppointment').classList.add('active');
}

function closeAppointmentDetailModal() {
    document.getElementById('modalViewAppointment').classList.remove('active');
    _currentDetailAppt = null;
}

function cancelAppointmentFromModal() {
    if (!_currentDetailAppt || !_currentDetailAppt.id) return;
    if (!confirm(`Cancel appointment for ${_currentDetailAppt.patientName || 'this patient'}?`)) return;

    const apptId = _currentDetailAppt.id;
    const cancelBtn = document.getElementById('btnCancelApptDetail');
    if (cancelBtn) { cancelBtn.disabled = true; cancelBtn.textContent = 'Cancelling…'; }

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/appointments/${apptId}/cancel`, {
        method: 'POST'
    })
    .then(r => {
        if (!r.ok) return r.text().then(t => { throw new Error(t || `HTTP ${r.status}`); });
        return r.json();
    })
    .then(() => {
        closeAppointmentDetailModal();
        fetchMasterAppointments();   // refresh the table
        fetchDashboardStats();        // update today's counts
    })
    .catch(err => {
        if (cancelBtn) { cancelBtn.disabled = false; cancelBtn.textContent = 'Cancel Appointment'; }
        alert(`Could not cancel appointment: ${err.message || 'Server error'}`);
    });
}

let throughputChartInstance = null;

function initChart() {
    updateThroughputChart([0, 0, 0, 0, 0, 0, 0, 0, 0]);
}

function updateThroughputChart(hourlyData) {
    const ctx = document.getElementById('throughputChart')?.getContext('2d');
    if (!ctx) return;

    const dataPoints = (hourlyData && hourlyData.length === 9) ? hourlyData : [0, 0, 0, 0, 0, 0, 0, 0, 0];

    if (throughputChartInstance) {
        throughputChartInstance.data.datasets[0].data = dataPoints;
        throughputChartInstance.update();
    } else {
        throughputChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM'],
                datasets: [{
                    label: 'Patient Volume',
                    data: dataPoints,
                    borderColor: '#38BDF8',
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' }, beginAtZero: true }
                }
            }
        });
    }
}

// --- Modal Handlers & API Submissions ---

// BUG 41 FIX: Staff booking requires linking to a real PATIENT user account
function switchPatientMode(mode) {
    const secSelect = document.getElementById('modeSelectPatient');
    const secRegister = document.getElementById('modeRegisterPatient');
    const btnSelect = document.getElementById('btnTabSelectPatient');
    const btnRegister = document.getElementById('btnTabRegisterPatient');

    if (mode === 'register') {
        if (secSelect) secSelect.style.display = 'none';
        if (secRegister) secRegister.style.display = 'block';
        if (btnSelect) btnSelect.classList.remove('active');
        if (btnRegister) btnRegister.classList.add('active');
    } else {
        if (secSelect) secSelect.style.display = 'block';
        if (secRegister) secRegister.style.display = 'none';
        if (btnSelect) btnSelect.classList.add('active');
        if (btnRegister) btnRegister.classList.remove('active');
    }
}

function searchPatientsForBooking(query = '') {
    const selectEl = document.getElementById('apptPatientSelect');
    if (!selectEl) return;

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/patients/search?query=${encodeURIComponent(query)}`)
        .then(r => r.ok ? r.json() : [])
        .then(patients => {
            if (!patients || patients.length === 0) {
                selectEl.innerHTML = '<option value="">No matching patients found</option>';
                setSelectedPatient(null);
                return;
            }
            selectEl.innerHTML = '<option value="">-- Select a patient --</option>' +
                patients.map(p => `<option value="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}">${escapeHtml(p.name)} (${escapeHtml(p.email || p.phone || 'Patient')})</option>`).join('');

            // Auto select if only 1 patient matches exact query
            if (patients.length === 1 && query.trim() !== '') {
                selectEl.selectedIndex = 1;
                onPatientSelectChange(selectEl);
            }
        })
        .catch(err => {
            console.error('Error searching patients:', err);
            selectEl.innerHTML = '<option value="">Error loading patients</option>';
        });
}

function onPatientSelectChange(selectEl) {
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    if (selectedOption && selectedOption.value) {
        setSelectedPatient(selectedOption.value, selectedOption.getAttribute('data-name') || selectedOption.text);
    } else {
        setSelectedPatient(null);
    }
}

function setSelectedPatient(patientId, patientName) {
    const input = document.getElementById('selectedPatientId');
    const badge = document.getElementById('selectedPatientBadge');
    if (input) input.value = patientId || '';

    if (badge) {
        if (patientId && patientName) {
            badge.textContent = `✓ Selected: ${patientName}`;
            badge.style.display = 'block';
        } else {
            badge.textContent = '';
            badge.style.display = 'none';
        }
    }
}

function quickRegisterPatient() {
    const nameEl = document.getElementById('newPatientName');
    const phoneEl = document.getElementById('newPatientPhone');
    const emailEl = document.getElementById('newPatientEmail');

    const name = nameEl ? nameEl.value.trim() : '';
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim() : '';

    if (!name) {
        alert('Please enter patient full name.');
        return;
    }

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, email })
    })
    .then(async res => {
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText || 'Failed to register walk-in patient');
        }
        return res.json();
    })
    .then(newPatient => {
        alert(`Walk-in patient account registered for ${newPatient.name}!`);
        if (nameEl) nameEl.value = '';
        if (phoneEl) phoneEl.value = '';
        if (emailEl) emailEl.value = '';

        switchPatientMode('select');
        const selectEl = document.getElementById('apptPatientSelect');
        if (selectEl) {
            const opt = document.createElement('option');
            opt.value = newPatient.id;
            opt.setAttribute('data-name', newPatient.name);
            opt.textContent = `${newPatient.name} (${newPatient.email || newPatient.phone || 'Walk-in'}) [NEW]`;
            selectEl.appendChild(opt);
            selectEl.value = newPatient.id;
        }
        setSelectedPatient(newPatient.id, newPatient.name);
    })
    .catch(err => {
        console.error('Error quick-registering patient:', err);
        alert(err.message || 'Error registering walk-in patient.');
    });
}

function openNewAppointmentModal() {
    const modal = document.getElementById('modalNewAppointment');
    if (!modal) return;

    switchPatientMode('select');
    setSelectedPatient(null);
    const searchInput = document.getElementById('apptPatientSearch');
    if (searchInput) searchInput.value = '';

    searchPatientsForBooking('');

    const apptDocSelect = document.getElementById('apptDoctorSelect');
    if (apptDocSelect) {
        if (doctorsData.length === 0) {
            apptDocSelect.innerHTML = '<option value="">No doctors available</option>';
        } else {
            apptDocSelect.innerHTML = doctorsData.map(d => 
                `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)} (${escapeHtml(d.departmentName || 'General')})</option>`
            ).join('');
        }
    }

    const dateInput = document.getElementById('apptDate');
    if (dateInput) {
        const today = new Date();
        const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        dateInput.value = localDate;
        dateInput.min = localDate;
    }

    updateApptTimeSlots();
    modal.classList.add('active');
}

function updateApptTimeSlots() {
    const docId = document.getElementById('apptDoctorSelect')?.value;
    const dateVal = document.getElementById('apptDate')?.value;
    const slotSelect = document.getElementById('apptTimeSlot');
    if (!slotSelect) return;

    const doc = doctorsData.find(d => d.id === docId) || doctorsData[0];
    const slots = (doc && doc.availableSlots && doc.availableSlots.length > 0)
        ? doc.availableSlots
        : ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30'];

    slotSelect.innerHTML = slots.map(s => {
        const [hh, mm] = s.split(':');
        const h = parseInt(hh, 10);
        const p = h < 12 ? 'AM' : 'PM';
        const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `<option value="${escapeHtml(s)}">${String(dh).padStart(2, '0')}:${mm} ${p}</option>`;
    }).join('');
}

function closeNewAppointmentModal() {
    const modal = document.getElementById('modalNewAppointment');
    if (modal) modal.classList.remove('active');
}

function submitNewAppointment(event) {
    event.preventDefault();

    const patientId = document.getElementById('selectedPatientId').value;
    const doctorId = document.getElementById('apptDoctorSelect').value;
    const appointmentDate = document.getElementById('apptDate').value;
    const timeSlot = document.getElementById('apptTimeSlot').value;

    if (!patientId) {
        alert('Please search and select an existing patient, or quick-register a walk-in patient.');
        return;
    }

    if (!doctorId) {
        alert('Please select a doctor.');
        return;
    }

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/appointments/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            patientId: patientId,
            doctorId: doctorId,
            appointmentDate: appointmentDate,
            timeSlot: timeSlot
        })
    })
    .then(async res => {
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText || 'Failed to book appointment');
        }
        return res.json();
    })
    .then(data => {
        closeNewAppointmentModal();
        fetchMasterAppointments();
        fetchQueueForCurrentDoctor();
        fetchDashboardStats();
    })
    .catch(err => {
        console.error('Error booking appointment:', err);
        alert(err.message || 'Could not book appointment on backend server.');
    });
}


function toggleDoctorAvailability(doctorId, currentStatus) {
    const newStatus = !currentStatus;
    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/doctors/${doctorId}/availability`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: newStatus })
    })
    .then(r => {
        if (!r.ok) throw new Error('Failed to update doctor availability');
        return r.json();
    })
    .then(data => {
        fetchDoctorsList();
    })
    .catch(err => {
        console.error('Error toggling doctor availability:', err);
        alert(err.message || 'Error updating availability.');
    });
}

function openAddDoctorModal() {
    populateDoctorDepartmentSelect();
    // BUG 34 FIX: clear previous form values before opening
    const docNameEl = document.getElementById('docName');
    if (docNameEl) docNameEl.value = '';
    const docSpecEl = document.getElementById('docSpecialization');
    if (docSpecEl) docSpecEl.value = '';
    const docRoomEl = document.getElementById('docRoom');
    if (docRoomEl) docRoomEl.value = '';
    const modal = document.getElementById('modalAddDoctor');
    if (modal) modal.classList.add('active');
}

function closeAddDoctorModal() {
    const modal = document.getElementById('modalAddDoctor');
    if (modal) modal.classList.remove('active');
}

function submitAddDoctor(event) {
    event.preventDefault();

    const name = document.getElementById('docName').value.trim();
    const deptSelect = document.getElementById('docDepartmentSelect');
    const selectedOption = deptSelect ? deptSelect.options[deptSelect.selectedIndex] : null;
    const departmentId = deptSelect ? deptSelect.value : '';
    const departmentName = selectedOption ? (selectedOption.getAttribute('data-name') || selectedOption.text) : '';
    const specialization = document.getElementById('docSpecialization').value.trim();
    const roomNumber = document.getElementById('docRoom').value.trim();

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/doctors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, departmentId, departmentName, specialization, roomNumber, available: true })
    })
    .then(async res => {
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText || 'Failed to add doctor');
        }
        return res.json();
    })
    .then(data => {
        closeAddDoctorModal();
        alert(`Doctor ${data.name} onboarded successfully!`);
        fetchDoctorsList();
        fetchDepartmentsList();
    })
    .catch(err => {
        console.error('Error adding doctor:', err);
        alert(err.message || 'Could not onboard doctor on backend server.');
    });
}

function openAddStaffModal() {
    const modal = document.getElementById('modalAddStaff');
    if (modal) modal.classList.add('active');
}

function closeAddStaffModal() {
    const modal = document.getElementById('modalAddStaff');
    if (modal) modal.classList.remove('active');
}

function submitAddStaff(event) {
    event.preventDefault();

    const name = document.getElementById('staffName').value.trim();
    const email = document.getElementById('staffEmail').value.trim().toLowerCase();
    const password = document.getElementById('staffPassword').value;
    const role = document.getElementById('staffRole').value;

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role })
    })
    .then(async res => {
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText || 'Failed to create staff account');
        }
        return res.json();
    })
    .then(data => {
        closeAddStaffModal();
        alert(`Account created successfully for ${data.name} (${data.role})!`);
        fetchDoctorsList();
    })
    .catch(err => {
        console.error('Error adding staff user:', err);
        alert(err.message || 'Could not onboard staff user on backend server.');
    });
}

// --- Dynamic Department Grid & API Integration ---
function fetchDepartmentsList() {
    return authFetch(`${API_BASE}/hospitals/${currentHospitalId}/departments`)
        .then(r => r.ok ? r.json() : [])
        .then(depts => {
            departmentsData = depts || [];
            renderDepartments();
            populateDoctorDepartmentSelect();
            updateSubscriptionTierUI(currentSubscriptionPlan);
            return departmentsData;
        })
        .catch(err => {
            console.error('Error fetching departments:', err);
            renderDepartments();
        });
}

function populateDoctorDepartmentSelect() {
    const selectEl = document.getElementById('docDepartmentSelect');
    if (!selectEl) return;
    if (!departmentsData || departmentsData.length === 0) {
        selectEl.innerHTML = '<option value="">No departments available (Add one first)</option>';
        return;
    }
    selectEl.innerHTML = departmentsData.map(d => `<option value="${escapeHtml(d.id)}" data-name="${escapeHtml(d.name)}">${escapeHtml(d.name)} (${escapeHtml(d.code || 'DEPT')})</option>`).join('');
}

function renderDepartments() {
    const container = document.getElementById('departmentGrid');
    if (!container) return;

    if (!departmentsData || departmentsData.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); grid-column: 1/-1;">No departments found in backend repository.</p>`;
        return;
    }

    container.innerHTML = departmentsData.map(dept => {
        const docs = doctorsData.filter(d => d.departmentId === dept.id || d.departmentName === dept.name);
        return `
            <div class="card glass" style="padding: 24px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="font-size: 1.2rem; font-weight: 700;">${escapeHtml(dept.name)} <span style="font-size:0.8rem; color:var(--text-muted); font-weight:400;">(${escapeHtml(dept.code || '')})</span></h3>
                    <span class="badge badge-success">${docs.length} Doctor${docs.length !== 1 ? 's' : ''}</span>
                </div>
                <p style="font-size: 0.85rem; color: var(--text-muted);">
                    ${escapeHtml(dept.description || 'Medical department wing')}
                </p>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">
                    ${docs.length > 0 ? docs.map(d => `<span style="background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; color: var(--primary);">${escapeHtml(d.name)}</span>`).join('') : '<span style="font-size:0.8rem; color:var(--text-muted);">No doctors assigned yet</span>'}
                </div>
            </div>
        `;
    }).join('');
}

function openAddDepartmentModal() {
    const modal = document.getElementById('modalAddDepartment');
    if (modal) modal.classList.add('active');
}

function closeAddDepartmentModal() {
    const modal = document.getElementById('modalAddDepartment');
    if (modal) modal.classList.remove('active');
}

function submitAddDepartment(event) {
    event.preventDefault();

    const name = document.getElementById('deptName').value.trim();
    const code = document.getElementById('deptCode').value.trim().toUpperCase();
    const description = document.getElementById('deptDescription').value.trim();

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code, description })
    })
    .then(async res => {
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText || 'Failed to create department');
        }
        return res.json();
    })
    .then(data => {
        closeAddDepartmentModal();
        alert(`Department "${data.name}" created successfully!`);
        fetchDepartmentsList();
    })
    .catch(err => {
        console.error('Error adding department:', err);
        alert(err.message || 'Could not create department on backend server.');
    });
}

// ─── Missing Spec Features: Notifications Dropdown ───
function toggleAdminNotifications() {
    const dropdown = document.getElementById('adminNotificationsDropdown');
    if (!dropdown) return;

    if (dropdown.style.display === 'none') {
        dropdown.style.display = 'block';
        fetchNotificationsList();
    } else {
        dropdown.style.display = 'none';
    }
}

function fetchUnreadNotificationsCount() {
    const auth = getAuth();
    if (!auth || !auth.userId) return;

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/notifications/unread-count`)
        .then(r => r.ok ? r.json() : { unreadCount: 0 })
        .then(data => {
            const dot = document.getElementById('adminBellDot');
            if (dot) {
                if (data.unreadCount > 0) {
                    dot.style.display = 'block';
                } else {
                    dot.style.display = 'none';
                }
            }
        })
        .catch(err => console.error('Error fetching unread notifications count:', err));
}

function fetchNotificationsList() {
    const auth = getAuth();
    if (!auth || !auth.userId) return;

    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/notifications`)
        .then(r => r.ok ? r.json() : [])
        .then(notifications => {
            renderAdminNotifications(notifications);
        })
        .catch(err => console.error('Error fetching notifications:', err));
}

function renderAdminNotifications(notifications) {
    const container = document.getElementById('adminNotificationsList');
    if (!container) return;

    if (notifications.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem; padding:8px 0; text-align:center;">No new notifications</p>`;
        return;
    }

    container.innerHTML = notifications.map(n => {
        const timeStr = new Date(n.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        return `
            <div onclick="markAdminNotificationRead('${n.id}')" style="background:${n.read ? 'rgba(255,255,255,0.02)' : 'rgba(56,189,248,0.06)'}; border:1px solid ${n.read ? 'var(--border-color)' : 'rgba(56,189,248,0.2)'}; padding:10px 12px; border-radius:8px; cursor:pointer; transition:all 0.2s;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                    <strong style="font-size:0.85rem; color:${n.read ? 'var(--text-main)' : 'var(--primary)'};">${escapeHtml(n.title)}</strong>
                    <span style="font-size:0.7rem; color:var(--text-muted);">${timeStr}</span>
                </div>
                <p style="font-size:0.78rem; color:var(--text-muted); margin:0; line-height:1.3;">${escapeHtml(n.message)}</p>
            </div>
        `;
    }).join('');
}

function markAdminNotificationRead(id) {
    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/notifications/${id}/read`, { method: 'POST' })
        .then(() => {
            fetchNotificationsList();
            fetchUnreadNotificationsCount();
        })
        .catch(err => console.error('Error marking notification as read:', err));
}

function markAllAdminNotificationsAsRead() {
    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/notifications/read-all`, { method: 'POST' })
        .then(() => {
            fetchNotificationsList();
            fetchUnreadNotificationsCount();
        })
        .catch(err => console.error('Error marking all notifications as read:', err));
}

function subscribeToNotificationsTopic() {
    if (!stompClient || !stompClient.connected) return;
    const auth = getAuth();
    if (!auth || !auth.userId) return;

    const topic = `/topic/hospital/${currentHospitalId}/user/${auth.userId}/notifications`;
    stompClient.subscribe(topic, (message) => {
        fetchUnreadNotificationsCount();
        const dropdown = document.getElementById('adminNotificationsDropdown');
        if (dropdown && dropdown.style.display !== 'none') {
            fetchNotificationsList();
        }
    });
}

// ─── Missing Spec Features: Operational Reports ───
function fetchReports() {
    const p1 = authFetch(`${API_BASE}/hospitals/${currentHospitalId}/dashboard/reports/appointments-by-date`).then(r => r.json());
    const p2 = authFetch(`${API_BASE}/hospitals/${currentHospitalId}/dashboard/reports/cancellation-stats`).then(r => r.json());
    const p3 = authFetch(`${API_BASE}/hospitals/${currentHospitalId}/dashboard/reports/doctor-workload`).then(r => r.json());
    const p4 = authFetch(`${API_BASE}/hospitals/${currentHospitalId}/dashboard/reports/department-workload`).then(r => r.json());

    Promise.all([p1, p2, p3, p4])
        .then(([apptsByDate, cancelStats, docWorkload, deptWorkload]) => {
            // Render Report 1: Appointments By Date
            const tbody1 = document.getElementById('reportAppointmentsByDateBody');
            if (tbody1) {
                tbody1.innerHTML = apptsByDate.map(row => `
                    <tr>
                        <td>${escapeHtml(row.date)}</td>
                        <td><strong>${row.count}</strong></td>
                    </tr>
                `).join('');
            }

            // Render Report 2: Cancellation Stats
            const totalBookedEl = document.getElementById('repTotalBookings');
            const totalCancelledEl = document.getElementById('repTotalCancelled');
            const cancelRateEl = document.getElementById('repCancellationPercentage');
            if (totalBookedEl) totalBookedEl.textContent = cancelStats.totalBooked || 0;
            if (totalCancelledEl) totalCancelledEl.textContent = cancelStats.totalCancelled || 0;
            if (cancelRateEl) cancelRateEl.textContent = `${(cancelStats.cancellationPercentage || 0).toFixed(1)}%`;

            // Render Report 3: Doctor Workload
            const tbody3 = document.getElementById('reportDoctorWorkloadBody');
            if (tbody3) {
                tbody3.innerHTML = docWorkload.map(row => `
                    <tr>
                        <td><strong>${escapeHtml(row.doctorName)}</strong></td>
                        <td>${row.totalAppointments}</td>
                        <td><span class="status-badge status-completed">${row.completedAppointments}</span></td>
                    </tr>
                `).join('');
            }

            // Render Report 4: Department Workload
            const tbody4 = document.getElementById('reportDepartmentWorkloadBody');
            if (tbody4) {
                tbody4.innerHTML = deptWorkload.map(row => `
                    <tr>
                        <td><strong>${escapeHtml(row.departmentName)}</strong></td>
                        <td>${row.totalAppointments}</td>
                    </tr>
                `).join('');
            }
        })
        .catch(err => console.error("Error loading reports:", err));
}

// ─── Missing Spec Features: System Audit Logs ───
function fetchAuditLogs() {
    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/audit-logs`)
        .then(r => r.ok ? r.json() : [])
        .then(data => {
            const logs = Array.isArray(data) ? data : (data && data.content ? data.content : []);
            const tbody = document.getElementById('auditLogsBody');
            if (!tbody) return;
            if (logs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:24px;">No audit logs recorded yet.</td></tr>`;
                return;
            }
            tbody.innerHTML = logs.map(l => {
                const dateStr = new Date(l.timestamp).toLocaleString();
                return `
                    <tr>
                        <td style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(dateStr)}</td>
                        <td style="font-family:monospace; font-size:0.8rem;">${escapeHtml(l.userId || '--')}</td>
                        <td><span class="status-badge status-waiting">${escapeHtml(l.action)}</span></td>
                        <td style="font-size:0.85rem; color:var(--text-muted);">${escapeHtml(l.details || '')}</td>
                    </tr>
                `;
            }).join('');
        })
        .catch(err => console.error("Error loading audit logs:", err));
}

// ─── Missing Spec Features: Reschedule Appointment ───
let rescheduleApptId = null;

function openRescheduleModalFromDetail() {
    if (!_currentDetailAppt) return;
    rescheduleApptId = _currentDetailAppt.id;
    document.getElementById('reschDate').value = _currentDetailAppt.appointmentDate || '';
    
    // Populate time slot options based on doctor slots
    const doctor = doctorsData.find(d => d.name === _currentDetailAppt.doctorName || d.id === _currentDetailAppt.doctorId);
    const slotSelect = document.getElementById('reschTimeSlot');
    if (slotSelect && doctor && doctor.availableSlots) {
        slotSelect.innerHTML = doctor.availableSlots.map(s => {
            const [hh, mm] = s.split(':');
            const h = parseInt(hh, 10);
            const p = h < 12 ? 'AM' : 'PM';
            const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
            return `<option value="${s}">${String(dh).padStart(2, '0')}:${mm} ${p}</option>`;
        }).join('');
        slotSelect.value = _currentDetailAppt.timeSlot || '';
    }
    
    closeAppointmentDetailModal();
    document.getElementById('modalRescheduleAppointment').classList.add('active');
}

function closeRescheduleModal() {
    document.getElementById('modalRescheduleAppointment').classList.remove('active');
    rescheduleApptId = null;
}

function onReschDateChange() {
    // If we had dynamically updated slot checking per date we would filter here.
}

function submitRescheduleAppointment(e) {
    e.preventDefault();
    if (!rescheduleApptId) return;
    
    const newDate = document.getElementById('reschDate').value;
    const newSlot = document.getElementById('reschTimeSlot').value;
    
    authFetch(`${API_BASE}/hospitals/${currentHospitalId}/appointments/${rescheduleApptId}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            appointmentDate: newDate,
            timeSlot: newSlot
        })
    })
    .then(res => {
        if (!res.ok) return res.text().then(t => { throw new Error(t || 'Reschedule failed'); });
        return res.json();
    })
    .then(() => {
        alert('Appointment rescheduled successfully!');
        closeRescheduleModal();
        fetchMasterAppointments();
        fetchDashboardStats();
    })
    .catch(err => alert(err.message || 'Error rescheduling appointment'));
}

// ══════════════════════════════════════════════════════════════════════════════════
// 📊 OPERATIONAL REPORTS & EXECUTIVE EXPORTS ENGINE
// ══════════════════════════════════════════════════════════════════════════════════

let _cachedReportData = {
    appointmentsByDate: [],
    cancelStats: {},
    doctorWorkload: [],
    departmentWorkload: [],
    allAppointments: []
};

function fetchReports() {
    if (!currentHospitalId) return;

    Promise.all([
        authFetch(`${API_BASE}/hospitals/${currentHospitalId}/reports/appointments-by-date`).then(r => r.ok ? r.json() : []),
        authFetch(`${API_BASE}/hospitals/${currentHospitalId}/reports/cancellation-stats`).then(r => r.ok ? r.json() : {}),
        authFetch(`${API_BASE}/hospitals/${currentHospitalId}/reports/doctor-workload`).then(r => r.ok ? r.json() : []),
        authFetch(`${API_BASE}/hospitals/${currentHospitalId}/reports/department-workload`).then(r => r.ok ? r.json() : []),
        authFetch(`${API_BASE}/hospitals/${currentHospitalId}/appointments`).then(r => r.ok ? r.json() : [])
    ])
    .then(([apptsByDate, cancelStats, docWorkload, deptWorkload, allAppts]) => {
        _cachedReportData = {
            appointmentsByDate: apptsByDate || [],
            cancelStats: cancelStats || {},
            doctorWorkload: docWorkload || [],
            departmentWorkload: deptWorkload || [],
            allAppointments: allAppts || []
        };

        // 1. KPI Overview Cards
        const totalBookings = cancelStats.totalBooked || allAppts.length || 0;
        const totalCancelled = cancelStats.totalCancelled || allAppts.filter(a => a.status === 'CANCELLED').length || 0;
        const totalCompleted = allAppts.filter(a => a.status === 'COMPLETED').length;
        const cancelRate = cancelStats.cancellationPercentage != null ? cancelStats.cancellationPercentage.toFixed(1) : (totalBookings > 0 ? ((totalCancelled / totalBookings) * 100).toFixed(1) : '0.0');
        const completeRate = totalBookings > 0 ? ((totalCompleted / totalBookings) * 100).toFixed(1) : '0.0';

        const repTotalBookingsEl = document.getElementById('repTotalBookings');
        if (repTotalBookingsEl) repTotalBookingsEl.textContent = totalBookings;

        const repTotalCompletedEl = document.getElementById('repTotalCompleted');
        if (repTotalCompletedEl) repTotalCompletedEl.textContent = totalCompleted;

        const repCompletedPercentageEl = document.getElementById('repCompletedPercentage');
        if (repCompletedPercentageEl) repCompletedPercentageEl.textContent = `${completeRate}%`;

        const repTotalCancelledEl = document.getElementById('repTotalCancelled');
        if (repTotalCancelledEl) repTotalCancelledEl.textContent = totalCancelled;

        const repCancellationPercentageEl = document.getElementById('repCancellationPercentage');
        if (repCancellationPercentageEl) repCancellationPercentageEl.textContent = `${cancelRate}%`;

        // Calculate average doctor rating
        let totalStars = 0, ratedCount = 0;
        (doctorsData || []).forEach(d => {
            if (d.averageRating && d.totalRatings > 0) {
                totalStars += d.averageRating;
                ratedCount++;
            }
        });
        const avgHospitalRating = ratedCount > 0 ? (totalStars / ratedCount).toFixed(1) : '5.0';
        const repHospitalRatingEl = document.getElementById('repHospitalRating');
        if (repHospitalRatingEl) repHospitalRatingEl.innerHTML = `${avgHospitalRating} <small>★</small>`;

        // 2. Table: Daily Appointments
        const apptsTableBody = document.getElementById('reportAppointmentsByDateBody');
        if (apptsTableBody) {
            const nonZeroEntries = (apptsByDate || []).filter(item => item.count > 0);
            const displayList = nonZeroEntries.length > 0 ? nonZeroEntries : (apptsByDate || []).slice(-10);
            
            if (displayList.length === 0) {
                apptsTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:16px;">No daily trends recorded yet.</td></tr>`;
            } else {
                apptsTableBody.innerHTML = displayList.map(item => `
                    <tr>
                        <td style="font-weight:600; color:var(--text-main);">${escapeHtml(item.date)}</td>
                        <td style="font-weight:700; color:var(--primary); font-size:0.95rem;">${item.count} bookings</td>
                        <td><span class="badge ${item.count > 5 ? 'badge-primary' : 'badge-neutral'}">${item.count > 10 ? 'High Volume' : item.count > 0 ? 'Normal' : 'No Activity'}</span></td>
                    </tr>
                `).join('');
            }
        }

        // 3. Table: Doctor Workload
        const docWorkloadBody = document.getElementById('reportDoctorWorkloadBody');
        if (docWorkloadBody) {
            if (!docWorkload || docWorkload.length === 0) {
                docWorkloadBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:16px;">No doctor workload recorded.</td></tr>`;
            } else {
                docWorkloadBody.innerHTML = docWorkload.map(doc => {
                    const matchedDoc = (doctorsData || []).find(d => d.id === doc.doctorId || d.name === doc.doctorName);
                    const rating = matchedDoc ? (matchedDoc.averageRating || 5.0).toFixed(1) : '5.0';
                    const reviews = matchedDoc ? (matchedDoc.totalRatings || 0) : 0;
                    return `
                        <tr>
                            <td style="font-weight:600; color:var(--text-main);">${escapeHtml(doc.doctorName)}</td>
                            <td>${doc.totalAppointments || 0}</td>
                            <td style="color:var(--success); font-weight:700;">${doc.completedAppointments || 0}</td>
                            <td><span style="color:#FBBF24; font-weight:700;">⭐ ${rating}</span> <small style="color:var(--text-muted);">(${reviews})</small></td>
                        </tr>
                    `;
                }).join('');
            }
        }

        // 4. Table: Department Workload
        const deptWorkloadBody = document.getElementById('reportDepartmentWorkloadBody');
        if (deptWorkloadBody) {
            if (!deptWorkload || deptWorkload.length === 0) {
                deptWorkloadBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:16px;">No department workload recorded.</td></tr>`;
            } else {
                deptWorkloadBody.innerHTML = deptWorkload.map(dept => {
                    const share = totalBookings > 0 ? (((dept.totalAppointments || 0) / totalBookings) * 100).toFixed(1) : '0.0';
                    return `
                        <tr>
                            <td style="font-weight:600; color:var(--text-main);">${escapeHtml(dept.departmentName)}</td>
                            <td style="font-weight:700; color:var(--primary);">${dept.totalAppointments || 0}</td>
                            <td><span class="badge badge-neutral">${share}%</span></td>
                        </tr>
                    `;
                }).join('');
            }
        }

        if (window.lucide) lucide.createIcons();
    })
    .catch(err => {
        console.error('Error fetching reports:', err);
    });
}

// 📥 Export Detailed Appointments CSV
function exportAppointmentsCSV() {
    const appts = _cachedReportData.allAppointments || [];
    if (appts.length === 0) {
        alert('No appointment records available to export.');
        return;
    }

    const headers = ['Appointment ID', 'Queue Number', 'Date', 'Time Slot', 'Patient ID', 'Patient Name', 'Doctor Name', 'Department', 'Status', 'Rating', 'Feedback Comment', 'Created At'];
    
    const rows = appts.map(a => [
        `"${a.id || ''}"`,
        `"${a.queueNumber || ''}"`,
        `"${a.appointmentDate || ''}"`,
        `"${a.timeSlot || ''}"`,
        `"${a.patientId || ''}"`,
        `"${(a.patientName || '').replace(/"/g, '""')}"`,
        `"${(a.doctorName || '').replace(/"/g, '""')}"`,
        `"${(a.departmentName || '').replace(/"/g, '""')}"`,
        `"${a.status || ''}"`,
        `"${a.rating || ''}"`,
        `"${(a.feedbackComment || '').replace(/"/g, '""')}"`,
        `"${a.createdAt || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `mediflow_appointments_${currentHospitalId}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 📊 Export Doctor Workload CSV
function exportDoctorWorkloadCSV() {
    const docList = _cachedReportData.doctorWorkload || [];
    if (docList.length === 0) {
        alert('No doctor workload data available to export.');
        return;
    }

    const headers = ['Doctor ID', 'Doctor Name', 'Total Appointments', 'Completed Consultations', 'Completion Rate (%)', 'Rating', 'Review Count'];
    const rows = docList.map(doc => {
        const matched = (doctorsData || []).find(d => d.id === doc.doctorId || d.name === doc.doctorName);
        const rating = matched ? (matched.averageRating || 5.0).toFixed(1) : '5.0';
        const reviews = matched ? (matched.totalRatings || 0) : 0;
        const compRate = doc.totalAppointments > 0 ? (((doc.completedAppointments || 0) / doc.totalAppointments) * 100).toFixed(1) : '0.0';
        return [
            `"${doc.doctorId || ''}"`,
            `"${(doc.doctorName || '').replace(/"/g, '""')}"`,
            doc.totalAppointments || 0,
            doc.completedAppointments || 0,
            `"${compRate}%"`,
            `"${rating}"`,
            reviews
        ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `mediflow_doctor_workload_${currentHospitalId}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 📄 Export Executive PDF Report (Print Optimized)
function exportExecutivePDFReport() {
    const auth = window._auth || getAuth() || {};
    const hospitalName = auth.hospitalName || currentHospitalId;
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const totalBookings = _cachedReportData.cancelStats.totalBooked || _cachedReportData.allAppointments.length || 0;
    const totalCancelled = _cachedReportData.cancelStats.totalCancelled || _cachedReportData.allAppointments.filter(a => a.status === 'CANCELLED').length || 0;
    const totalCompleted = _cachedReportData.allAppointments.filter(a => a.status === 'COMPLETED').length;
    const cancelRate = _cachedReportData.cancelStats.cancellationPercentage != null 
        ? _cachedReportData.cancelStats.cancellationPercentage.toFixed(1) 
        : (totalBookings > 0 ? ((totalCancelled / totalBookings) * 100).toFixed(1) : '0.0');

    let doctorRowsHtml = (_cachedReportData.doctorWorkload || []).map(d => {
        const matched = (doctorsData || []).find(x => x.id === d.doctorId || x.name === d.doctorName);
        const rating = matched ? (matched.averageRating || 5.0).toFixed(1) : '5.0';
        return `
            <tr>
                <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; font-weight:600;">${escapeHtml(d.doctorName)}</td>
                <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; text-align:center;">${d.totalAppointments || 0}</td>
                <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; text-align:center; color:#10B981; font-weight:700;">${d.completedAppointments || 0}</td>
                <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; text-align:center;">⭐ ${rating}</td>
            </tr>
        `;
    }).join('');

    let deptRowsHtml = (_cachedReportData.departmentWorkload || []).map(dept => `
        <tr>
            <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; font-weight:600;">${escapeHtml(dept.departmentName)}</td>
            <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; text-align:center;">${dept.totalAppointments || 0}</td>
        </tr>
    `).join('');

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Please allow popups to generate the Executive PDF Report.');
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>MediFlow Executive Operational Report — ${hospitalName}</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; padding: 40px; margin: 0; background: #fff; }
                .header { border-bottom: 3px solid #0284c7; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
                .hospital-title { font-size: 26px; font-weight: 800; color: #0f172a; margin: 0; }
                .report-subtitle { font-size: 14px; color: #64748b; margin-top: 4px; }
                .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
                .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; }
                .kpi-title { font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 700; margin: 0; }
                .kpi-val { font-size: 28px; font-weight: 800; color: #0284c7; margin: 8px 0 0 0; }
                .section-title { font-size: 18px; font-weight: 700; color: #0f172a; margin: 24px 0 12px 0; border-left: 4px solid #0284c7; padding-left: 10px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px; }
                th { background: #f1f5f9; padding: 10px 12px; text-align: left; font-weight: 700; color: #334155; border-bottom: 2px solid #cbd5e1; }
                .footer { margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; display: flex; justify-content: space-between; }
                @media print {
                    body { padding: 20px; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <h1 class="hospital-title">${escapeHtml(hospitalName)}</h1>
                    <div class="report-subtitle">MediFlow Hospital Management System &bull; Executive Operational Report</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 700; color: #0f172a;">Date Generated</div>
                    <div style="font-size: 13px; color: #64748b;">${dateStr}</div>
                </div>
            </div>

            <div class="kpi-grid">
                <div class="kpi-card">
                    <p class="kpi-title">Total Bookings</p>
                    <h2 class="kpi-val">${totalBookings}</h2>
                </div>
                <div class="kpi-card">
                    <p class="kpi-title">Completed Consults</p>
                    <h2 class="kpi-val" style="color:#10B981;">${totalCompleted}</h2>
                </div>
                <div class="kpi-card">
                    <p class="kpi-title">Cancelled Appts</p>
                    <h2 class="kpi-val" style="color:#EF4444;">${totalCancelled}</h2>
                </div>
                <div class="kpi-card">
                    <p class="kpi-title">Cancellation Rate</p>
                    <h2 class="kpi-val" style="color:#8B5CF6;">${cancelRate}%</h2>
                </div>
            </div>

            <h2 class="section-title">Doctor Workload &amp; Patient Ratings</h2>
            <table>
                <thead>
                    <tr>
                        <th>Doctor Name</th>
                        <th style="text-align:center;">Total Appointments</th>
                        <th style="text-align:center;">Completed Consultations</th>
                        <th style="text-align:center;">Average Rating</th>
                    </tr>
                </thead>
                <tbody>
                    ${doctorRowsHtml || '<tr><td colspan="4" style="text-align:center; padding:12px;">No doctor entries available.</td></tr>'}
                </tbody>
            </table>

            <h2 class="section-title">Departmental Workload Distribution</h2>
            <table>
                <thead>
                    <tr>
                        <th>Department</th>
                        <th style="text-align:center;">Total Appointments</th>
                    </tr>
                </thead>
                <tbody>
                    ${deptRowsHtml || '<tr><td colspan="2" style="text-align:center; padding:12px;">No department entries available.</td></tr>'}
                </tbody>
            </table>

            <div class="footer">
                <span>Confidential &bull; Prepared for Hospital Administration</span>
                <span>Powered by MediFlow SaaS Multi-Tenant Platform</span>
            </div>

            <script>
                window.onload = function() {
                    window.print();
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// --- Admin / Staff Change Password Modal Handlers ---
function openAdminChangePasswordModal() {
    document.getElementById('adminCurrentPass').value = '';
    document.getElementById('adminNewPass').value = '';
    document.getElementById('adminConfirmPass').value = '';
    const modal = document.getElementById('modalAdminChangePassword');
    if (modal) modal.classList.add('active');
}

function closeAdminChangePasswordModal() {
    const modal = document.getElementById('modalAdminChangePassword');
    if (modal) modal.classList.remove('active');
}

async function submitAdminChangePassword(event) {
    event.preventDefault();
    const currentPassword = document.getElementById('adminCurrentPass').value.trim();
    const newPassword = document.getElementById('adminNewPass').value.trim();
    const confirmPassword = document.getElementById('adminConfirmPass').value.trim();

    if (!currentPassword || !newPassword) {
        alert('Please enter both current and new passwords.');
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
        const res = await authFetch(`${API_BASE}/auth/change-password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        if (res.ok) {
            closeAdminChangePasswordModal();
            alert('🎉 Password changed successfully!');
        } else {
            const err = await res.text();
            alert(err || 'Failed to change password. Please verify your current password.');
        }
    } catch (err) {
        console.error('Error changing password:', err);
        alert('Connection error. Please try again.');
    }
}




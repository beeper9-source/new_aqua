// Supabase 설정
const supabaseUrl = 'https://nqwjvrznwzmfytjlpfsk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xd2p2cnpud3ptZnl0amxwZnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNzA4NTEsImV4cCI6MjA3Mzk0Njg1MX0.R3Y2Xb9PmLr3sCLSdJov4Mgk1eAmhaCIPXEKq6u8NQI';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// 전역 변수
let currentTab = 'members';
let editingId = null;
let members = [];
let courts = [];
let reservations = [];
let balls = [];
let ballUsage = [];

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// 앱 초기화
async function initializeApp() {
    showLoading(true);
    try {
        await loadAllData();
        setupEventListeners();
        showNotification('앱이 성공적으로 로드되었습니다.', 'success');
    } catch (error) {
        console.error('앱 초기화 오류:', error);
        showNotification('앱 로드 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 모든 데이터 로드
async function loadAllData() {
    try {
        const [membersData, courtsData, reservationsData, ballsData, ballUsageData] = await Promise.all([
            loadMembers(),
            loadCourts(),
            loadReservations(),
            loadBalls(),
            loadBallUsage()
        ]);
        
        members = membersData;
        courts = courtsData;
        reservations = reservationsData;
        balls = ballsData;
        ballUsage = ballUsageData;
        
        updateSelectOptions();
    } catch (error) {
        console.error('데이터 로드 오류:', error);
        throw error;
    }
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 탭 전환
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchTab(tabName);
        });
    });

    // 폼 제출 이벤트
    document.getElementById('memberForm').addEventListener('submit', handleMemberSubmit);
    document.getElementById('courtForm').addEventListener('submit', handleCourtSubmit);
    document.getElementById('reservationForm').addEventListener('submit', handleReservationSubmit);
    document.getElementById('ballForm').addEventListener('submit', handleBallSubmit);
    document.getElementById('ballUsageForm').addEventListener('submit', handleBallUsageSubmit);

    // 모달 외부 클릭 시 닫기
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.display = 'none';
            }
        });
    });

    // ESC 키로 모달 닫기
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });
}

// 탭 전환
function switchTab(tabName) {
    // 모든 탭 비활성화
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // 선택된 탭 활성화
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');
    
    currentTab = tabName;
}

// 로딩 표시
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    overlay.style.display = show ? 'block' : 'none';
}

// 알림 표시
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// ==================== 회원 관리 ====================

// 회원 데이터 로드
async function loadMembers() {
    const { data, error } = await supabase
        .from('aq_members')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
}

// 회원 테이블 렌더링
function renderMembersTable() {
    const tbody = document.getElementById('membersTableBody');
    tbody.innerHTML = '';

    members.forEach(member => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${member.member_code}</td>
            <td>${member.name}</td>
            <td>${member.email}</td>
            <td>${member.phone || '-'}</td>
            <td>${getMembershipTypeText(member.membership_type)}</td>
            <td>${getSkillLevelText(member.skill_level)}</td>
            <td><span class="status-badge ${member.is_active ? 'status-active' : 'status-inactive'}">${member.is_active ? '활성' : '비활성'}</span></td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editMember('${member.id}')">
                    <i class="fas fa-edit"></i> 수정
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteMember('${member.id}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 회원 모달 열기
function openMemberModal(memberId = null) {
    editingId = memberId;
    const modal = document.getElementById('memberModal');
    const title = document.getElementById('memberModalTitle');
    
    if (memberId) {
        title.textContent = '회원 수정';
        const member = members.find(m => m.id === memberId);
        if (member) {
            fillMemberForm(member);
        }
    } else {
        title.textContent = '새 회원 추가';
        document.getElementById('memberForm').reset();
        document.getElementById('membershipStartDate').value = new Date().toISOString().split('T')[0];
    }
    
    modal.style.display = 'block';
}

// 회원 모달 닫기
function closeMemberModal() {
    document.getElementById('memberModal').style.display = 'none';
    editingId = null;
}

// 회원 폼 채우기
function fillMemberForm(member) {
    document.getElementById('memberCode').value = member.member_code;
    document.getElementById('memberName').value = member.name;
    document.getElementById('memberEmail').value = member.email;
    document.getElementById('memberPhone').value = member.phone || '';
    document.getElementById('memberBirthDate').value = member.birth_date || '';
    document.getElementById('memberGender').value = member.gender || '';
    document.getElementById('memberAddress').value = member.address || '';
    document.getElementById('membershipType').value = member.membership_type;
    document.getElementById('membershipStartDate').value = member.membership_start_date;
    document.getElementById('membershipEndDate').value = member.membership_end_date || '';
    document.getElementById('skillLevel').value = member.skill_level;
    document.getElementById('emergencyContactName').value = member.emergency_contact_name || '';
    document.getElementById('emergencyContactPhone').value = member.emergency_contact_phone || '';
    document.getElementById('memberNotes').value = member.notes || '';
}

// 회원 폼 제출 처리
async function handleMemberSubmit(e) {
    e.preventDefault();
    
    const formData = {
        member_code: document.getElementById('memberCode').value,
        name: document.getElementById('memberName').value,
        email: document.getElementById('memberEmail').value,
        phone: document.getElementById('memberPhone').value || null,
        birth_date: document.getElementById('memberBirthDate').value || null,
        gender: document.getElementById('memberGender').value || null,
        address: document.getElementById('memberAddress').value || null,
        membership_type: document.getElementById('membershipType').value,
        membership_start_date: document.getElementById('membershipStartDate').value,
        membership_end_date: document.getElementById('membershipEndDate').value || null,
        skill_level: document.getElementById('skillLevel').value,
        emergency_contact_name: document.getElementById('emergencyContactName').value || null,
        emergency_contact_phone: document.getElementById('emergencyContactPhone').value || null,
        notes: document.getElementById('memberNotes').value || null
    };

    try {
        showLoading(true);
        
        if (editingId) {
        const { error } = await supabase
            .from('aq_members')
            .update(formData)
            .eq('id', editingId);
            
            if (error) throw error;
            showNotification('회원 정보가 성공적으로 수정되었습니다.', 'success');
        } else {
            const { error } = await supabase
                .from('aq_members')
                .insert([formData]);
            
            if (error) throw error;
            showNotification('새 회원이 성공적으로 추가되었습니다.', 'success');
        }
        
        await loadAllData();
        renderMembersTable();
        closeMemberModal();
        
    } catch (error) {
        console.error('회원 저장 오류:', error);
        showNotification('회원 저장 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 회원 수정
function editMember(memberId) {
    openMemberModal(memberId);
}

// 회원 삭제
async function deleteMember(memberId) {
    if (!confirm('정말로 이 회원을 삭제하시겠습니까?')) return;
    
    try {
        showLoading(true);
        
        const { error } = await supabase
            .from('aq_members')
            .delete()
            .eq('id', memberId);
        
        if (error) throw error;
        
        showNotification('회원이 성공적으로 삭제되었습니다.', 'success');
        await loadAllData();
        renderMembersTable();
        
    } catch (error) {
        console.error('회원 삭제 오류:', error);
        showNotification('회원 삭제 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 회원 검색
function searchMembers() {
    const searchTerm = document.getElementById('memberSearch').value.toLowerCase();
    const filteredMembers = members.filter(member => 
        member.name.toLowerCase().includes(searchTerm) ||
        member.email.toLowerCase().includes(searchTerm) ||
        member.member_code.toLowerCase().includes(searchTerm)
    );
    
    const tbody = document.getElementById('membersTableBody');
    tbody.innerHTML = '';

    filteredMembers.forEach(member => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${member.member_code}</td>
            <td>${member.name}</td>
            <td>${member.email}</td>
            <td>${member.phone || '-'}</td>
            <td>${getMembershipTypeText(member.membership_type)}</td>
            <td>${getSkillLevelText(member.skill_level)}</td>
            <td><span class="status-badge ${member.is_active ? 'status-active' : 'status-inactive'}">${member.is_active ? '활성' : '비활성'}</span></td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editMember('${member.id}')">
                    <i class="fas fa-edit"></i> 수정
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteMember('${member.id}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// ==================== 코트 관리 ====================

// 코트 데이터 로드
async function loadCourts() {
    const { data, error } = await supabase
        .from('aq_courts')
        .select('*')
        .order('court_number', { ascending: true });
    
    if (error) throw error;
    return data || [];
}

// 코트 테이블 렌더링
function renderCourtsTable() {
    const tbody = document.getElementById('courtsTableBody');
    tbody.innerHTML = '';

    courts.forEach(court => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${court.court_number}</td>
            <td>${court.name}</td>
            <td>${court.location || '-'}</td>
            <td>${getSurfaceTypeText(court.surface_type)}</td>
            <td>${court.is_indoor ? '실내' : '실외'}</td>
            <td>₩${court.hourly_rate.toLocaleString()}</td>
            <td><span class="status-badge ${court.is_active ? 'status-active' : 'status-inactive'}">${court.is_active ? '활성' : '비활성'}</span></td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editCourt('${court.id}')">
                    <i class="fas fa-edit"></i> 수정
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteCourt('${court.id}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 코트 모달 열기
function openCourtModal(courtId = null) {
    editingId = courtId;
    const modal = document.getElementById('courtModal');
    const title = document.getElementById('courtModalTitle');
    
    if (courtId) {
        title.textContent = '코트 수정';
        const court = courts.find(c => c.id === courtId);
        if (court) {
            fillCourtForm(court);
        }
    } else {
        title.textContent = '새 코트 추가';
        document.getElementById('courtForm').reset();
    }
    
    modal.style.display = 'block';
}

// 코트 모달 닫기
function closeCourtModal() {
    document.getElementById('courtModal').style.display = 'none';
    editingId = null;
}

// 코트 폼 채우기
function fillCourtForm(court) {
    document.getElementById('courtNumber').value = court.court_number;
    document.getElementById('courtName').value = court.name;
    document.getElementById('courtLocation').value = court.location || '';
    document.getElementById('surfaceType').value = court.surface_type;
    document.getElementById('isIndoor').value = court.is_indoor.toString();
    document.getElementById('lightingType').value = court.lighting_type || '';
    document.getElementById('courtSize').value = court.court_size;
    document.getElementById('hourlyRate').value = court.hourly_rate;
    document.getElementById('peakHourRate').value = court.peak_hour_rate || '';
    document.getElementById('maxCapacity').value = court.max_capacity;
    document.getElementById('courtNotes').value = court.notes || '';
}

// 코트 폼 제출 처리
async function handleCourtSubmit(e) {
    e.preventDefault();
    
    const formData = {
        court_number: document.getElementById('courtNumber').value,
        name: document.getElementById('courtName').value,
        location: document.getElementById('courtLocation').value || null,
        surface_type: document.getElementById('surfaceType').value,
        is_indoor: document.getElementById('isIndoor').value === 'true',
        lighting_type: document.getElementById('lightingType').value || null,
        court_size: document.getElementById('courtSize').value,
        hourly_rate: parseFloat(document.getElementById('hourlyRate').value),
        peak_hour_rate: document.getElementById('peakHourRate').value ? parseFloat(document.getElementById('peakHourRate').value) : null,
        max_capacity: parseInt(document.getElementById('maxCapacity').value),
        notes: document.getElementById('courtNotes').value || null
    };

    try {
        showLoading(true);
        
        if (editingId) {
        const { error } = await supabase
            .from('aq_courts')
            .update(formData)
            .eq('id', editingId);
            
            if (error) throw error;
            showNotification('코트 정보가 성공적으로 수정되었습니다.', 'success');
        } else {
            const { error } = await supabase
                .from('aq_courts')
                .insert([formData]);
            
            if (error) throw error;
            showNotification('새 코트가 성공적으로 추가되었습니다.', 'success');
        }
        
        await loadAllData();
        renderCourtsTable();
        closeCourtModal();
        
    } catch (error) {
        console.error('코트 저장 오류:', error);
        showNotification('코트 저장 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 코트 수정
function editCourt(courtId) {
    openCourtModal(courtId);
}

// 코트 삭제
async function deleteCourt(courtId) {
    if (!confirm('정말로 이 코트를 삭제하시겠습니까?')) return;
    
    try {
        showLoading(true);
        
        const { error } = await supabase
            .from('aq_courts')
            .delete()
            .eq('id', courtId);
        
        if (error) throw error;
        
        showNotification('코트가 성공적으로 삭제되었습니다.', 'success');
        await loadAllData();
        renderCourtsTable();
        
    } catch (error) {
        console.error('코트 삭제 오류:', error);
        showNotification('코트 삭제 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== 예약 관리 ====================

// 예약 데이터 로드
async function loadReservations() {
    const { data, error } = await supabase
        .from('aq_reservations')
        .select(`
            *,
            member:aq_members!member_id(name, member_code),
            court:aq_courts(name, court_number)
        `)
        .order('reservation_date', { ascending: false });
    
    if (error) throw error;
    return data || [];
}

// 예약 테이블 렌더링
function renderReservationsTable() {
    const tbody = document.getElementById('reservationsTableBody');
    tbody.innerHTML = '';

    reservations.forEach(reservation => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${reservation.reservation_code}</td>
            <td>${reservation.member.name} (${reservation.member.member_code})</td>
            <td>${reservation.court.name} (${reservation.court.court_number})</td>
            <td>${reservation.reservation_date}</td>
            <td>${reservation.start_time} - ${reservation.end_time}</td>
            <td>${reservation.guest_count}명</td>
            <td>₩${reservation.total_amount.toLocaleString()}</td>
            <td><span class="status-badge status-${reservation.reservation_status}">${getReservationStatusText(reservation.reservation_status)}</span></td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editReservation('${reservation.id}')">
                    <i class="fas fa-edit"></i> 수정
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteReservation('${reservation.id}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 예약 모달 열기
function openReservationModal(reservationId = null) {
    editingId = reservationId;
    const modal = document.getElementById('reservationModal');
    const title = document.getElementById('reservationModalTitle');
    
    if (reservationId) {
        title.textContent = '예약 수정';
        const reservation = reservations.find(r => r.id === reservationId);
        if (reservation) {
            fillReservationForm(reservation);
        }
    } else {
        title.textContent = '새 예약 추가';
        document.getElementById('reservationForm').reset();
        document.getElementById('reservationDate').value = new Date().toISOString().split('T')[0];
    }
    
    modal.style.display = 'block';
}

// 예약 모달 닫기
function closeReservationModal() {
    document.getElementById('reservationModal').style.display = 'none';
    editingId = null;
}

// 예약 폼 채우기
function fillReservationForm(reservation) {
    document.getElementById('reservationCode').value = reservation.reservation_code;
    document.getElementById('reservationMember').value = reservation.member_id;
    document.getElementById('reservationCourt').value = reservation.court_id;
    document.getElementById('reservationDate').value = reservation.reservation_date;
    document.getElementById('startTime').value = reservation.start_time;
    document.getElementById('endTime').value = reservation.end_time;
    document.getElementById('guestCount').value = reservation.guest_count;
    document.getElementById('specialRequests').value = reservation.special_requests || '';
}

// 예약 폼 제출 처리
async function handleReservationSubmit(e) {
    e.preventDefault();
    
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const duration = calculateDuration(startTime, endTime);
    
    const formData = {
        reservation_code: document.getElementById('reservationCode').value,
        member_id: document.getElementById('reservationMember').value,
        court_id: document.getElementById('reservationCourt').value,
        reservation_date: document.getElementById('reservationDate').value,
        start_time: startTime,
        end_time: endTime,
        duration_hours: duration,
        guest_count: parseInt(document.getElementById('guestCount').value),
        special_requests: document.getElementById('specialRequests').value || null
    };

    try {
        showLoading(true);
        
        if (editingId) {
        const { error } = await supabase
            .from('aq_reservations')
            .update(formData)
            .eq('id', editingId);
            
            if (error) throw error;
            showNotification('예약이 성공적으로 수정되었습니다.', 'success');
        } else {
            const { error } = await supabase
                .from('aq_reservations')
                .insert([formData]);
            
            if (error) throw error;
            showNotification('새 예약이 성공적으로 추가되었습니다.', 'success');
        }
        
        await loadAllData();
        renderReservationsTable();
        closeReservationModal();
        
    } catch (error) {
        console.error('예약 저장 오류:', error);
        showNotification('예약 저장 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 예약 수정
function editReservation(reservationId) {
    openReservationModal(reservationId);
}

// 예약 삭제
async function deleteReservation(reservationId) {
    if (!confirm('정말로 이 예약을 삭제하시겠습니까?')) return;
    
    try {
        showLoading(true);
        
        const { error } = await supabase
            .from('aq_reservations')
            .delete()
            .eq('id', reservationId);
        
        if (error) throw error;
        
        showNotification('예약이 성공적으로 삭제되었습니다.', 'success');
        await loadAllData();
        renderReservationsTable();
        
    } catch (error) {
        console.error('예약 삭제 오류:', error);
        showNotification('예약 삭제 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 예약 필터링
function filterReservations() {
    const dateFilter = document.getElementById('reservationDateFilter').value;
    const courtFilter = document.getElementById('courtFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    
    let filteredReservations = reservations;
    
    if (dateFilter) {
        filteredReservations = filteredReservations.filter(r => r.reservation_date === dateFilter);
    }
    
    if (courtFilter) {
        filteredReservations = filteredReservations.filter(r => r.court_id === courtFilter);
    }
    
    if (statusFilter) {
        filteredReservations = filteredReservations.filter(r => r.reservation_status === statusFilter);
    }
    
    const tbody = document.getElementById('reservationsTableBody');
    tbody.innerHTML = '';

    filteredReservations.forEach(reservation => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${reservation.reservation_code}</td>
            <td>${reservation.member.name} (${reservation.member.member_code})</td>
            <td>${reservation.court.name} (${reservation.court.court_number})</td>
            <td>${reservation.reservation_date}</td>
            <td>${reservation.start_time} - ${reservation.end_time}</td>
            <td>${reservation.guest_count}명</td>
            <td>₩${reservation.total_amount.toLocaleString()}</td>
            <td><span class="status-badge status-${reservation.reservation_status}">${getReservationStatusText(reservation.reservation_status)}</span></td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editReservation('${reservation.id}')">
                    <i class="fas fa-edit"></i> 수정
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteReservation('${reservation.id}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// ==================== 볼 관리 ====================

// 볼 데이터 로드
async function loadBalls() {
    const { data, error } = await supabase
        .from('aq_tennis_balls')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
}

// 볼 테이블 렌더링
function renderBallsTable() {
    const tbody = document.getElementById('ballsTableBody');
    tbody.innerHTML = '';

    balls.forEach(ball => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${ball.ball_code}</td>
            <td>${ball.brand}</td>
            <td>${ball.model || '-'}</td>
            <td>${getBallTypeText(ball.ball_type)}</td>
            <td>${getBallColorText(ball.color)}</td>
            <td><span class="status-badge status-${ball.condition_status}">${getConditionStatusText(ball.condition_status)}</span></td>
            <td>${ball.quantity_total}</td>
            <td>${ball.quantity_available}</td>
            <td>${ball.quantity_in_use}</td>
            <td>${ball.quantity_damaged}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editBall('${ball.id}')">
                    <i class="fas fa-edit"></i> 수정
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteBall('${ball.id}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 볼 모달 열기
function openBallModal(ballId = null) {
    editingId = ballId;
    const modal = document.getElementById('ballModal');
    const title = document.getElementById('ballModalTitle');
    
    if (ballId) {
        title.textContent = '볼 수정';
        const ball = balls.find(b => b.id === ballId);
        if (ball) {
            fillBallForm(ball);
        }
    } else {
        title.textContent = '새 볼 추가';
        document.getElementById('ballForm').reset();
    }
    
    modal.style.display = 'block';
}

// 볼 모달 닫기
function closeBallModal() {
    document.getElementById('ballModal').style.display = 'none';
    editingId = null;
}

// 볼 폼 채우기
function fillBallForm(ball) {
    document.getElementById('ballCode').value = ball.ball_code;
    document.getElementById('ballBrand').value = ball.brand;
    document.getElementById('ballModel').value = ball.model || '';
    document.getElementById('ballType').value = ball.ball_type;
    document.getElementById('ballColor').value = ball.color;
    document.getElementById('conditionStatus').value = ball.condition_status;
    document.getElementById('purchaseDate').value = ball.purchase_date || '';
    document.getElementById('purchasePrice').value = ball.purchase_price || '';
    document.getElementById('supplier').value = ball.supplier || '';
    document.getElementById('quantityTotal').value = ball.quantity_total;
    document.getElementById('storageLocation').value = ball.storage_location || '';
    document.getElementById('ballNotes').value = ball.notes || '';
}

// 볼 폼 제출 처리
async function handleBallSubmit(e) {
    e.preventDefault();
    
    const formData = {
        ball_code: document.getElementById('ballCode').value,
        brand: document.getElementById('ballBrand').value,
        model: document.getElementById('ballModel').value || null,
        ball_type: document.getElementById('ballType').value,
        color: document.getElementById('ballColor').value,
        condition_status: document.getElementById('conditionStatus').value,
        purchase_date: document.getElementById('purchaseDate').value || null,
        purchase_price: document.getElementById('purchasePrice').value ? parseFloat(document.getElementById('purchasePrice').value) : null,
        supplier: document.getElementById('supplier').value || null,
        quantity_total: parseInt(document.getElementById('quantityTotal').value),
        quantity_available: parseInt(document.getElementById('quantityTotal').value),
        storage_location: document.getElementById('storageLocation').value || null,
        notes: document.getElementById('ballNotes').value || null
    };

    try {
        showLoading(true);
        
        if (editingId) {
        const { error } = await supabase
            .from('aq_tennis_balls')
            .update(formData)
            .eq('id', editingId);
            
            if (error) throw error;
            showNotification('볼 정보가 성공적으로 수정되었습니다.', 'success');
        } else {
            const { error } = await supabase
                .from('aq_tennis_balls')
                .insert([formData]);
            
            if (error) throw error;
            showNotification('새 볼이 성공적으로 추가되었습니다.', 'success');
        }
        
        await loadAllData();
        renderBallsTable();
        closeBallModal();
        
    } catch (error) {
        console.error('볼 저장 오류:', error);
        showNotification('볼 저장 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 볼 수정
function editBall(ballId) {
    openBallModal(ballId);
}

// 볼 삭제
async function deleteBall(ballId) {
    if (!confirm('정말로 이 볼을 삭제하시겠습니까?')) return;
    
    try {
        showLoading(true);
        
        const { error } = await supabase
            .from('aq_tennis_balls')
            .delete()
            .eq('id', ballId);
        
        if (error) throw error;
        
        showNotification('볼이 성공적으로 삭제되었습니다.', 'success');
        await loadAllData();
        renderBallsTable();
        
    } catch (error) {
        console.error('볼 삭제 오류:', error);
        showNotification('볼 삭제 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== 볼 사용기록 관리 ====================

// 볼 사용기록 데이터 로드
async function loadBallUsage() {
    const { data, error } = await supabase
        .from('aq_ball_usage')
        .select(`
            *,
            ball:aq_tennis_balls(ball_code, brand),
            member:aq_members!member_id(name, member_code),
            court:aq_courts(name, court_number)
        `)
        .order('usage_date', { ascending: false });
    
    if (error) throw error;
    return data || [];
}

// 볼 사용기록 테이블 렌더링
function renderBallUsageTable() {
    const tbody = document.getElementById('ballUsageTableBody');
    tbody.innerHTML = '';

    ballUsage.forEach(usage => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${usage.ball.ball_code}</td>
            <td>${usage.member.name} (${usage.member.member_code})</td>
            <td>${usage.court ? `${usage.court.name} (${usage.court.court_number})` : '-'}</td>
            <td>${usage.usage_date}</td>
            <td>${usage.usage_start_time ? `${usage.usage_start_time} - ${usage.usage_end_time || ''}` : '-'}</td>
            <td>${usage.balls_taken}</td>
            <td>${usage.balls_returned}</td>
            <td>${usage.balls_damaged}</td>
            <td>${usage.balls_lost}</td>
            <td>${getUsageTypeText(usage.usage_type)}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editBallUsage('${usage.id}')">
                    <i class="fas fa-edit"></i> 수정
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteBallUsage('${usage.id}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 볼 사용기록 모달 열기
function openBallUsageModal(usageId = null) {
    editingId = usageId;
    const modal = document.getElementById('ballUsageModal');
    const title = document.getElementById('ballUsageModalTitle');
    
    if (usageId) {
        title.textContent = '볼 사용기록 수정';
        const usage = ballUsage.find(u => u.id === usageId);
        if (usage) {
            fillBallUsageForm(usage);
        }
    } else {
        title.textContent = '새 사용기록 추가';
        document.getElementById('ballUsageForm').reset();
        document.getElementById('usageDate').value = new Date().toISOString().split('T')[0];
    }
    
    modal.style.display = 'block';
}

// 볼 사용기록 모달 닫기
function closeBallUsageModal() {
    document.getElementById('ballUsageModal').style.display = 'none';
    editingId = null;
}

// 볼 사용기록 폼 채우기
function fillBallUsageForm(usage) {
    document.getElementById('usageBall').value = usage.ball_id;
    document.getElementById('usageMember').value = usage.member_id;
    document.getElementById('usageCourt').value = usage.court_id || '';
    document.getElementById('usageReservation').value = usage.reservation_id || '';
    document.getElementById('usageDate').value = usage.usage_date;
    document.getElementById('usageStartTime').value = usage.usage_start_time || '';
    document.getElementById('usageEndTime').value = usage.usage_end_time || '';
    document.getElementById('ballsTaken').value = usage.balls_taken;
    document.getElementById('ballsReturned').value = usage.balls_returned;
    document.getElementById('ballsDamaged').value = usage.balls_damaged;
    document.getElementById('ballsLost').value = usage.balls_lost;
    document.getElementById('usageType').value = usage.usage_type;
    document.getElementById('conditionBefore').value = usage.condition_before || '';
    document.getElementById('conditionAfter').value = usage.condition_after || '';
    document.getElementById('usageNotes').value = usage.notes || '';
}

// 볼 사용기록 폼 제출 처리
async function handleBallUsageSubmit(e) {
    e.preventDefault();
    
    const formData = {
        ball_id: document.getElementById('usageBall').value,
        member_id: document.getElementById('usageMember').value,
        court_id: document.getElementById('usageCourt').value || null,
        reservation_id: document.getElementById('usageReservation').value || null,
        usage_date: document.getElementById('usageDate').value,
        usage_start_time: document.getElementById('usageStartTime').value || null,
        usage_end_time: document.getElementById('usageEndTime').value || null,
        balls_taken: parseInt(document.getElementById('ballsTaken').value),
        balls_returned: parseInt(document.getElementById('ballsReturned').value),
        balls_damaged: parseInt(document.getElementById('ballsDamaged').value),
        balls_lost: parseInt(document.getElementById('ballsLost').value),
        usage_type: document.getElementById('usageType').value,
        condition_before: document.getElementById('conditionBefore').value || null,
        condition_after: document.getElementById('conditionAfter').value || null,
        notes: document.getElementById('usageNotes').value || null
    };

    try {
        showLoading(true);
        
        if (editingId) {
        const { error } = await supabase
            .from('aq_ball_usage')
            .update(formData)
            .eq('id', editingId);
            
            if (error) throw error;
            showNotification('볼 사용기록이 성공적으로 수정되었습니다.', 'success');
        } else {
            const { error } = await supabase
                .from('aq_ball_usage')
                .insert([formData]);
            
            if (error) throw error;
            showNotification('새 볼 사용기록이 성공적으로 추가되었습니다.', 'success');
        }
        
        await loadAllData();
        renderBallUsageTable();
        closeBallUsageModal();
        
    } catch (error) {
        console.error('볼 사용기록 저장 오류:', error);
        showNotification('볼 사용기록 저장 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 볼 사용기록 수정
function editBallUsage(usageId) {
    openBallUsageModal(usageId);
}

// 볼 사용기록 삭제
async function deleteBallUsage(usageId) {
    if (!confirm('정말로 이 볼 사용기록을 삭제하시겠습니까?')) return;
    
    try {
        showLoading(true);
        
        const { error } = await supabase
            .from('aq_ball_usage')
            .delete()
            .eq('id', usageId);
        
        if (error) throw error;
        
        showNotification('볼 사용기록이 성공적으로 삭제되었습니다.', 'success');
        await loadAllData();
        renderBallUsageTable();
        
    } catch (error) {
        console.error('볼 사용기록 삭제 오류:', error);
        showNotification('볼 사용기록 삭제 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 볼 사용기록 필터링
function filterBallUsage() {
    const dateFilter = document.getElementById('usageDateFilter').value;
    const ballFilter = document.getElementById('ballFilter').value;
    const memberFilter = document.getElementById('memberFilter').value;
    
    let filteredUsage = ballUsage;
    
    if (dateFilter) {
        filteredUsage = filteredUsage.filter(u => u.usage_date === dateFilter);
    }
    
    if (ballFilter) {
        filteredUsage = filteredUsage.filter(u => u.ball_id === ballFilter);
    }
    
    if (memberFilter) {
        filteredUsage = filteredUsage.filter(u => u.member_id === memberFilter);
    }
    
    const tbody = document.getElementById('ballUsageTableBody');
    tbody.innerHTML = '';

    filteredUsage.forEach(usage => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${usage.ball.ball_code}</td>
            <td>${usage.member.name} (${usage.member.member_code})</td>
            <td>${usage.court ? `${usage.court.name} (${usage.court.court_number})` : '-'}</td>
            <td>${usage.usage_date}</td>
            <td>${usage.usage_start_time ? `${usage.usage_start_time} - ${usage.usage_end_time || ''}` : '-'}</td>
            <td>${usage.balls_taken}</td>
            <td>${usage.balls_returned}</td>
            <td>${usage.balls_damaged}</td>
            <td>${usage.balls_lost}</td>
            <td>${getUsageTypeText(usage.usage_type)}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editBallUsage('${usage.id}')">
                    <i class="fas fa-edit"></i> 수정
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteBallUsage('${usage.id}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// ==================== 유틸리티 함수 ====================

// 모든 모달 닫기
function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
    editingId = null;
}

// 시간 차이 계산
function calculateDuration(startTime, endTime) {
    const start = new Date(`2000-01-01T${startTime}`);
    const end = new Date(`2000-01-01T${endTime}`);
    return (end - start) / (1000 * 60 * 60); // 시간 단위
}

// 셀렉트 옵션 업데이트
function updateSelectOptions() {
    // 회원 셀렉트
    const memberSelects = ['reservationMember', 'usageMember'];
    memberSelects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">회원을 선택하세요</option>';
            members.forEach(member => {
                const option = document.createElement('option');
                option.value = member.id;
                option.textContent = `${member.name} (${member.member_code})`;
                select.appendChild(option);
            });
        }
    });

    // 코트 셀렉트
    const courtSelects = ['reservationCourt', 'usageCourt', 'courtFilter'];
    courtSelects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = selectId === 'courtFilter' ? '<option value="">모든 코트</option>' : '<option value="">코트를 선택하세요</option>';
            courts.forEach(court => {
                const option = document.createElement('option');
                option.value = court.id;
                option.textContent = `${court.name} (${court.court_number})`;
                select.appendChild(option);
            });
        }
    });

    // 볼 셀렉트
    const ballSelects = ['usageBall', 'ballFilter'];
    ballSelects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = selectId === 'ballFilter' ? '<option value="">모든 볼</option>' : '<option value="">볼을 선택하세요</option>';
            balls.forEach(ball => {
                const option = document.createElement('option');
                option.value = ball.id;
                option.textContent = `${ball.ball_code} - ${ball.brand} ${ball.model || ''}`;
                select.appendChild(option);
            });
        }
    });

    // 예약 셀렉트
    const reservationSelect = document.getElementById('usageReservation');
    if (reservationSelect) {
        reservationSelect.innerHTML = '<option value="">예약을 선택하세요</option>';
        reservations.forEach(reservation => {
            const option = document.createElement('option');
            option.value = reservation.id;
            option.textContent = `${reservation.reservation_code} - ${reservation.AQ_members.name}`;
            reservationSelect.appendChild(option);
        });
    }
}

// 텍스트 변환 함수들
function getMembershipTypeText(type) {
    const types = {
        'regular': '일반',
        'premium': '프리미엄',
        'vip': 'VIP',
        'student': '학생',
        'senior': '시니어'
    };
    return types[type] || type;
}

function getSkillLevelText(level) {
    const levels = {
        'beginner': '초급',
        'intermediate': '중급',
        'advanced': '고급',
        'professional': '프로'
    };
    return levels[level] || level;
}

function getSurfaceTypeText(type) {
    const types = {
        'hard': '하드코트',
        'clay': '클레이코트',
        'grass': '잔디코트',
        'synthetic': '합성코트',
        'indoor_hard': '실내하드코트',
        'indoor_clay': '실내클레이코트'
    };
    return types[type] || type;
}

function getReservationStatusText(status) {
    const statuses = {
        'confirmed': '확정',
        'cancelled': '취소',
        'completed': '완료',
        'no_show': '노쇼'
    };
    return statuses[status] || status;
}

function getBallTypeText(type) {
    const types = {
        'regular': '일반',
        'pressureless': '무압력',
        'practice': '연습용',
        'tournament': '대회용',
        'junior': '주니어'
    };
    return types[type] || type;
}

function getBallColorText(color) {
    const colors = {
        'yellow': '노란색',
        'white': '흰색',
        'orange': '주황색',
        'green': '초록색'
    };
    return colors[color] || color;
}

function getConditionStatusText(status) {
    const statuses = {
        'new': '새것',
        'good': '양호',
        'fair': '보통',
        'poor': '나쁨',
        'damaged': '손상'
    };
    return statuses[status] || status;
}

function getUsageTypeText(type) {
    const types = {
        'rental': '대여',
        'practice': '연습',
        'lesson': '레슨',
        'tournament': '대회',
        'maintenance': '유지보수'
    };
    return types[type] || type;
}

// 탭별 테이블 렌더링 함수들
function renderCurrentTab() {
    switch(currentTab) {
        case 'members':
            renderMembersTable();
            break;
        case 'courts':
            renderCourtsTable();
            break;
        case 'reservations':
            renderReservationsTable();
            break;
        case 'balls':
            renderBallsTable();
            break;
        case 'ball-usage':
            renderBallUsageTable();
            break;
    }
}

// 데이터 새로고침
async function refreshData() {
    showLoading(true);
    try {
        await loadAllData();
        renderCurrentTab();
        showNotification('데이터가 성공적으로 새로고침되었습니다.', 'success');
    } catch (error) {
        console.error('데이터 새로고침 오류:', error);
        showNotification('데이터 새로고침 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

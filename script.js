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
        
        // 예약관리 탭을 기본으로 활성화하고 데이터 렌더링
        await switchTab('reservations');
        
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
        await Promise.all([
            loadMembers(),
            loadCourts(),
            loadReservations(),
            loadBalls(),
            loadBallUsage()
        ]);
        
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
async function switchTab(tabName) {
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
    
    // 탭별 데이터 조회 및 테이블 렌더링
    try {
        showLoading(true);
        
        switch(tabName) {
            case 'members':
                await loadMembers();
                renderMembersTable();
                break;
            case 'courts':
                await loadCourts();
                renderCourtsTable();
                break;
            case 'reservations':
                await loadReservations();
                renderReservationsTable();
                break;
            case 'balls':
                await loadBalls();
                renderBallsTable();
                break;
            case 'ball-usage':
                await loadBallUsage();
                renderBallUsageTable();
                break;
        }
        
        // 셀렉트 옵션 업데이트 (필요한 경우)
        updateSelectOptions();
        
    } catch (error) {
        console.error(`${tabName} 탭 데이터 로드 오류:`, error);
        showNotification(`${tabName} 데이터 로드 중 오류가 발생했습니다.`, 'error');
    } finally {
        showLoading(false);
    }
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

// 예약조 변경 시 코트번호 옵션 업데이트
function updateCourtNumberOptions() {
    const reservationGroup = document.getElementById('reservationGroup').value;
    const courtNumberSelect = document.getElementById('courtNumber');
    
    // 기존 옵션 제거
    courtNumberSelect.innerHTML = '<option value="">선택하세요</option>';
    
    if (reservationGroup === 'N/A') {
        // 예약조가 N/A이면 코트번호도 N/A만 선택 가능
        const option = document.createElement('option');
        option.value = 'N/A';
        option.textContent = 'N/A';
        courtNumberSelect.appendChild(option);
        
        // 자동으로 N/A 선택
        courtNumberSelect.value = 'N/A';
    } else {
        // 예약조가 정상이면 모든 코트번호 선택 가능
        const courtOptions = [
            { value: '1', text: '1번' },
            { value: '2', text: '2번' },
            { value: '3', text: '3번' },
            { value: '4', text: '4번' },
            { value: '5', text: '5번' },
            { value: '6', text: '6번' },
            { value: 'N/A', text: 'N/A' }
        ];
        
        courtOptions.forEach(court => {
            const option = document.createElement('option');
            option.value = court.value;
            option.textContent = court.text;
            courtNumberSelect.appendChild(option);
        });
    }
}
async function generateMemberCode() {
    try {
        // 현재 연도 가져오기
        const currentYear = new Date().getFullYear();
        
        // 모든 회원번호 조회 (AQ 형식과 MEM 형식 모두 고려)
        const { data, error } = await supabase
            .from('aq_members')
            .select('member_code')
            .order('member_code', { ascending: false });
        
        if (error) throw error;
        
        // AQ 형식의 회원번호 찾기
        const aqCodes = data.filter(code => code.member_code.startsWith(`AQ${currentYear}`));
        
        let nextNumber = 1;
        if (aqCodes.length > 0) {
            // 가장 큰 번호에서 +1
            const lastCode = aqCodes[0].member_code;
            const lastNumber = parseInt(lastCode.substring(6)); // AQ2024 뒤의 숫자 추출
            nextNumber = lastNumber + 1;
        }
        
        // 3자리 숫자로 포맷팅
        return `AQ${currentYear}${nextNumber.toString().padStart(3, '0')}`;
        
    } catch (error) {
        console.error('회원번호 생성 오류:', error);
        // 오류 시 기본 번호 반환
        const currentYear = new Date().getFullYear();
        return `AQ${currentYear}001`;
    }
}

// 회원 데이터 로드
async function loadMembers() {
    const { data, error } = await supabase
        .from('aq_members')
        .select('*')
        .order('reservation_group', { ascending: true })
        .order('court_number', { ascending: true })
        .order('member_code', { ascending: true });
    
    if (error) throw error;
    members = data || [];
    return members;
}

// 회원 테이블 렌더링
function renderMembersTable() {
    const tbody = document.getElementById('membersTableBody');
    tbody.innerHTML = '';

    members.forEach(member => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${member.reservation_group}</td>
            <td>${member.court_number || '-'}</td>
            <td>${member.member_code}</td>
            <td>${member.name}</td>
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
async function openMemberModal(memberId = null) {
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
        
        // 새 회원 추가 시 자동으로 회원번호 생성
        const memberCode = await generateMemberCode();
        document.getElementById('memberCode').value = memberCode;
        
        document.getElementById('membershipStartDate').value = new Date().toISOString().split('T')[0];
    }
    
    // 예약조 변경 이벤트 리스너 추가
    const reservationGroupSelect = document.getElementById('reservationGroup');
    reservationGroupSelect.removeEventListener('change', updateCourtNumberOptions);
    reservationGroupSelect.addEventListener('change', updateCourtNumberOptions);
    
    // 초기 코트번호 옵션 설정
    updateCourtNumberOptions();
    
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
    document.getElementById('reservationGroup').value = member.reservation_group;
    
    // 예약조에 따라 코트번호 옵션 업데이트
    updateCourtNumberOptions();
    
    // 코트번호 설정 (옵션 업데이트 후)
    document.getElementById('courtNumber').value = member.court_number || '';
    
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
    
    let memberCode = document.getElementById('memberCode').value;
    
    // 회원번호가 비어있으면 자동 생성
    if (!memberCode) {
        memberCode = await generateMemberCode();
    }
    
    const formData = {
        member_code: memberCode,
        name: document.getElementById('memberName').value,
        reservation_group: document.getElementById('reservationGroup').value,
        court_number: document.getElementById('courtNumber').value || null,
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
        member.reservation_group.toLowerCase().includes(searchTerm) ||
        member.court_number.toLowerCase().includes(searchTerm) ||
        member.member_code.toLowerCase().includes(searchTerm)
    );
    
    const tbody = document.getElementById('membersTableBody');
    tbody.innerHTML = '';

    filteredMembers.forEach(member => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${member.reservation_group}</td>
            <td>${member.court_number || '-'}</td>
            <td>${member.member_code}</td>
            <td>${member.name}</td>
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
    courts = data || [];
    return courts;
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
            aq_members!member_id(name, member_code),
            aq_courts!court_id(name, court_number)
        `)
        .order('reservation_date', { ascending: true });
    
    if (error) throw error;
    
    // 클라이언트 사이드에서 코트번호별로 추가 정렬
    reservations = (data || []).sort((a, b) => {
        // 먼저 예약일로 정렬 (이미 DB에서 오름차순 정렬됨)
        const dateA = new Date(a.reservation_date);
        const dateB = new Date(b.reservation_date);
        if (dateA.getTime() !== dateB.getTime()) {
            return dateA.getTime() - dateB.getTime(); // 오름차순
        }
        
        // 같은 날짜면 코트번호로 정렬 (오름차순)
        const courtA = parseInt(a.aq_courts?.court_number || '0');
        const courtB = parseInt(b.aq_courts?.court_number || '0');
        
        // 코트번호가 숫자가 아닌 경우 문자열로 비교
        if (isNaN(courtA) || isNaN(courtB)) {
            const courtStrA = a.aq_courts?.court_number || '';
            const courtStrB = b.aq_courts?.court_number || '';
            return courtStrA.localeCompare(courtStrB);
        }
        
        return courtA - courtB;
    });
    
    return reservations;
}

// 요일 구하기 함수
function getDayOfWeek(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[date.getDay()];
}

// 예약 테이블 렌더링
function renderReservationsTable() {
    const tbody = document.getElementById('reservationsTableBody');
    tbody.innerHTML = '';

    reservations.forEach(reservation => {
        const row = document.createElement('tr');
        const gameDateWithDay = reservation.game_date ? `${reservation.game_date} (${getDayOfWeek(reservation.game_date)})` : '-';
        
        // 예약일에 따른 배경색 클래스 추가
        const reservationDate = new Date(reservation.reservation_date);
        const today = new Date();
        const diffTime = reservationDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let dateClass = '';
        if (diffDays < 0) {
            dateClass = 'date-past'; // 과거
        } else if (diffDays === 0) {
            dateClass = 'date-today'; // 오늘
        } else if (diffDays === 1) {
            dateClass = 'date-tomorrow'; // 내일
        } else if (diffDays <= 7) {
            dateClass = 'date-week'; // 이번 주
        } else {
            dateClass = 'date-future'; // 미래
        }
        
        row.className = dateClass;
        
        // 시간 형식을 간단하게 변환 (08:00 -> 8시)
        const startTime = reservation.start_time;
        const simpleTime = startTime ? `${parseInt(startTime.split(':')[0])}시` : '-';
        
        row.innerHTML = `
            <td>${reservation.reservation_date}</td>
            <td>${reservation.aq_courts?.name || '알 수 없는 코트'} (${reservation.aq_courts?.court_number || '-'})</td>
            <td>${reservation.aq_members?.name || '알 수 없는 회원'} (${reservation.aq_members?.member_code || '-'})</td>
            <td>${gameDateWithDay}</td>
            <td>${simpleTime}</td>
            <td>${reservation.guest_count}명</td>
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

// 시작시간으로부터 종료시간 계산 (2시간 후)
function calculateEndTime(startTime) {
    if (!startTime) return '';
    
    const [hours, minutes] = startTime.split(':').map(Number);
    const startMinutes = hours * 60 + minutes;
    const endMinutes = startMinutes + 120; // 2시간 = 120분
    
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    
    return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
}
function updateGameDate() {
    const reservationDate = document.getElementById('reservationDate').value;
    if (reservationDate) {
        const reservationDateObj = new Date(reservationDate);
        const gameDateObj = new Date(reservationDateObj);
        gameDateObj.setDate(gameDateObj.getDate() + 3); // 예약일 + 3일
        
        const gameDate = gameDateObj.toISOString().split('T')[0];
        document.getElementById('gameDate').value = gameDate;
    } else {
        document.getElementById('gameDate').value = '';
    }
}
async function generateReservationCode() {
    try {
        // 현재 연도와 월 가져오기
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        
        // 해당 연월의 기존 예약번호들 조회
        const { data, error } = await supabase
            .from('aq_reservations')
            .select('reservation_code')
            .like('reservation_code', `RES${year}${month}%`)
            .order('reservation_code', { ascending: false });
        
        if (error) throw error;
        
        // 다음 번호 계산
        let nextNumber = 1;
        if (data && data.length > 0) {
            // 가장 큰 번호에서 +1
            const lastCode = data[0].reservation_code;
            const lastNumber = parseInt(lastCode.substring(9)); // RES202412 뒤의 숫자 추출
            nextNumber = lastNumber + 1;
        }
        
        // 3자리 숫자로 포맷팅
        return `RES${year}${month}${nextNumber.toString().padStart(3, '0')}`;
        
    } catch (error) {
        console.error('예약번호 생성 오류:', error);
        // 오류 시 기본 번호 반환
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        return `RES${year}${month}001`;
    }
}

// 예약 모달 열기
async function openReservationModal(reservationId = null) {
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
        
        // 새 예약 추가 시 자동으로 예약번호 생성
        const reservationCode = await generateReservationCode();
        document.getElementById('reservationCode').value = reservationCode;
        
        // 내일 날짜로 설정
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        document.getElementById('reservationDate').value = tomorrow.toISOString().split('T')[0];
        
        // 시간 디폴트를 8시로 설정
        document.getElementById('startTime').value = '08:00';
        
        // 상태 디폴트를 예약전으로 설정
        document.getElementById('reservationStatus').value = 'pending';
        
        // 예약일 변경 이벤트 리스너 추가
        const reservationDateInput = document.getElementById('reservationDate');
        reservationDateInput.removeEventListener('change', updateGameDate);
        reservationDateInput.addEventListener('change', updateGameDate);
        
        // 초기 경기일 설정
        updateGameDate();
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
    document.getElementById('gameDate').value = reservation.game_date || '';
    document.getElementById('startTime').value = reservation.start_time;
    document.getElementById('guestCount').value = reservation.guest_count;
    document.getElementById('specialRequests').value = reservation.special_requests || '';
    document.getElementById('reservationStatus').value = reservation.reservation_status || 'pending';
    
    // 예약일 변경 이벤트 리스너 추가
    const reservationDateInput = document.getElementById('reservationDate');
    reservationDateInput.removeEventListener('change', updateGameDate);
    reservationDateInput.addEventListener('change', updateGameDate);
}

// 예약 중복 체크
async function checkReservationConflict(courtId, reservationDate, startTime, endTime, excludeId = null) {
    try {
        let query = supabase
            .from('aq_reservations')
            .select('id, reservation_code, start_time, end_time')
            .eq('court_id', courtId)
            .eq('reservation_date', reservationDate)
            .in('reservation_status', ['confirmed', 'pending']); // 확정되거나 대기 중인 예약만 체크
        
        if (excludeId) {
            query = query.neq('id', excludeId);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        // 시간 겹침 체크
        for (const reservation of data || []) {
            const existingStart = reservation.start_time;
            const existingEnd = reservation.end_time;
            
            // 시간이 겹치는지 체크
            if ((startTime < existingEnd && endTime > existingStart)) {
                return {
                    conflict: true,
                    conflictingReservation: reservation
                };
            }
        }
        
        return { conflict: false };
        
    } catch (error) {
        console.error('예약 중복 체크 오류:', error);
        return { conflict: false }; // 오류 시 체크를 건너뛰고 진행
    }
}

// 예약 폼 제출 처리
async function handleReservationSubmit(e) {
    e.preventDefault();
    
    let reservationCode = document.getElementById('reservationCode').value;
    
    // 예약번호가 비어있으면 자동 생성
    if (!reservationCode) {
        reservationCode = await generateReservationCode();
    }
    
    const startTime = document.getElementById('startTime').value;
    const endTime = calculateEndTime(startTime); // 시작시간 + 2시간
    
    const formData = {
        reservation_code: reservationCode,
        member_id: document.getElementById('reservationMember').value,
        court_id: document.getElementById('reservationCourt').value,
        reservation_date: document.getElementById('reservationDate').value,
        game_date: document.getElementById('gameDate').value,
        start_time: startTime,
        end_time: endTime,
        duration_hours: 2, // 고정 2시간
        guest_count: parseInt(document.getElementById('guestCount').value),
        special_requests: document.getElementById('specialRequests').value || null,
        reservation_status: document.getElementById('reservationStatus').value
    };

    try {
        showLoading(true);
        
        // 새 예약 추가 시에만 중복 체크
        if (!editingId) {
            const conflictCheck = await checkReservationConflict(
                formData.court_id,
                formData.reservation_date,
                formData.start_time,
                formData.end_time
            );
            
            if (conflictCheck.conflict) {
                const conflictingReservation = conflictCheck.conflictingReservation;
                showNotification(
                    `해당 코트의 ${formData.start_time}-${formData.end_time} 시간대에 이미 예약이 있습니다. (예약번호: ${conflictingReservation.reservation_code})`,
                    'error'
                );
                return;
            }
        }
        
        if (editingId) {
            // 수정 시에도 중복 체크 (자기 자신 제외)
            const conflictCheck = await checkReservationConflict(
                formData.court_id,
                formData.reservation_date,
                formData.start_time,
                formData.end_time,
                editingId
            );
            
            if (conflictCheck.conflict) {
                const conflictingReservation = conflictCheck.conflictingReservation;
                showNotification(
                    `해당 코트의 ${formData.start_time}-${formData.end_time} 시간대에 이미 예약이 있습니다. (예약번호: ${conflictingReservation.reservation_code})`,
                    'error'
                );
                return;
            }
            
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
        
        // 데이터베이스 제약조건 위반 에러 처리
        if (error.code === '23505') {
            if (error.message.includes('idx_aq_reservations_court_time_unique')) {
                showNotification('해당 코트의 해당 시간대에 이미 예약이 있습니다. 다른 시간을 선택해주세요.', 'error');
            } else {
                showNotification('중복된 데이터가 있습니다. 다시 확인해주세요.', 'error');
            }
        } else {
            showNotification('예약 저장 중 오류가 발생했습니다.', 'error');
        }
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
    balls = data || [];
    return balls;
}

// 볼 테이블 렌더링
function renderBallsTable() {
    const tbody = document.getElementById('ballsTableBody');
    tbody.innerHTML = '';

    balls.forEach(ball => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${ball.ball_code}</td>
            <td>${ball.owner || '-'}</td>
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
    document.getElementById('ballOwner').value = ball.owner || '';
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
        owner: document.getElementById('ballOwner').value || null,
        color: document.getElementById('ballColor').value,
        condition_status: document.getElementById('conditionStatus').value,
        purchase_date: document.getElementById('purchaseDate').value || null,
        purchase_price: document.getElementById('purchasePrice').value ? parseFloat(document.getElementById('purchasePrice').value) : null,
        supplier: document.getElementById('supplier').value || null,
        quantity_total: parseInt(document.getElementById('quantityTotal').value),
        quantity_available: parseInt(document.getElementById('quantityTotal').value),
        quantity_in_use: 0,
        quantity_damaged: 0,
        storage_location: document.getElementById('storageLocation').value || null,
        notes: document.getElementById('ballNotes').value || null
    };

    try {
        showLoading(true);
        
        if (editingId) {
            // 수정 시에는 quantity_in_use와 quantity_damaged를 제외
            const updateData = { ...formData };
            delete updateData.quantity_in_use;
            delete updateData.quantity_damaged;
            
            const { error } = await supabase
                .from('aq_tennis_balls')
                .update(updateData)
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
    ballUsage = data || [];
    return ballUsage;
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
            <td>${usage.usage_date}</td>
            <td>${usage.balls_taken}</td>
            <td>${usage.balls_returned}</td>
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
    document.getElementById('usageDate').value = usage.usage_date;
    document.getElementById('ballsTaken').value = usage.balls_taken;
    document.getElementById('ballsReturned').value = usage.balls_returned;
    document.getElementById('usageNotes').value = usage.notes || '';
}

// 볼 사용기록 폼 제출 처리
async function handleBallUsageSubmit(e) {
    e.preventDefault();
    
    const formData = {
        ball_id: document.getElementById('usageBall').value,
        member_id: document.getElementById('usageMember').value,
        usage_date: document.getElementById('usageDate').value,
        balls_taken: parseInt(document.getElementById('ballsTaken').value),
        balls_returned: parseInt(document.getElementById('ballsReturned').value),
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
            
            if (selectId === 'usageMember') {
                // 볼 사용기록에서는 거북코, 참치, 청새치만 표시
                const specificMembers = members.filter(member => 
                    member.name === '거북코' || member.name === '참치' || member.name === '청새치'
                );
                
                specificMembers.forEach(member => {
                    const option = document.createElement('option');
                    option.value = member.id;
                    option.textContent = `${member.name} (${member.member_code})`;
                    select.appendChild(option);
                });
            } else {
                // 예약관리에서는 모든 회원 표시
                members.forEach(member => {
                    const option = document.createElement('option');
                    option.value = member.id;
                    option.textContent = `${member.name} (${member.member_code})`;
                    select.appendChild(option);
                });
            }
        }
    });

    // 코트 셀렉트 (예약관리만)
    const courtSelects = ['reservationCourt', 'courtFilter'];
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
        'pending': '예약전',
        'success': '성공',
        'cancelled': '취소',
        'failed': '실패'
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

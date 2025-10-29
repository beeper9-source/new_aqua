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
let ballInventory = [];
let ballUsageRecords = [];
let tempTodayUsage = {}; // 임시 저장용: {memberId: quantity}

// 버전 관리
const VERSION_KEY = 'aqua_tennis_version';

// 버전 초기화 및 업데이트
async function initializeVersion() {
    try {
        // 현재 활성 버전 조회
        const { data: currentVersionData, error: fetchError } = await supabase
            .from('aq_version_management')
            .select('version_number')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        
        if (fetchError && fetchError.code !== 'PGRST116') {
            throw fetchError;
        }
        
        let currentVersion;
        
        if (currentVersionData) {
            // 기존 버전이 있으면 패치 버전 증가
            const versionParts = currentVersionData.version_number.split('.');
            const major = parseInt(versionParts[0]);
            const minor = parseInt(versionParts[1]);
            const patch = parseInt(versionParts[2]) + 1; // 패치 버전 증가
            
            currentVersion = `${major}.${minor}.${patch}`;
            
            // 새 버전을 데이터베이스에 저장
            const { error: insertError } = await supabase
                .from('aq_version_management')
                .insert([{
                    version_number: currentVersion,
                    release_notes: `Auto-increment patch version ${patch}`,
                    created_by: 'system'
                }]);
            
            if (insertError) {
                console.error('버전 저장 오류:', insertError);
                // 오류 시 기존 버전 사용
                currentVersion = currentVersionData.version_number;
            }
        } else {
            // 첫 실행 시 초기 버전 설정
            currentVersion = '1.0.0';
            
            const { error: insertError } = await supabase
                .from('aq_version_management')
                .insert([{
                    version_number: currentVersion,
                    release_notes: 'Initial release',
                    created_by: 'system'
                }]);
            
            if (insertError) {
                console.error('초기 버전 저장 오류:', insertError);
            }
        }
        
        // 로컬 스토리지에도 저장 (오프라인 대비)
        localStorage.setItem(VERSION_KEY, currentVersion);
        
        // 버전 표시 업데이트
        const versionElement = document.getElementById('versionNumber');
        if (versionElement) {
            versionElement.textContent = currentVersion;
        }
        
        console.log(`Aqua Tennis Club v${currentVersion}`);
        return currentVersion;
        
    } catch (error) {
        console.error('버전 초기화 오류:', error);
        
        // 오류 시 로컬 스토리지에서 버전 가져오기
        let fallbackVersion = localStorage.getItem(VERSION_KEY);
        if (!fallbackVersion) {
            fallbackVersion = '1.0.0';
            localStorage.setItem(VERSION_KEY, fallbackVersion);
        }
        
        const versionElement = document.getElementById('versionNumber');
        if (versionElement) {
            versionElement.textContent = fallbackVersion;
        }
        
        return fallbackVersion;
    }
}

// 버전 히스토리 조회
async function getVersionHistory() {
    try {
        const { data, error } = await supabase
            .from('aq_version_management')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('버전 히스토리 조회 오류:', error);
        return [];
    }
}

// 특정 버전으로 롤백
async function rollbackToVersion(versionNumber) {
    try {
        // 모든 버전을 비활성화
        const { error: deactivateError } = await supabase
            .from('aq_version_management')
            .update({ is_active: false })
            .neq('version_number', versionNumber);
        
        if (deactivateError) throw deactivateError;
        
        // 선택된 버전을 활성화
        const { error: activateError } = await supabase
            .from('aq_version_management')
            .update({ is_active: true })
            .eq('version_number', versionNumber);
        
        if (activateError) throw activateError;
        
        // 로컬 스토리지 업데이트
        localStorage.setItem(VERSION_KEY, versionNumber);
        
        // UI 업데이트
        const versionElement = document.getElementById('versionNumber');
        if (versionElement) {
            versionElement.textContent = versionNumber;
        }
        
        showNotification(`버전 ${versionNumber}으로 롤백되었습니다.`, 'success');
        return true;
    } catch (error) {
        console.error('버전 롤백 오류:', error);
        showNotification('버전 롤백 중 오류가 발생했습니다.', 'error');
        return false;
    }
}

// 수동 버전 생성
async function createNewVersion(versionNumber, releaseNotes = '') {
    try {
        const { error } = await supabase
            .from('aq_version_management')
            .insert([{
                version_number: versionNumber,
                release_notes: releaseNotes || `Manual version creation: ${versionNumber}`,
                created_by: 'manual'
            }]);
        
        if (error) throw error;
        
        showNotification(`새 버전 ${versionNumber}이 생성되었습니다.`, 'success');
        return true;
    } catch (error) {
        console.error('버전 생성 오류:', error);
        showNotification('버전 생성 중 오류가 발생했습니다.', 'error');
        return false;
    }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// 앱 초기화
async function initializeApp() {
    showLoading(true);
    try {
        // 버전 초기화
        const currentVersion = await initializeVersion();
        
        await loadAllData();
        setupEventListeners();
        
        // 예약관리 탭을 기본으로 활성화하고 데이터 렌더링
        await switchTab('reservations');
        
        showNotification(`앱이 성공적으로 로드되었습니다. (v${currentVersion})`, 'success');
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
            loadBallInventory(),
            loadBallUsageRecords()
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
    document.getElementById('ballInventoryForm').addEventListener('submit', handleBallInventorySubmit);
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
                await loadBallInventory();
                renderBallInventoryTable();
                break;
        case 'ball-usage':
            await loadBallUsageRecords();
            // 임시 저장 초기화
            tempTodayUsage = {};
            renderBallUsageInputTable();
            renderBallUsageHistoryTable();
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
            <td>${reservation.aq_courts?.name || '알 수 없는 코트'}</td>
            <td>${reservation.aq_members?.name || '알 수 없는 회원'}</td>
            <td>${gameDateWithDay}</td>
            <td>${simpleTime}</td>
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
            <td>${reservation.aq_courts?.name || '알 수 없는 코트'}</td>
            <td>${reservation.aq_members?.name || '알 수 없는 회원'}</td>
            <td>${gameDateWithDay}</td>
            <td>${simpleTime}</td>
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

// ==================== 볼 재고 관리 ====================

// 볼 재고 데이터 로드
async function loadBallInventory() {
    const { data, error } = await supabase
        .from('aq_ball_inventory')
        .select(`
            *,
            aq_members!member_id(name, member_code)
        `)
        .eq('is_active', true)
        .order('aq_members(name)', { ascending: true });
    
    if (error) throw error;
    ballInventory = data || [];
    return ballInventory;
}

// 볼 재고 테이블 렌더링
function renderBallInventoryTable() {
    const tbody = document.getElementById('ballInventoryTableBody');
    tbody.innerHTML = '';

    ballInventory.forEach(inventory => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${inventory.id}</td>
            <td>${inventory.aq_members?.name || '알 수 없는 회원'}</td>
            <td>${inventory.total_quantity}개</td>
            <td>${inventory.used_quantity}개</td>
            <td>${inventory.available_quantity}개</td>
            <td>
                <input type="text" 
                       class="notes-input" 
                       value="${inventory.notes || ''}" 
                       placeholder="메모 입력"
                       data-inventory-id="${inventory.id}"
                       onchange="updateInventoryNotes('${inventory.id}', this.value)"
                       style="width: 120px; padding: 4px; border: 1px solid #ddd; border-radius: 4px;">
            </td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editBallInventory('${inventory.id}')">
                    <i class="fas fa-edit"></i> 수정
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteBallInventory('${inventory.id}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 볼 재고 모달 열기
function openBallInventoryModal(inventoryId = null) {
    editingId = inventoryId;
    const modal = document.getElementById('ballInventoryModal');
    const title = document.getElementById('ballInventoryModalTitle');
    const memberSelectGroup = document.getElementById('inventoryMember').parentElement;
    const memberDisplayGroup = document.getElementById('memberDisplayGroup');
    
    if (inventoryId) {
        title.textContent = '볼 재고 수정';
        const inventory = ballInventory.find(i => i.id === inventoryId);
        if (inventory) {
            // 수정 시에도 회원 선택을 보여줌 (회원 변경 가능)
            memberSelectGroup.style.display = 'block';
            memberDisplayGroup.style.display = 'none';
            
            // 회원 셀렉트 옵션 업데이트 후 폼 데이터 채우기
            updateSelectOptions();
            fillBallInventoryForm(inventoryId);
        }
    } else {
        title.textContent = '볼 재고 추가';
        // 새로 추가 시에는 회원 선택을 보여줌
        memberSelectGroup.style.display = 'block';
        memberDisplayGroup.style.display = 'none';
        
        // 회원 셀렉트 옵션 업데이트
        updateSelectOptions();
        document.getElementById('ballInventoryForm').reset();
    }
    
    modal.style.display = 'block';
}

// 볼 재고 모달 닫기
function closeBallInventoryModal() {
    document.getElementById('ballInventoryModal').style.display = 'none';
    editingId = null;
}

// 볼 재고 폼 채우기
function fillBallInventoryForm(inventoryId) {
    // 해당 재고 정보 찾기
    const inventory = ballInventory.find(i => i.id === inventoryId);
    if (!inventory) {
        console.error('재고 정보를 찾을 수 없습니다:', inventoryId);
        return;
    }
    
    // 폼 데이터 채우기
    document.getElementById('inventoryMember').value = inventory.member_id;
    document.getElementById('totalQuantity').value = inventory.total_quantity;
    document.getElementById('inventoryNotes').value = inventory.notes || '';
}

// 볼 재고 폼 제출 처리
async function handleBallInventorySubmit(e) {
    e.preventDefault();
    
    // 모든 경우에 셀렉트 값을 사용 (수정 시에도 회원 변경 가능)
    const memberId = document.getElementById('inventoryMember').value;
    
    const formData = {
        member_id: memberId,
        total_quantity: parseInt(document.getElementById('totalQuantity').value),
        notes: document.getElementById('inventoryNotes').value || null
    };

    try {
        showLoading(true);
        
        if (editingId) {
            const { error } = await supabase
                .from('aq_ball_inventory')
                .update(formData)
                .eq('id', editingId);
                
            if (error) throw error;
            showNotification('볼 재고 정보가 성공적으로 수정되었습니다.', 'success');
        } else {
            // 새 재고 추가 시 해당 회원의 기존 재고가 있는지 확인
            const { data: existingInventory, error: checkError } = await supabase
                .from('aq_ball_inventory')
                .select('id')
                .eq('member_id', formData.member_id)
                .eq('is_active', true)
                .single();
            
            if (checkError && checkError.code !== 'PGRST116') {
                throw checkError;
            }
            
            if (existingInventory) {
                // 기존 재고가 있으면 업데이트
                const { error: updateError } = await supabase
                    .from('aq_ball_inventory')
                    .update(formData)
                    .eq('id', existingInventory.id);
                
                if (updateError) throw updateError;
                showNotification('볼 재고 정보가 성공적으로 업데이트되었습니다.', 'success');
            } else {
                // 새 재고 생성
                const { error: insertError } = await supabase
                    .from('aq_ball_inventory')
                    .insert([formData]);
                
                if (insertError) throw insertError;
                showNotification('새 볼 재고가 성공적으로 추가되었습니다.', 'success');
            }
        }
        
        await loadAllData();
        renderBallInventoryTable();
        closeBallInventoryModal();
        
    } catch (error) {
        console.error('볼 재고 저장 오류:', error);
        showNotification('볼 재고 저장 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 볼 재고 수정
function editBallInventory(inventoryId) {
    openBallInventoryModal(inventoryId);
}

// 총 갯수 업데이트
// 총 갯수 업데이트 (비활성화됨 - 직접 수정 불가)
async function updateTotalQuantity(inventoryId, newQuantity) {
    // 총 갯수는 직접 수정할 수 없습니다. 모달을 통해 수정해주세요.
    alert('총 갯수는 직접 수정할 수 없습니다. 수정 버튼을 클릭하여 모달에서 수정해주세요.');
    return;
}

// 메모 업데이트
async function updateInventoryNotes(inventoryId, newNotes) {
    try {
        const { error } = await supabase
            .from('aq_ball_inventory')
            .update({ notes: newNotes || null })
            .eq('id', inventoryId);
        
        if (error) throw error;
        
        showNotification('메모가 업데이트되었습니다.', 'success');
        
        // 데이터 새로고침 후 테이블 다시 렌더링
        await loadBallInventory();
        renderBallInventoryTable();
        
    } catch (error) {
        console.error('메모 업데이트 오류:', error);
        showNotification('메모 업데이트 중 오류가 발생했습니다.', 'error');
    }
}

// 볼 재고 삭제
async function deleteBallInventory(inventoryId) {
    if (!confirm('정말로 이 볼 재고를 삭제하시겠습니까?')) return;
    
    try {
        showLoading(true);
        
        const { error } = await supabase
            .from('aq_ball_inventory')
            .update({ is_active: false })
            .eq('id', inventoryId);
        
        if (error) throw error;
        
        showNotification('볼 재고가 성공적으로 삭제되었습니다.', 'success');
        await loadAllData();
        renderBallInventoryTable();
        
    } catch (error) {
        console.error('볼 재고 삭제 오류:', error);
        showNotification('볼 재고 삭제 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== 볼 사용기록 관리 ====================

// 볼 사용기록 데이터 로드
async function loadBallUsageRecords() {
    const { data, error } = await supabase
        .from('aq_ball_usage_records')
        .select(`
            *,
            aq_members!member_id(name, member_code)
        `)
        .order('usage_date', { ascending: false });
    
    if (error) throw error;
    ballUsageRecords = data || [];
    return ballUsageRecords;
}

// 볼 사용기록 입력 테이블 렌더링 (오늘 사용 갯수)
function renderBallUsageInputTable() {
    const tbody = document.getElementById('ballUsageInputTableBody');
    tbody.innerHTML = '';

    // 오늘 날짜
    const today = new Date().toISOString().split('T')[0];
    
    // 볼이 있는 회원들만 필터링
    const membersWithBalls = members.filter(member => {
        return ballInventory.some(inventory => 
            inventory.member_id === member.id && 
            inventory.available_quantity > 0
        );
    });

    membersWithBalls.forEach(member => {
        // 해당 회원의 오늘 사용 기록 찾기 (데이터베이스에서)
        const todayUsage = ballUsageRecords.find(usage => 
            usage.member_id === member.id && 
            usage.usage_date === today
        );
        
        // 임시 저장에서 현재 값 가져오기
        const tempQuantity = tempTodayUsage[member.id] || 0;
        
        // 표시할 사용량 (임시 저장이 있으면 임시 저장 값, 없으면 데이터베이스 값)
        const displayQuantity = tempQuantity > 0 ? tempQuantity : (todayUsage ? todayUsage.quantity_used : 0);
        
        // 해당 회원의 총 사용 갯수 계산
        const totalUsed = ballUsageRecords
            .filter(usage => usage.member_id === member.id)
            .reduce((sum, usage) => sum + usage.quantity_used, 0);
        
        // 해당 회원의 볼 재고 정보
        const inventory = ballInventory.find(inv => inv.member_id === member.id);
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${member.name} (${member.member_code})</td>
            <td>
                <div class="quantity-controls">
                    <button class="btn btn-sm btn-outline-danger" 
                            onclick="decreaseTodayUsage('${member.id}')"
                            ${displayQuantity <= 0 ? 'disabled' : ''}>
                        <i class="fas fa-minus"></i>
                    </button>
                    <span class="quantity-display">${displayQuantity}</span>
                    <button class="btn btn-sm btn-outline-success" 
                            onclick="increaseTodayUsage('${member.id}')"
                            ${!inventory || inventory.available_quantity <= 0 ? 'disabled' : ''}>
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </td>
            <td>
                <button class="btn btn-sm btn-success" 
                        onclick="saveTodayUsage('${member.id}')"
                        ${tempQuantity <= 0 ? 'disabled' : ''}>
                    <i class="fas fa-save"></i> 저장
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 볼 사용기록 이력 테이블 렌더링
function renderBallUsageHistoryTable() {
    const tbody = document.getElementById('ballUsageHistoryTableBody');
    tbody.innerHTML = '';

    ballUsageRecords.forEach(usage => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${usage.aq_members?.name || '알 수 없는 회원'}</td>
            <td>${usage.usage_date}</td>
            <td>${usage.quantity_used}개</td>
            <td>${usage.notes || '-'}</td>
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

// 오늘 볼 사용량 증가 (임시 저장)
function increaseTodayUsage(memberId) {
    // 해당 회원의 볼 재고 확인
    const inventory = ballInventory.find(inv => inv.member_id === memberId);
    if (!inventory || inventory.available_quantity <= 0) {
        alert('사용 가능한 볼이 없습니다.');
        return;
    }
    
    // 임시 저장에서 현재 값 가져오기
    const currentQuantity = tempTodayUsage[memberId] || 0;
    
    // 임시 저장에 1 증가
    tempTodayUsage[memberId] = currentQuantity + 1;
    
    // 테이블만 다시 렌더링 (데이터베이스 저장은 하지 않음)
    renderBallUsageInputTable();
}

// 오늘 볼 사용량 감소 (임시 저장)
function decreaseTodayUsage(memberId) {
    // 임시 저장에서 현재 값 가져오기
    const currentQuantity = tempTodayUsage[memberId] || 0;
    
    if (currentQuantity <= 0) {
        alert('감소할 사용량이 없습니다.');
        return;
    }
    
    // 임시 저장에서 1 감소
    tempTodayUsage[memberId] = currentQuantity - 1;
    
    // 0이 되면 임시 저장에서 제거
    if (tempTodayUsage[memberId] === 0) {
        delete tempTodayUsage[memberId];
    }
    
    // 테이블만 다시 렌더링 (데이터베이스 저장은 하지 않음)
    renderBallUsageInputTable();
}

// 오늘 볼 사용량 저장
async function saveTodayUsage(memberId) {
    const today = new Date().toISOString().split('T')[0];
    
    try {
        // 임시 저장에서 사용량 가져오기
        const tempQuantity = tempTodayUsage[memberId] || 0;
        
        if (tempQuantity <= 0) {
            alert('저장할 사용량이 없습니다.');
            return;
        }
        
        // 기존 오늘 사용 기록 찾기
        const existingUsage = ballUsageRecords.find(usage => 
            usage.member_id === memberId && 
            usage.usage_date === today
        );
        
        if (existingUsage) {
            // 기존 기록 업데이트
            const { error } = await supabase
                .from('aq_ball_usage_records')
                .update({ quantity_used: tempQuantity })
                .eq('id', existingUsage.id);
            
            if (error) throw error;
        } else {
            // 새 기록 생성
            const { error } = await supabase
                .from('aq_ball_usage_records')
                .insert({
                    member_id: memberId,
                    usage_date: today,
                    quantity_used: tempQuantity,
                    notes: '간편 입력'
                });
            
            if (error) throw error;
        }
        
        // 임시 저장에서 제거
        delete tempTodayUsage[memberId];
        
        // 저장 완료 메시지
        alert(`${tempQuantity}개의 볼 사용이 저장되었습니다.`);
        
        // 데이터 새로고침
        await loadBallUsageRecords();
        await loadBallInventory();
        renderBallUsageInputTable();
        renderBallUsageHistoryTable();
        
    } catch (error) {
        console.error('볼 사용량 저장 오류:', error);
        alert('볼 사용량 저장 중 오류가 발생했습니다.');
    }
}

// 회원의 모든 볼 사용기록 삭제 (이력 테이블에서 사용)
async function deleteAllUsage(memberId) {
    if (!confirm('해당 회원의 모든 볼 사용기록을 삭제하시겠습니까?')) {
        return;
    }
    
    try {
        const { error } = await supabase
            .from('aq_ball_usage_records')
            .delete()
            .eq('member_id', memberId);
        
        if (error) throw error;
        
        // 데이터 새로고침
        await loadBallUsageRecords();
        await loadBallInventory();
        renderBallUsageInputTable();
        renderBallUsageHistoryTable();
        
        alert('모든 볼 사용기록이 삭제되었습니다.');
        
    } catch (error) {
        console.error('볼 사용기록 삭제 오류:', error);
        alert('볼 사용기록 삭제 중 오류가 발생했습니다.');
    }
}

// 볼 사용기록 모달 열기
function openBallUsageModal(usageId = null) {
    editingId = usageId;
    const modal = document.getElementById('ballUsageModal');
    const title = document.getElementById('ballUsageModalTitle');
    
    if (usageId) {
        title.textContent = '볼 사용기록 수정';
        const usage = ballUsageRecords.find(u => u.id === usageId);
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
    // 회원 셀렉트 옵션을 먼저 업데이트
    updateSelectOptions();
    
    // 폼 데이터 채우기
    document.getElementById('usageMember').value = usage.member_id;
    document.getElementById('usageDate').value = usage.usage_date;
    document.getElementById('quantityUsed').value = usage.quantity_used;
    document.getElementById('usageNotes').value = usage.notes || '';
    
    // 사용 가능한 갯수 업데이트
    updateAvailableQuantity();
}

// 볼 사용기록 폼 제출 처리
async function handleBallUsageSubmit(e) {
    e.preventDefault();
    
    const formData = {
        member_id: document.getElementById('usageMember').value,
        usage_date: document.getElementById('usageDate').value,
        quantity_used: parseInt(document.getElementById('quantityUsed').value),
        notes: document.getElementById('usageNotes').value || null
    };

    try {
        showLoading(true);
        
        // 사용 가능한 갯수 확인
        const { data: inventory, error: inventoryError } = await supabase
            .from('aq_ball_inventory')
            .select('available_quantity')
            .eq('member_id', formData.member_id)
            .eq('is_active', true)
            .single();
        
        if (inventoryError) {
            throw new Error('해당 회원의 볼 재고 정보를 찾을 수 없습니다.');
        }
        
        if (formData.quantity_used > inventory.available_quantity) {
            showNotification(`사용 가능한 볼 갯수(${inventory.available_quantity}개)를 초과했습니다.`, 'error');
            return;
        }
        
        if (editingId) {
            // 수정 시에는 기존 사용량을 되돌리고 새로 적용
            const { data: oldUsage, error: oldUsageError } = await supabase
                .from('aq_ball_usage_records')
                .select('quantity_used')
                .eq('id', editingId)
                .single();
            
            if (oldUsageError) throw oldUsageError;
            
            // 기존 사용량 되돌리기
            await supabase
                .from('aq_ball_inventory')
                .update({ 
                    used_quantity: used_quantity - oldUsage.quantity_used 
                })
                .eq('member_id', formData.member_id)
                .eq('is_active', true);
            
            // 새 사용량 적용
            await supabase
                .from('aq_ball_inventory')
                .update({ 
                    used_quantity: used_quantity + formData.quantity_used 
                })
                .eq('member_id', formData.member_id)
                .eq('is_active', true);
            
            const { error } = await supabase
                .from('aq_ball_usage_records')
                .update(formData)
                .eq('id', editingId);
                
            if (error) throw error;
            showNotification('볼 사용기록이 성공적으로 수정되었습니다.', 'success');
        } else {
            // 새 사용기록 추가 (트리거가 자동으로 재고 업데이트)
            const { error } = await supabase
                .from('aq_ball_usage_records')
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
        
        // 사용기록 삭제 전에 사용량을 재고에서 되돌려야 함
        const { data: usage, error: usageError } = await supabase
            .from('aq_ball_usage_records')
            .select('member_id, quantity_used')
            .eq('id', usageId)
            .single();
        
        if (usageError) throw usageError;
        
        // 현재 재고의 used_quantity 값 가져오기
        const { data: inventory, error: inventoryError } = await supabase
            .from('aq_ball_inventory')
            .select('used_quantity')
            .eq('member_id', usage.member_id)
            .eq('is_active', true)
            .single();
        
        if (inventoryError) throw inventoryError;
        
        // 재고에서 사용량 되돌리기
        await supabase
            .from('aq_ball_inventory')
            .update({ 
                used_quantity: inventory.used_quantity - usage.quantity_used 
            })
            .eq('member_id', usage.member_id)
            .eq('is_active', true);
        
        // 사용기록 삭제
        const { error } = await supabase
            .from('aq_ball_usage_records')
            .delete()
            .eq('id', usageId);
        
        if (error) throw error;
        
        showNotification('볼 사용기록이 성공적으로 삭제되었습니다.', 'success');
        await loadAllData();
        renderBallUsageInputTable();
        renderBallUsageHistoryTable();
        
    } catch (error) {
        console.error('볼 사용기록 삭제 오류:', error);
        showNotification('볼 사용기록 삭제 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 사용 가능한 갯수 업데이트
async function updateAvailableQuantity() {
    const memberId = document.getElementById('usageMember').value;
    const availableDisplay = document.getElementById('availableQuantityDisplay');
    
    if (!memberId) {
        availableDisplay.textContent = '0';
        return;
    }
    
    try {
        const { data: inventory, error } = await supabase
            .from('aq_ball_inventory')
            .select('available_quantity')
            .eq('member_id', memberId)
            .eq('is_active', true)
            .single();
        
        if (error) {
            availableDisplay.textContent = '0';
            return;
        }
        
        availableDisplay.textContent = inventory.available_quantity || '0';
    } catch (error) {
        console.error('사용 가능한 갯수 조회 오류:', error);
        availableDisplay.textContent = '0';
    }
}

// 볼 사용기록 입력 필터링 (오늘 사용 갯수)
function filterBallUsage() {
    const memberFilter = document.getElementById('memberFilter').value;
    
    // 볼이 있는 회원들만 필터링
    let membersWithBalls = members.filter(member => {
        return ballInventory.some(inventory => 
            inventory.member_id === member.id && 
            inventory.available_quantity > 0
        );
    });
    
    // 회원 필터 적용
    if (memberFilter) {
        membersWithBalls = membersWithBalls.filter(member => member.id === memberFilter);
    }
    
    // 필터링된 회원들로 입력 테이블 렌더링
    const tbody = document.getElementById('ballUsageInputTableBody');
    tbody.innerHTML = '';

    const today = new Date().toISOString().split('T')[0];
    
    membersWithBalls.forEach(member => {
        // 해당 회원의 오늘 사용 기록 찾기
        const todayUsage = ballUsageRecords.find(usage => 
            usage.member_id === member.id && 
            usage.usage_date === today
        );
        
        // 해당 회원의 총 사용 갯수 계산
        const totalUsed = ballUsageRecords
            .filter(usage => usage.member_id === member.id)
            .reduce((sum, usage) => sum + usage.quantity_used, 0);
        
        // 해당 회원의 볼 재고 정보
        const inventory = ballInventory.find(inv => inv.member_id === member.id);
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${member.name} (${member.member_code})</td>
            <td>
                <div class="quantity-controls">
                    <button class="btn btn-sm btn-outline-danger" 
                            onclick="decreaseTodayUsage('${member.id}')"
                            ${!todayUsage || todayUsage.quantity_used <= 0 ? 'disabled' : ''}>
                        <i class="fas fa-minus"></i>
                    </button>
                    <span class="quantity-display">${todayUsage ? todayUsage.quantity_used : 0}</span>
                    <button class="btn btn-sm btn-outline-success" 
                            onclick="increaseTodayUsage('${member.id}')"
                            ${!inventory || inventory.available_quantity <= 0 ? 'disabled' : ''}>
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </td>
            <td>
                <button class="btn btn-sm btn-success" onclick="saveTodayUsage('${member.id}')">
                    <i class="fas fa-save"></i> 저장
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 볼 사용기록 이력 필터링
function filterBallUsageHistory() {
    const dateFilter = document.getElementById('historyDateFilter').value;
    const memberFilter = document.getElementById('historyMemberFilter').value;
    
    let filteredUsage = ballUsageRecords;
    
    if (dateFilter) {
        filteredUsage = filteredUsage.filter(u => u.usage_date === dateFilter);
    }
    
    if (memberFilter) {
        filteredUsage = filteredUsage.filter(u => u.member_id === memberFilter);
    }
    
    const tbody = document.getElementById('ballUsageHistoryTableBody');
    tbody.innerHTML = '';

    filteredUsage.forEach(usage => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${usage.aq_members?.name || '알 수 없는 회원'}</td>
            <td>${usage.usage_date}</td>
            <td>${usage.quantity_used}개</td>
            <td>${usage.notes || '-'}</td>
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
    // 회원 셀렉트 (예약관리용)
    const reservationMemberSelects = ['reservationMember'];
    reservationMemberSelects.forEach(selectId => {
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

    // 볼 재고 및 사용기록 셀렉트
    const ballMemberSelects = ['inventoryMember', 'usageMember', 'memberFilter', 'historyMemberFilter'];
    ballMemberSelects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = selectId === 'memberFilter' || selectId === 'historyMemberFilter' ? '<option value="">모든 회원</option>' : '<option value="">회원을 선택하세요</option>';
            
            if (selectId === 'usageMember') {
                // 볼 사용기록에서는 볼이 있는 회원만 표시
                const membersWithBalls = members.filter(member => {
                    return ballInventory.some(inventory => 
                        inventory.member_id === member.id && 
                        inventory.available_quantity > 0
                    );
                });
                
                membersWithBalls.forEach(member => {
                    const option = document.createElement('option');
                    option.value = member.id;
                    option.textContent = `${member.name} (${member.member_code})`;
                    select.appendChild(option);
                });
            } else if (selectId === 'inventoryMember') {
                // 볼 재고 수정에서는 볼이 1개 이상 재고가 있는 회원만 표시
                const membersWithBalls = members.filter(member => {
                    return ballInventory.some(inventory => 
                        inventory.member_id === member.id && 
                        inventory.available_quantity >= 1
                    );
                });
                
                membersWithBalls.forEach(member => {
                    const option = document.createElement('option');
                    option.value = member.id;
                    option.textContent = `${member.name} (${member.member_code})`;
                    select.appendChild(option);
                });
            } else {
                // 필터에서는 모든 회원 표시
                members.forEach(member => {
                    const option = document.createElement('option');
                    option.value = member.id;
                    option.textContent = `${member.name} (${member.member_code})`;
                    select.appendChild(option);
                });
            }
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
            renderBallInventoryTable();
            break;
        case 'ball-usage':
            renderBallUsageInputTable();
            renderBallUsageHistoryTable();
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


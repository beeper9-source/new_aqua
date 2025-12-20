// Supabase 설정
const supabaseUrl = 'https://nqwjvrznwzmfytjlpfsk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xd2p2cnpud3ptZnl0amxwZnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNzA4NTEsImV4cCI6MjA3Mzk0Njg1MX0.R3Y2Xb9PmLr3sCLSdJov4Mgk1eAmhaCIPXEKq6u8NQI';

// supabase 변수 초기화 (중복 선언 방지)
(function() {
    'use strict';
    if (typeof window.supabaseClient === 'undefined') {
        if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
            window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        } else {
            console.error('Supabase 라이브러리가 로드되지 않았습니다.');
        }
    }
})();

// 전역 변수로 선언 (var 사용하여 재선언 가능)
var supabase = window.supabaseClient;

// 전역 변수
let currentTab = 'members';
let editingId = null;
let members = [];
let courts = [];
let reservations = [];
let ballInventory = [];
let ballUsageRecords = [];
let tempTodayUsage = {}; // 임시 저장용: {memberId: quantity}
let courtAssignments = []; // 코트 배정 데이터

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
            // 기존 버전이 있으면 그대로 사용 (자동 증가하지 않음)
            currentVersion = currentVersionData.version_number;
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
        // 기존 활성 버전 비활성화
        await supabase
            .from('aq_version_management')
            .update({ is_active: false })
            .eq('is_active', true);
        
        // 새 버전 생성 및 활성화
        const { error } = await supabase
            .from('aq_version_management')
            .insert([{
                version_number: versionNumber,
                release_notes: releaseNotes || `Manual version creation: ${versionNumber}`,
                created_by: 'manual',
                is_active: true
            }]);
        
        if (error) throw error;
        
        // 로컬 스토리지 업데이트
        localStorage.setItem(VERSION_KEY, versionNumber);
        
        // UI 업데이트
        const versionElement = document.getElementById('versionNumber');
        if (versionElement) {
            versionElement.textContent = versionNumber;
        }
        
        showNotification(`버전이 ${versionNumber}으로 변경되었습니다.`, 'success');
        return true;
    } catch (error) {
        console.error('버전 생성 오류:', error);
        showNotification('버전 생성 중 오류가 발생했습니다.', 'error');
        return false;
    }
}

// 버전 모달 열기
function openVersionModal() {
    const modal = document.getElementById('versionModal');
    const currentVersion = document.getElementById('versionNumber').textContent;
    const versionParts = currentVersion.split('.');
    
    document.getElementById('versionMajor').value = versionParts[0] || '1';
    document.getElementById('versionMinor').value = versionParts[1] || '0';
    document.getElementById('versionPatch').value = versionParts[2] || '0';
    document.getElementById('versionNotes').value = '';
    
    modal.style.display = 'block';
}

// 버전 모달 닫기
function closeVersionModal() {
    document.getElementById('versionModal').style.display = 'none';
}

// 버전 히스토리 모달 열기
async function openVersionHistoryModal() {
    const modal = document.getElementById('versionHistoryModal');
    const tbody = document.getElementById('versionHistoryTableBody');
    
    try {
        showLoading(true);
        const history = await getVersionHistory();
        
        tbody.innerHTML = '';
        
        if (history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">버전 히스토리가 없습니다.</td></tr>';
        } else {
            history.forEach(version => {
                const row = document.createElement('tr');
                const createdDate = new Date(version.created_at).toLocaleString('ko-KR');
                row.innerHTML = `
                    <td>${version.version_number}</td>
                    <td>
                        <span class="status-badge ${version.is_active ? 'status-active' : 'status-inactive'}">
                            ${version.is_active ? '활성' : '비활성'}
                        </span>
                    </td>
                    <td>${version.release_notes || '-'}</td>
                    <td>${createdDate}</td>
                    <td>${version.created_by || 'system'}</td>
                    <td>
                        ${!version.is_active ? `
                            <button class="btn btn-sm btn-info" onclick="rollbackToVersion('${version.version_number}')" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;">
                                <i class="fas fa-undo"></i> 롤백
                            </button>
                        ` : '<span style="color: #999;">현재 버전</span>'}
                    </td>
                `;
                tbody.appendChild(row);
            });
        }
        
        modal.style.display = 'block';
    } catch (error) {
        console.error('버전 히스토리 로드 오류:', error);
        showNotification('버전 히스토리를 불러오는 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 버전 히스토리 모달 닫기
function closeVersionHistoryModal() {
    document.getElementById('versionHistoryModal').style.display = 'none';
}

// 페이지 로드 시 초기화 (Safari 호환성 개선)
function setupVersionForm() {
    const versionForm = document.getElementById('versionForm');
    if (versionForm) {
        versionForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const major = document.getElementById('versionMajor').value;
            const minor = document.getElementById('versionMinor').value;
            const patch = document.getElementById('versionPatch').value;
            const notes = document.getElementById('versionNotes').value;
            
            const newVersion = `${major}.${minor}.${patch}`;
            
            const success = await createNewVersion(newVersion, notes);
            if (success) {
                closeVersionModal();
            }
        });
    }
}

// 페이지 로드 시 초기화
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // 이미 로드된 경우 즉시 실행
    setTimeout(function() {
        initializeApp();
        setupVersionForm();
    }, 1);
} else {
    document.addEventListener('DOMContentLoaded', function() {
        initializeApp();
        setupVersionForm();
    });
}

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
            loadBallUsageRecords(),
            loadCourtAssignments()
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
            case 'court-assignments':
                await loadCourtAssignments();
                await loadReservations(); // 예약 목록도 필요
                renderCourtAssignmentsTable();
                break;
            case 'reservations':
                await loadReservations();
                // Safari 호환성을 위해 requestAnimationFrame 사용
                if (window.requestAnimationFrame) {
                    requestAnimationFrame(function() {
                        requestAnimationFrame(function() {
                            filterReservations();
                        });
                    });
                } else {
                    // requestAnimationFrame이 없는 경우 setTimeout 사용
                    setTimeout(function() {
                        filterReservations();
                    }, 200);
                }
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
function updateCourtNumberOptions(preselectValue = null) {
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
        
        // preselectValue가 있으면 해당 값 선택, 없으면 N/A 자동 선택
        if (preselectValue) {
            courtNumberSelect.value = preselectValue;
        } else {
            courtNumberSelect.value = 'N/A';
        }
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
            // preselectValue와 일치하면 selected 속성 추가
            if (preselectValue && String(court.value) === String(preselectValue)) {
                option.selected = true;
            }
            courtNumberSelect.appendChild(option);
        });
        
        // preselectValue가 있으면 해당 값 선택 (이중 확인)
        if (preselectValue) {
            // 문자열로 변환하여 비교 (타입 불일치 방지)
            const selectValue = String(preselectValue);
            courtNumberSelect.value = selectValue;
            
            // 값이 설정되지 않았으면 다시 시도
            if (courtNumberSelect.value !== selectValue) {
                // 옵션을 다시 찾아서 선택
                const targetOption = Array.from(courtNumberSelect.options).find(opt => String(opt.value) === selectValue);
                if (targetOption) {
                    targetOption.selected = true;
                    courtNumberSelect.value = selectValue;
                }
            }
            
            // 최종 확인
            console.log(`코트번호 설정 시도: preselectValue=${preselectValue}, 최종값=${courtNumberSelect.value}`);
        }
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
        const contactName = member.emergency_contact_name || '-';
        const contactPhone = member.emergency_contact_phone || '-';
        
        // 주차별 하일라이트 클래스 추가
        const reservationGroup = member.reservation_group || 'N/A';
        if (reservationGroup === '1주차') {
            row.classList.add('week-1');
        } else if (reservationGroup === '2주차') {
            row.classList.add('week-2');
        } else if (reservationGroup === '3주차') {
            row.classList.add('week-3');
        } else if (reservationGroup === '4주차') {
            row.classList.add('week-4');
        } else {
            row.classList.add('week-na');
        }
        
        row.innerHTML = `
            <td>
                <button class="btn btn-sm btn-warning" onclick="editMember('${member.id}')" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;">
                    <i class="fas fa-edit"></i> 수정
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteMember('${member.id}')" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </td>
            <td>${member.reservation_group}</td>
            <td>${member.court_number || '-'}</td>
            <td>${member.name}</td>
            <td>
                <button class="btn btn-xs btn-info copy-name-btn" 
                        data-text="${contactName.replace(/"/g, '&quot;')}" 
                        title="이름 복사" style="margin-right: 5px; padding: 2px 6px;">
                    <i class="fas fa-copy"></i>
                </button>
                ${contactName}
            </td>
            <td>
                <button class="btn btn-xs btn-info copy-phone-btn" 
                        data-text="${contactPhone.replace(/"/g, '&quot;')}" 
                        title="핸드폰번호 복사" style="margin-right: 5px; padding: 2px 6px;">
                    <i class="fas fa-copy"></i>
                </button>
                ${contactPhone}
            </td>
        `;
        // 이름 복사 버튼에 이벤트 리스너 추가
        const copyNameBtn = row.querySelector('.copy-name-btn');
        if (copyNameBtn) {
            copyNameBtn.addEventListener('click', function() {
                const text = this.getAttribute('data-text');
                copyText(text, '이름');
            });
        }
        // 핸드폰번호 복사 버튼에 이벤트 리스너 추가
        const copyPhoneBtn = row.querySelector('.copy-phone-btn');
        if (copyPhoneBtn) {
            copyPhoneBtn.addEventListener('click', function() {
                const text = this.getAttribute('data-text');
                copyText(text, '핸드폰번호');
            });
        }
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
        
        // 예약조 기본값을 N/A로 설정
        document.getElementById('reservationGroup').value = 'N/A';
        
        // 상태 기본값을 활성으로 설정
        document.getElementById('memberStatus').value = 'true';
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
    
    // 예약조에 따라 코트번호 옵션 업데이트 (코트번호 값 전달)
    // court_number가 null이거나 빈 문자열이 아닐 때만 전달
    const courtNumber = member.court_number && member.court_number.trim() !== '' ? member.court_number : null;
    
    // DOM 업데이트가 완료된 후 코트번호 옵션 업데이트
    // requestAnimationFrame을 사용하여 다음 프레임에서 실행
    requestAnimationFrame(() => {
        updateCourtNumberOptions(courtNumber);
        // 추가로 한 번 더 확인 (타이밍 문제 방지)
        if (courtNumber) {
            setTimeout(() => {
                const courtNumberSelect = document.getElementById('courtNumber');
                if (courtNumberSelect.value !== courtNumber) {
                    courtNumberSelect.value = courtNumber;
                }
            }, 10);
        }
    });
    
    document.getElementById('memberEmail').value = member.email || '';
    document.getElementById('emergencyContactName').value = member.emergency_contact_name || '';
    document.getElementById('emergencyContactPhone').value = member.emergency_contact_phone || '';
    document.getElementById('memberStatus').value = member.is_active ? 'true' : 'false';
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
        birth_date: null,
        gender: null,
        address: null,
        email: document.getElementById('memberEmail').value || null,
        membership_type: 'regular',
        membership_start_date: new Date().toISOString().split('T')[0],
        membership_end_date: null,
        skill_level: 'beginner',
        emergency_contact_name: document.getElementById('emergencyContactName').value || null,
        emergency_contact_phone: document.getElementById('emergencyContactPhone').value || null,
        is_active: document.getElementById('memberStatus').value === 'true',
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
    
    // 비밀번호 확인
    const password = prompt('회원 삭제를 위해 비밀번호를 입력하세요:');
    
    if (password === null) {
        // 취소 버튼을 누른 경우
        return;
    }
    
    if (password !== '22331') {
        showNotification('비밀번호가 일치하지 않습니다. 삭제가 취소되었습니다.', 'error');
        return;
    }
    
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
        const contactName = member.emergency_contact_name || '-';
        const contactPhone = member.emergency_contact_phone || '-';
        
        // 주차별 하일라이트 클래스 추가
        const reservationGroup = member.reservation_group || 'N/A';
        if (reservationGroup === '1주차') {
            row.classList.add('week-1');
        } else if (reservationGroup === '2주차') {
            row.classList.add('week-2');
        } else if (reservationGroup === '3주차') {
            row.classList.add('week-3');
        } else if (reservationGroup === '4주차') {
            row.classList.add('week-4');
        } else {
            row.classList.add('week-na');
        }
        
        row.innerHTML = `
            <td>
                <button class="btn btn-sm btn-warning" onclick="editMember('${member.id}')" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;">
                    <i class="fas fa-edit"></i> 수정
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteMember('${member.id}')" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </td>
            <td>${member.reservation_group}</td>
            <td>${member.court_number || '-'}</td>
            <td>${member.name}</td>
            <td>
                <button class="btn btn-xs btn-info copy-name-btn" 
                        data-text="${contactName.replace(/"/g, '&quot;')}" 
                        title="이름 복사" style="margin-right: 5px; padding: 2px 6px;">
                    <i class="fas fa-copy"></i>
                </button>
                ${contactName}
            </td>
            <td>
                <button class="btn btn-xs btn-info copy-phone-btn" 
                        data-text="${contactPhone.replace(/"/g, '&quot;')}" 
                        title="핸드폰번호 복사" style="margin-right: 5px; padding: 2px 6px;">
                    <i class="fas fa-copy"></i>
                </button>
                ${contactPhone}
            </td>
        `;
        // 이름 복사 버튼에 이벤트 리스너 추가
        const copyNameBtn = row.querySelector('.copy-name-btn');
        if (copyNameBtn) {
            copyNameBtn.addEventListener('click', function() {
                const text = this.getAttribute('data-text');
                copyText(text, '이름');
            });
        }
        // 핸드폰번호 복사 버튼에 이벤트 리스너 추가
        const copyPhoneBtn = row.querySelector('.copy-phone-btn');
        if (copyPhoneBtn) {
            copyPhoneBtn.addEventListener('click', function() {
                const text = this.getAttribute('data-text');
                copyText(text, '핸드폰번호');
            });
        }
        tbody.appendChild(row);
    });
}

// 텍스트 복사 함수
async function copyText(text, label = '') {
    if (text === '-') {
        showNotification(`${label}이(가) 없습니다.`, 'error');
        return;
    }
    
    try {
        // 클립보드에 복사
        await navigator.clipboard.writeText(text);
        
        // 성공 메시지 표시
        showNotification(`${label}이(가) 복사되었습니다.`, 'success');
    } catch (error) {
        console.error('복사 오류:', error);
        // 클립보드 API가 지원되지 않는 경우 대체 방법 사용
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand('copy');
            textArea.remove();
            showNotification(`${label}이(가) 복사되었습니다.`, 'success');
        } catch (fallbackError) {
            console.error('대체 복사 방법 오류:', fallbackError);
            showNotification('복사에 실패했습니다.', 'error');
        }
    }
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
    // 전체를 불러오고 화면단에서 기본 필터(오늘 이상)를 적용
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
        // Safari 호환성을 위해 optional chaining 대신 명시적 체크 사용
        const courtA = parseInt((a.aq_courts && a.aq_courts.court_number) || '0');
        const courtB = parseInt((b.aq_courts && b.aq_courts.court_number) || '0');
        
        // 코트번호가 숫자가 아닌 경우 문자열로 비교
        if (isNaN(courtA) || isNaN(courtB)) {
            const courtStrA = (a.aq_courts && a.aq_courts.court_number) || '';
            const courtStrB = (b.aq_courts && b.aq_courts.court_number) || '';
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

// 주차 계산 (월요일 시작, 1주차 기준)
function getWeekOfMonthMondayBased(date) {
    // 해당 달의 첫 번째 월요일을 찾는다
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    const firstDow = firstOfMonth.getDay(); // 0=일..1=월
    const daysUntilFirstMonday = (8 - firstDow) % 7 || 7; // 첫 월요일까지 남은 일수 (1일이 월요일이면 7 -> 아래서 보정)
    let firstMonday = new Date(d.getFullYear(), d.getMonth(), 1 + ((firstDow === 1) ? 0 : daysUntilFirstMonday));

    // 1일이 월요일이면 daysUntilFirstMonday 계산이 7이 되어버리므로 보정
    if (firstDow === 1) firstMonday = new Date(d.getFullYear(), d.getMonth(), 1);

    // 해당 날짜가 첫 월요일 이전이라도 1주차로 간주
    if (d < firstMonday) return 1;

    const diffDays = Math.floor((d - firstMonday) / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 7) + 1;
}

// 다음주 월요일 날짜 구하기
function getNextMonday(from = new Date()) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const day = d.getDay(); // 0=일 .. 1=월
    // 다음주 월요일: 남은 요일 + 7 (월요일 포함하지 않음)
    const daysUntilNextMon = ((8 - day) % 7) || 7;
    d.setDate(d.getDate() + daysUntilNextMon);
    return d;
}

// 날짜 더하기 유틸 (불변)
function addDays(date, days) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + days);
    return d;
}

// 날짜 yyyy-mm-dd 포맷
function toDateStr(date) {
    return date.toISOString().split('T')[0];
}

// 차주 예약 일괄 세팅
async function setupNextWeekReservations() {
    try {
        showLoading(true);
        // 데이터 보장
        if (!members.length) await loadMembers();
        if (!courts.length) await loadCourts();

    const nextMonday = getNextMonday(new Date());
    const weekOfMonth = getWeekOfMonthMondayBased(nextMonday);
    const targetWeekNum = weekOfMonth;

        // 차주 수요일(+3), 목요일(+4)
        const wed = addDays(nextMonday, 3);
        const thu = addDays(nextMonday, 4);
        const targetDates = [toDateStr(wed), toDateStr(thu)];

    // 대상 회원 필터: reservation_group 내 숫자만 파싱하여 비교
    const targetMembers = members.filter(m => {
        const grp = (m.reservation_group || '').toString().trim();
        const match = grp.match(/(\d+)/);
        const num = match ? parseInt(match[1], 10) : NaN;
        return !Number.isNaN(num) && num === targetWeekNum;
    });
    if (!targetMembers.length) {
        showNotification(`${targetWeekNum}주차 대상 회원이 없습니다.`, 'warning');
        return;
    }

        // 기존 충돌 방지를 위해 해당 회원/날짜 예약 미리 조회
        const { data: existing, error: exErr } = await supabase
            .from('aq_reservations')
            .select('id, member_id, reservation_date, court_id');
        if (exErr) throw exErr;

    let created = 0, skipped = 0, defaultCourtAssigned = 0, roundRobinAssigned = 0;
    const toInt = (v) => {
        if (v === null || v === undefined) return NaN;
        const m = String(v).match(/(\d+)/);
        return m ? parseInt(m[1], 10) : NaN;
    };
    const hashId = (id) => {
        const s = String(id);
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return h;
    };
    const resolveCourtId = (member, memberIndex) => {
        // 1) court_id가 직접 있으면 우선 사용
        if (member.court_id) {
            const direct = courts.find(c => c.id === member.court_id);
            if (direct) return { id: direct.id, mode: 'direct' };
        }
        // 2) court_number 정수 매칭
        const desiredNum = toInt(member.court_number);
        if (!Number.isNaN(desiredNum)) {
            const byNum = courts.find(c => toInt(c.court_number) === desiredNum);
            if (byNum) return { id: byNum.id, mode: 'number' };
        }
        // 3) 이름에 숫자 포함 매칭
        if (!Number.isNaN(desiredNum)) {
            const byNameNum = courts.find(c => toInt(c.name) === desiredNum);
            if (byNameNum) return { id: byNameNum.id, mode: 'name-number' };
        }
        // 4) 라운드로빈 분산 배정 (fallback)
        if (courts.length > 0) {
            const idx = courts.length > 1
                ? (hashId(member.id) + (memberIndex || 0)) % courts.length
                : 0;
            roundRobinAssigned++;
            return { id: courts[idx].id, mode: 'roundrobin' };
        }
        return { id: null, mode: 'none' };
    };
    for (let mi = 0; mi < targetMembers.length; mi++) {
        const member = targetMembers[mi];
        // 코트 매핑: 회원의 court_number -> courts.id (없으면 기본 배정)
        const { id: courtId, mode } = resolveCourtId(member, mi);
        if (!courtId) { skipped++; continue; }
        if (mode === 'roundrobin') defaultCourtAssigned++;

            for (const dateStr of targetDates) {
                // 코트 후보 목록 구성: 선호 코트 우선, 이후 전체 코트 순회
                const orderedCourts = [courtId, ...courts.map(c => c.id).filter(id => id !== courtId)];
                let inserted = false;
                let reservation_code = await generateReservationCode(true);
                const start_time = '08:00';
                const end_time = calculateEndTime(start_time);
                const game_date = toDateStr(addDays(new Date(dateStr), 4));

                for (const cid of orderedCourts) {
                    // 동일 회원/날짜/코트 중복 선제 차단
                    const dup = (existing || []).some(r => r.member_id === member.id && r.reservation_date === dateStr && r.court_id === cid);
                    if (dup) continue;

                    const payload = {
                        reservation_code,
                        member_id: member.id,
                        court_id: cid,
                        reservation_date: dateStr,
                        game_date,
                        start_time,
                        end_time,
                        duration_hours: 2,
                        guest_count: 4,
                        special_requests: null,
                        reservation_status: 'pending'
                    };

                    let attempt = 0;
                    while (attempt < 3) {
                        const { error: insErr } = await supabase
                            .from('aq_reservations')
                            .insert([payload], { onConflict: 'member_id,reservation_date,court_id', ignoreDuplicates: true });
                        if (!insErr) { inserted = true; break; }
                        const msg = (insErr.message || '').toLowerCase();
                        const hint = (insErr.hint || '').toLowerCase();
                        if (insErr.code === '409' || insErr.code === '23505' || msg.includes('duplicate') || msg.includes('conflict') || hint.includes('already exists')) {
                            attempt++;
                            reservation_code = await generateReservationCode(true);
                            payload.reservation_code = reservation_code;
                            continue;
                        } else {
                            attempt = 3;
                        }
                    }
                    if (inserted) break;
                }
                if (!inserted) { skipped++; continue; }
                created++;
            }
        }

        await loadReservations();
        filterReservations();
    showNotification(`차주 예약 세팅 완료: 생성 ${created}건, 스킵 ${skipped}건${defaultCourtAssigned ? ` (분산 코트 배정 ${defaultCourtAssigned}건)` : ''}`, 'success');
    } catch (error) {
        console.error('차주 예약세팅 오류:', error);
        showNotification('차주 예약세팅 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 예약 테이블 렌더링
function renderReservationsTable() {
    const tbody = document.getElementById('reservationsTableBody');
    if (!tbody) {
        console.error('reservationsTableBody 요소를 찾을 수 없습니다.');
        return;
    }
    
    tbody.innerHTML = '';
    
    // reservations 배열이 없거나 비어있으면 빈 테이블 표시
    if (!reservations || reservations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">예약 데이터가 없습니다.</td></tr>';
        return;
    }

    reservations.forEach(reservation => {
        const row = document.createElement('tr');
        const gameDateWithDay = reservation.game_date ? `${reservation.game_date} (${getDayOfWeek(reservation.game_date)})` : '-';
        
        // 특별 날짜(대회일) 체크 - game_date 기준
        let dateClass = '';
        if (isSpecialDate(reservation.game_date)) {
            dateClass = 'date-special'; // 특별 날짜 (대회일)
        } else {
            // 예약일에 따른 배경색 클래스 추가
            const reservationDate = new Date(reservation.reservation_date);
            const today = new Date();
            const diffTime = reservationDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
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
        }
        
        row.className = dateClass;
        
        // 시간 형식을 간단하게 변환 (08:00 -> 8시)
        const startTime = reservation.start_time;
        const simpleTime = startTime ? `${parseInt(startTime.split(':')[0])}시` : '-';
        
        // Safari 호환성을 위해 optional chaining 대신 명시적 체크 사용
        const courtName = (reservation.aq_courts && reservation.aq_courts.name) || '알 수 없는 코트';
        const memberName = (reservation.aq_members && reservation.aq_members.name) || '알 수 없는 회원';
        
        row.innerHTML = `
            <td>${reservation.reservation_date}</td>
            <td>${courtName}</td>
            <td>${memberName}</td>
            <td>${gameDateWithDay}</td>
            <td>${simpleTime}</td>
            <td>
                <select onchange="updateReservationStatus('${reservation.id}', this.value)">
                    <option value="pending" ${reservation.reservation_status === 'pending' ? 'selected' : ''}>${getReservationStatusText('pending')}</option>
                    <option value="success" ${reservation.reservation_status === 'success' ? 'selected' : ''}>${getReservationStatusText('success')}</option>
                    <option value="failed" ${reservation.reservation_status === 'failed' ? 'selected' : ''}>${getReservationStatusText('failed')}</option>
                    <option value="cancelled" ${reservation.reservation_status === 'cancelled' ? 'selected' : ''}>${getReservationStatusText('cancelled')}</option>
                </select>
            </td>
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

// 예약 상태 인라인 업데이트 (목록/필터 공통 사용)
async function updateReservationStatus(reservationId, newStatus) {
    try {
        const { error } = await supabase
            .from('aq_reservations')
            .update({ reservation_status: newStatus })
            .eq('id', reservationId);
        if (error) throw error;
        await loadReservations();
        // 필터링된 목록을 유지하기 위해 filterReservations 호출
        filterReservations();
        showNotification('예약 상태가 업데이트되었습니다.', 'success');
    } catch (error) {
        console.error('예약 상태 업데이트 오류:', error);
        showNotification('상태 업데이트 중 오류가 발생했습니다.', 'error');
    }
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
// 특별 날짜 체크 함수 (수내코트 대회일)
function isSpecialDate(dateStr) {
    if (!dateStr) return false;
    const specialDates = ['2025-12-06', '2025-12-07'];
    return specialDates.includes(dateStr);
}

function updateGameDate() {
    const reservationDate = document.getElementById('reservationDate').value;
    if (reservationDate) {
        const reservationDateObj = new Date(reservationDate);
        const gameDateObj = new Date(reservationDateObj);
        gameDateObj.setDate(gameDateObj.getDate() + 3); // 예약일 + 3일
        
        const gameDate = gameDateObj.toISOString().split('T')[0];
        document.getElementById('gameDate').value = gameDate;
        
        // 특별 날짜인 경우 시간을 06:00으로 설정
        if (isSpecialDate(gameDate)) {
            document.getElementById('startTime').value = '06:00';
        }
    } else {
        document.getElementById('gameDate').value = '';
    }
}
async function generateReservationCode(useRandomSuffix = false) {
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
            const lastCode = data[0].reservation_code || '';
            // RESYYYYMM + digits (하이픈 앞까지만 숫자 추출)
            const m = lastCode.match(/RES\d{6}(\d+)/);
            const lastNumber = m ? parseInt(m[1], 10) : 0;
            nextNumber = lastNumber + 1;
        }
        
        // 3자리 숫자로 포맷팅
        const base = `RES${year}${month}${nextNumber.toString().padStart(3, '0')}`;
        if (useRandomSuffix) {
            const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            return `${base}-${rand}`;
        }
        return base;
        
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
        
        // 상태 디폴트를 예약전으로 설정
        document.getElementById('reservationStatus').value = 'pending';
        
        // 예약일 변경 이벤트 리스너 추가
        const reservationDateInput = document.getElementById('reservationDate');
        reservationDateInput.removeEventListener('change', updateGameDate);
        reservationDateInput.addEventListener('change', updateGameDate);
        
        // 초기 경기일 설정 (특별 날짜 체크 포함)
        updateGameDate();
        
        // 특별 날짜가 아니면 시간 디폴트를 8시로 설정
        const gameDate = document.getElementById('gameDate').value;
        if (!isSpecialDate(gameDate)) {
            document.getElementById('startTime').value = '08:00';
        }
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
        // 필터링된 목록을 유지하기 위해 filterReservations 호출
        filterReservations();
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
        // 필터링된 목록을 유지하기 위해 filterReservations 호출
        filterReservations();
        
    } catch (error) {
        console.error('예약 삭제 오류:', error);
        showNotification('예약 삭제 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 예약 필터링
function filterReservations() {
    const tbody = document.getElementById('reservationsTableBody');
    if (!tbody) {
        console.error('reservationsTableBody 요소를 찾을 수 없습니다.');
        return;
    }
    
    // reservations 배열이 없거나 비어있으면 빈 테이블 표시
    if (!reservations || reservations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">예약 데이터가 없습니다.</td></tr>';
        return;
    }
    
    // Safari 호환성을 위해 optional chaining 대신 명시적 체크 사용
    const dateFilterEl = document.getElementById('reservationDateFilter');
    const courtFilterEl = document.getElementById('courtFilter');
    const statusFilterEl = document.getElementById('statusFilter');
    const dateFilter = (dateFilterEl && dateFilterEl.value) || '';
    const courtFilter = (courtFilterEl && courtFilterEl.value) || '';
    const statusFilter = (statusFilterEl && statusFilterEl.value) || '';
    
    let filteredReservations = reservations;
    
    if (dateFilter) {
        // 날짜 필터는 FROM 조건: 지정일 이상 ~ 고정 TO(9999-01-01)
        filteredReservations = filteredReservations.filter(r => r.reservation_date >= dateFilter);
    } else {
        // 디폴트: 오늘 날짜 이상만 표시
        const todayStr = new Date().toISOString().split('T')[0];
        filteredReservations = filteredReservations.filter(r => r.reservation_date >= todayStr);
    }
    
    if (courtFilter) {
        filteredReservations = filteredReservations.filter(r => r.court_id === courtFilter);
    }
    
    if (statusFilter) {
        filteredReservations = filteredReservations.filter(r => r.reservation_status === statusFilter);
    }
    
    tbody.innerHTML = '';
    
    // 필터링된 결과가 없으면 메시지 표시
    if (filteredReservations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">조건에 맞는 예약이 없습니다.</td></tr>';
        return;
    }

    filteredReservations.forEach(reservation => {
        const row = document.createElement('tr');
        const gameDateWithDay = reservation.game_date ? `${reservation.game_date} (${getDayOfWeek(reservation.game_date)})` : '-';
        
        // 특별 날짜(대회일) 체크 - game_date 기준
        let dateClass = '';
        if (isSpecialDate(reservation.game_date)) {
            dateClass = 'date-special'; // 특별 날짜 (대회일)
        } else {
            // 예약일에 따른 배경색 클래스 추가
            const reservationDate = new Date(reservation.reservation_date);
            const today = new Date();
            const diffTime = reservationDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
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
        }
        
        row.className = dateClass;
        
        // 시간 형식을 간단하게 변환 (08:00 -> 8시)
        const startTime = reservation.start_time;
        const simpleTime = startTime ? `${parseInt(startTime.split(':')[0])}시` : '-';
        
        // Safari 호환성을 위해 optional chaining 대신 명시적 체크 사용
        const courtName = (reservation.aq_courts && reservation.aq_courts.name) || '알 수 없는 코트';
        const memberName = (reservation.aq_members && reservation.aq_members.name) || '알 수 없는 회원';
        
        row.innerHTML = `
            <td>${reservation.reservation_date}</td>
            <td>${courtName}</td>
            <td>${memberName}</td>
            <td>${gameDateWithDay}</td>
            <td>${simpleTime}</td>
            <td>
                <select onchange="updateReservationStatus('${reservation.id}', this.value)">
                    <option value="pending" ${reservation.reservation_status === 'pending' ? 'selected' : ''}>${getReservationStatusText('pending')}</option>
                    <option value="success" ${reservation.reservation_status === 'success' ? 'selected' : ''}>${getReservationStatusText('success')}</option>
                    <option value="failed" ${reservation.reservation_status === 'failed' ? 'selected' : ''}>${getReservationStatusText('failed')}</option>
                    <option value="cancelled" ${reservation.reservation_status === 'cancelled' ? 'selected' : ''}>${getReservationStatusText('cancelled')}</option>
                </select>
            </td>
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

        // 사용기록 삭제 (트리거가 재고 used_quantity를 자동 반영)
        const { error } = await supabase
            .from('aq_ball_usage_records')
            .delete()
            .eq('id', usageId);
        
        if (error) throw error;
        
        // 재고/사용기록 동기화 재조회
        await Promise.all([
            loadBallUsageRecords(),
            loadBallInventory()
        ]);
        renderBallUsageInputTable();
        renderBallUsageHistoryTable();
        renderBallInventoryTable();
        showNotification('볼 사용기록이 성공적으로 삭제되었습니다.', 'success');
        
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
                // 볼 재고 수정에서는 지정한 3명만 노출
                const allowedNames = new Set(['거북코', '참치', '청새치']);
                const allowedMembers = members.filter(member => allowedNames.has(member.name));

                allowedMembers.forEach(member => {
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
            filterReservations();
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

// 회원 일괄 업데이트 함수
async function batchUpdateMembers() {
    const memberData = [
        { nickname: '거북코', name: '김구', phone: '01053924417' },
        { nickname: '참치', name: '김태호', phone: '01046075604' },
        { nickname: '청새치', name: '진형국', phone: '01093126776' },
        { nickname: '고래', name: '조경민', phone: '01025271478' },
        { nickname: '곰치', name: '윤원섭', phone: '01088608287' },
        { nickname: '광어', name: '정광문', phone: '01026303841' },
        { nickname: '나르는날치', name: '양진민', phone: '01059200472' },
        { nickname: '다랑어', name: '최원준', phone: '01027557737' },
        { nickname: '대방어', name: '송지영', phone: '01090120611' },
        { nickname: '도리', name: '유영훈', phone: '01055714707' },
        { nickname: '돌핀', name: '추민정', phone: '01091540825' },
        { nickname: '랍스터', name: '이미랑', phone: '01074840275' },
        { nickname: '멍게', name: 'Lim Eunsook Grace', phone: '01097265235' },
        { nickname: '베타', name: '주은희', phone: '01050205424' },
        { nickname: '수달', name: '양수종', phone: '01053647906' },
        { nickname: '벨루가', name: '신인섭', phone: '01038513662' },
        { nickname: '아기상어', name: '이성식', phone: '01024365516' },
        { nickname: '용왕', name: '김정순', phone: '01056293686' },
        { nickname: '우럭', name: '조강타', phone: '01033568759' },
        { nickname: '연어', name: '이주한', phone: '01092174446' },
        { nickname: '자갈치', name: '이병근', phone: '01048173081' },
        { nickname: '쭈꾸미', name: '장유진', phone: '01054601778' },
        { nickname: '초록물고기', name: '안초록', phone: '01096328522' },
        { nickname: '해마', name: '김용희', phone: '01073651682' },
        { nickname: '꼬막', name: '민충기', phone: '01075598904' }
    ];

    try {
        showLoading(true);
        let updatedCount = 0;
        let createdCount = 0;
        let errorCount = 0;

        // 모든 회원 데이터 로드
        const { data: allMembers, error: loadError } = await supabase
            .from('aq_members')
            .select('*');

        if (loadError) throw loadError;

        for (const memberInfo of memberData) {
            try {
                // 닉네임(name 필드)으로 회원 찾기
                const existingMember = allMembers.find(m => m.name === memberInfo.nickname);

                if (existingMember) {
                    // 기존 회원 업데이트
                    const { error: updateError } = await supabase
                        .from('aq_members')
                        .update({
                            emergency_contact_name: memberInfo.name,
                            emergency_contact_phone: memberInfo.phone
                        })
                        .eq('id', existingMember.id);

                    if (updateError) {
                        console.error(`${memberInfo.nickname} 업데이트 오류:`, updateError);
                        errorCount++;
                    } else {
                        updatedCount++;
                        console.log(`${memberInfo.nickname} 업데이트 완료`);
                    }
                } else {
                    // 신규 회원 추가
                    const memberCode = await generateMemberCode();
                    const { error: insertError } = await supabase
                        .from('aq_members')
                        .insert([{
                            member_code: memberCode,
                            name: memberInfo.nickname,
                            reservation_group: 'N/A',
                            court_number: 'N/A',
                            birth_date: null,
                            gender: null,
                            address: null,
                            membership_type: 'regular',
                            membership_start_date: new Date().toISOString().split('T')[0],
                            membership_end_date: null,
                            skill_level: 'beginner',
                            emergency_contact_name: memberInfo.name,
                            emergency_contact_phone: memberInfo.phone,
                            notes: null,
                            is_active: true
                        }]);

                    if (insertError) {
                        console.error(`${memberInfo.nickname} 추가 오류:`, insertError);
                        errorCount++;
                    } else {
                        createdCount++;
                        console.log(`${memberInfo.nickname} 추가 완료 (회원번호: ${memberCode})`);
                        // 새로 추가된 회원을 allMembers에 추가하여 다음 회원번호 생성에 반영
                        allMembers.push({
                            id: 'temp',
                            member_code: memberCode,
                            name: memberInfo.nickname
                        });
                    }
                }
            } catch (error) {
                console.error(`${memberInfo.nickname} 처리 오류:`, error);
                errorCount++;
            }
        }

        // 결과 표시
        const message = `일괄 업데이트 완료!\n업데이트: ${updatedCount}명\n신규 추가: ${createdCount}명\n오류: ${errorCount}명`;
        showNotification(message, 'success');
        console.log(message);

        // 데이터 새로고침
        await loadAllData();
        renderMembersTable();

    } catch (error) {
        console.error('일괄 업데이트 오류:', error);
        showNotification('일괄 업데이트 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== 코트 배정 관리 ====================

// 코트 배정 데이터 로드
async function loadCourtAssignments() {
    try {
        const { data, error } = await supabase
            .from('aq_court_assignments')
            .select(`
                *,
                aq_reservations!reservation_id(
                    id,
                    game_date,
                    start_time,
                    aq_courts!court_id(name, court_number),
                    aq_members!member_id(name, member_code)
                ),
                aq_members!member_id(name, member_code)
            `)
            .order('assignment_date', { ascending: false })
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        courtAssignments = data || [];
        return courtAssignments;
    } catch (error) {
        console.error('코트 배정 데이터 로드 오류:', error);
        throw error;
    }
}

// 코트 배정 테이블 렌더링
function renderCourtAssignmentsTable() {
    const tbody = document.getElementById('courtAssignmentsTableBody');
    tbody.innerHTML = '';

    // 배정이 없는 경우 빈 메시지 표시
    if (!courtAssignments || courtAssignments.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="7" style="text-align: center; padding: 20px; color: #999;">
                배정된 예약이 없습니다. "배정 추가" 버튼을 클릭하여 배정을 추가하세요.
            </td>
        `;
        tbody.appendChild(row);
        return;
    }

    // 예약별로 그룹화
    const assignmentsByReservation = {};
    courtAssignments.forEach(assignment => {
        const reservationId = assignment.reservation_id;
        if (!assignmentsByReservation[reservationId]) {
            assignmentsByReservation[reservationId] = [];
        }
        assignmentsByReservation[reservationId].push(assignment);
    });

    // 예약을 경기일 기준으로 최신순 정렬
    const sortedReservationIds = Object.keys(assignmentsByReservation).sort((a, b) => {
        const assignmentA = assignmentsByReservation[a][0];
        const assignmentB = assignmentsByReservation[b][0];
        
        // reservation 데이터가 없는 경우 처리
        if (!assignmentA || !assignmentB) return 0;
        
        const dateA = assignmentA.aq_reservations?.game_date || assignmentA.assignment_date || '';
        const dateB = assignmentB.aq_reservations?.game_date || assignmentB.assignment_date || '';
        
        // 날짜가 같으면 생성일 기준으로 정렬
        if (dateA === dateB) {
            const createdA = new Date(assignmentA.created_at || 0);
            const createdB = new Date(assignmentB.created_at || 0);
            return createdB - createdA; // 최신순
        }
        
        return dateB.localeCompare(dateA); // 최신순 (날짜 내림차순)
    });

    if (sortedReservationIds.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="7" style="text-align: center; padding: 20px; color: #999;">
                배정된 예약이 없습니다. "배정 추가" 버튼을 클릭하여 배정을 추가하세요.
            </td>
        `;
        tbody.appendChild(row);
        return;
    }

    sortedReservationIds.forEach(reservationId => {
        const assignments = assignmentsByReservation[reservationId];
        const firstAssignment = assignments[0];
        const reservation = firstAssignment.aq_reservations;
        
        if (!reservation) return;

        const row = document.createElement('tr');
        const assignmentDate = reservation.game_date || firstAssignment.assignment_date;
        const assignmentDateWithDay = assignmentDate ? `${assignmentDate} (${getDayOfWeek(assignmentDate)})` : '-';
        
        // 배정 인원 목록 생성
        const memberList = assignments.map(a => {
            if (a.member_id && a.aq_members) {
                return a.aq_members.name || '알 수 없음';
            } else if (a.guest_name) {
                return `${a.guest_name} (게스트)`;
            }
            return '알 수 없음';
        }).join(', ');

        const startTime = reservation.start_time;
        const simpleTime = startTime ? `${parseInt(startTime.split(':')[0])}시` : '-';

        row.innerHTML = `
            <td>${assignmentDateWithDay}</td>
            <td>${reservation.aq_courts?.name || '알 수 없는 코트'}</td>
            <td>${reservation.aq_members?.name || '알 수 없음'}</td>
            <td>${simpleTime}</td>
            <td>${assignments.length}명</td>
            <td>${memberList}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editCourtAssignment('${reservationId}')">
                    <i class="fas fa-edit"></i> 수정
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteCourtAssignment('${reservationId}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 코트 배정 필터링
function filterCourtAssignments() {
    const dateFilter = document.getElementById('assignmentDateFilter').value;
    const reservationFilter = document.getElementById('assignmentReservationFilter').value;

    let filteredAssignments = [...courtAssignments];

    if (dateFilter) {
        filteredAssignments = filteredAssignments.filter(a => {
            const assignmentDate = a.aq_reservations?.game_date || a.assignment_date;
            return assignmentDate === dateFilter;
        });
    }

    if (reservationFilter) {
        filteredAssignments = filteredAssignments.filter(a => a.reservation_id === reservationFilter);
    }

    // 예약별로 그룹화하여 렌더링
    const assignmentsByReservation = {};
    filteredAssignments.forEach(assignment => {
        const reservationId = assignment.reservation_id;
        if (!assignmentsByReservation[reservationId]) {
            assignmentsByReservation[reservationId] = [];
        }
        assignmentsByReservation[reservationId].push(assignment);
    });

    // 예약을 경기일 기준으로 최신순 정렬
    const sortedReservationIds = Object.keys(assignmentsByReservation).sort((a, b) => {
        const assignmentA = assignmentsByReservation[a][0];
        const assignmentB = assignmentsByReservation[b][0];
        
        // reservation 데이터가 없는 경우 처리
        if (!assignmentA || !assignmentB) return 0;
        
        const dateA = assignmentA.aq_reservations?.game_date || assignmentA.assignment_date || '';
        const dateB = assignmentB.aq_reservations?.game_date || assignmentB.assignment_date || '';
        
        // 날짜가 같으면 생성일 기준으로 정렬
        if (dateA === dateB) {
            const createdA = new Date(assignmentA.created_at || 0);
            const createdB = new Date(assignmentB.created_at || 0);
            return createdB - createdA; // 최신순
        }
        
        return dateB.localeCompare(dateA); // 최신순 (날짜 내림차순)
    });

    const tbody = document.getElementById('courtAssignmentsTableBody');
    tbody.innerHTML = '';

    if (sortedReservationIds.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="7" style="text-align: center; padding: 20px; color: #999;">
                조건에 맞는 배정이 없습니다.
            </td>
        `;
        tbody.appendChild(row);
        return;
    }

    sortedReservationIds.forEach(reservationId => {
        const assignments = assignmentsByReservation[reservationId];
        const firstAssignment = assignments[0];
        const reservation = firstAssignment.aq_reservations;
        
        if (!reservation) return;

        const row = document.createElement('tr');
        const assignmentDate = reservation.game_date || firstAssignment.assignment_date;
        const assignmentDateWithDay = assignmentDate ? `${assignmentDate} (${getDayOfWeek(assignmentDate)})` : '-';
        
        const memberList = assignments.map(a => {
            if (a.member_id && a.aq_members) {
                return a.aq_members.name || '알 수 없음';
            } else if (a.guest_name) {
                return `${a.guest_name} (게스트)`;
            }
            return '알 수 없음';
        }).join(', ');

        const startTime = reservation.start_time;
        const simpleTime = startTime ? `${parseInt(startTime.split(':')[0])}시` : '-';

        row.innerHTML = `
            <td>${assignmentDateWithDay}</td>
            <td>${reservation.aq_courts?.name || '알 수 없는 코트'}</td>
            <td>${reservation.aq_members?.name || '알 수 없음'}</td>
            <td>${simpleTime}</td>
            <td>${assignments.length}명</td>
            <td>${memberList}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editCourtAssignment('${reservationId}')">
                    <i class="fas fa-edit"></i> 수정
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteCourtAssignment('${reservationId}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 코트 배정 모달 열기
async function openCourtAssignmentModal(reservationId = null) {
    editingId = reservationId;
    const modal = document.getElementById('courtAssignmentModal');
    const title = document.getElementById('courtAssignmentModalTitle');
    
    // 성공 상태인 예약만 필터링하고 경기일 기준 최신순 정렬
    const successReservations = reservations
        .filter(r => r.reservation_status === 'success')
        .sort((a, b) => {
            const dateA = a.game_date || a.reservation_date || '';
            const dateB = b.game_date || b.reservation_date || '';
            
            // 날짜가 같으면 생성일 기준으로 정렬
            if (dateA === dateB) {
                const createdA = new Date(a.created_at || 0);
                const createdB = new Date(b.created_at || 0);
                return createdB - createdA; // 최신순
            }
            
            return dateB.localeCompare(dateA); // 최신순 (날짜 내림차순)
        });
    
    const reservationSelect = document.getElementById('assignmentReservation');
    reservationSelect.innerHTML = '<option value="">예약을 선택하세요</option>';
    
    successReservations.forEach(reservation => {
        const option = document.createElement('option');
        option.value = reservation.id;
        const gameDate = reservation.game_date || reservation.reservation_date;
        const courtName = reservation.aq_courts?.name || '알 수 없는 코트';
        const memberName = reservation.aq_members?.name || '알 수 없음';
        const startTime = reservation.start_time || '';
        option.textContent = `${gameDate} ${courtName} - ${memberName} (${startTime})`;
        reservationSelect.appendChild(option);
    });

    // 필터 셀렉트도 업데이트 (이미 정렬된 successReservations 사용)
    const filterSelect = document.getElementById('assignmentReservationFilter');
    filterSelect.innerHTML = '<option value="">모든 예약</option>';
    successReservations.forEach(reservation => {
        const option = document.createElement('option');
        option.value = reservation.id;
        const gameDate = reservation.game_date || reservation.reservation_date;
        const courtName = reservation.aq_courts?.name || '알 수 없는 코트';
        const memberName = reservation.aq_members?.name || '알 수 없음';
        const startTime = reservation.start_time || '';
        option.textContent = `${gameDate} ${courtName} - ${memberName} (${startTime})`;
        filterSelect.appendChild(option);
    });

    if (reservationId) {
        title.textContent = '코트 배정 수정';
        reservationSelect.value = reservationId;
        reservationSelect.disabled = true;
        
        // 기존 배정 로드
        const existingAssignments = courtAssignments.filter(a => a.reservation_id === reservationId);
        const reservation = reservations.find(r => r.id === reservationId);
        
        // 예약회원이 기존 배정에 포함되어 있는지 확인
        const hasReservationMember = existingAssignments.some(a => a.member_id === reservation?.member_id);
        
        if (existingAssignments.length > 0) {
            // 기존 배정이 있으면 그대로 로드
            loadAssignmentMembers(existingAssignments);
            
            // 예약회원이 포함되어 있지 않으면 추가
            if (reservation?.member_id && !hasReservationMember) {
                addAssignmentMember(reservation.member_id);
            }
        } else {
            // 기존 배정이 없으면 예약회원을 디폴트로 추가
            if (reservation?.member_id) {
                addAssignmentMember(reservation.member_id);
            } else {
                addAssignmentMember();
            }
        }
    } else {
        title.textContent = '코트 배정 추가';
        reservationSelect.disabled = false;
        document.getElementById('assignmentMembersContainer').innerHTML = '';
        // 예약 선택 시 예약회원이 자동으로 추가되므로 여기서는 추가하지 않음
    }
    
    modal.style.display = 'block';
}

// 배정 인원 추가
function addAssignmentMember(defaultMemberId = null) {
    const container = document.getElementById('assignmentMembersContainer');
    const memberCount = container.children.length;
    
    if (memberCount >= 5) {
        showNotification('최대 5명까지 배정할 수 있습니다.', 'error');
        return;
    }

    const memberDiv = document.createElement('div');
    memberDiv.className = 'assignment-member-item';
    memberDiv.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; align-items: center;';
    
    const memberTypeSelect = document.createElement('select');
    memberTypeSelect.className = 'member-type-select';
    memberTypeSelect.style.cssText = 'flex: 1; padding: 8px;';
    memberTypeSelect.innerHTML = `
        <option value="member">회원</option>
        <option value="guest">게스트</option>
    `;
    
    const memberSelect = document.createElement('select');
    memberSelect.className = 'member-select';
    memberSelect.style.cssText = 'flex: 2; padding: 8px;';
    memberSelect.innerHTML = '<option value="">회원을 선택하세요</option>';
    
    // 회원을 이름 기준 가나다순으로 정렬
    const sortedMembers = [...members].sort((a, b) => {
        return a.name.localeCompare(b.name, 'ko');
    });
    
    sortedMembers.forEach(member => {
        const option = document.createElement('option');
        option.value = member.id;
        option.textContent = `${member.name} (${member.member_code})`;
        if (defaultMemberId && member.id === defaultMemberId) {
            option.selected = true;
        }
        memberSelect.appendChild(option);
    });
    
    const guestNameInput = document.createElement('input');
    guestNameInput.type = 'text';
    guestNameInput.className = 'guest-name-input';
    guestNameInput.placeholder = '게스트 이름';
    guestNameInput.style.cssText = 'flex: 1; padding: 8px; display: none;';
    
    const guestPhoneInput = document.createElement('input');
    guestPhoneInput.type = 'text';
    guestPhoneInput.className = 'guest-phone-input';
    guestPhoneInput.placeholder = '게스트 전화번호';
    guestPhoneInput.style.cssText = 'flex: 1; padding: 8px; display: none;';
    
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-sm btn-danger';
    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeBtn.onclick = () => memberDiv.remove();
    
    memberTypeSelect.onchange = function() {
        if (this.value === 'member') {
            memberSelect.style.display = 'block';
            guestNameInput.style.display = 'none';
            guestPhoneInput.style.display = 'none';
        } else {
            memberSelect.style.display = 'none';
            guestNameInput.style.display = 'block';
            guestPhoneInput.style.display = 'block';
        }
    };
    
    memberDiv.appendChild(memberTypeSelect);
    memberDiv.appendChild(memberSelect);
    memberDiv.appendChild(guestNameInput);
    memberDiv.appendChild(guestPhoneInput);
    memberDiv.appendChild(removeBtn);
    
    container.appendChild(memberDiv);
    
    // 인원 추가 버튼 업데이트
    updateAddMemberButton();
}

// 인원 추가 버튼 업데이트
function updateAddMemberButton() {
    const container = document.getElementById('assignmentMembersContainer');
    const memberCount = container.children.length;
    const addBtn = document.getElementById('addMemberBtn');
    
    if (memberCount >= 5) {
        addBtn.disabled = true;
        addBtn.style.opacity = '0.5';
    } else {
        addBtn.disabled = false;
        addBtn.style.opacity = '1';
    }
}

// 기존 배정 인원 로드
function loadAssignmentMembers(assignments) {
    const container = document.getElementById('assignmentMembersContainer');
    container.innerHTML = '';
    
    assignments.forEach(assignment => {
        const memberDiv = document.createElement('div');
        memberDiv.className = 'assignment-member-item';
        memberDiv.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; align-items: center;';
        
        const memberTypeSelect = document.createElement('select');
        memberTypeSelect.className = 'member-type-select';
        memberTypeSelect.style.cssText = 'flex: 1; padding: 8px;';
        
        const memberSelect = document.createElement('select');
        memberSelect.className = 'member-select';
        memberSelect.style.cssText = 'flex: 2; padding: 8px;';
        memberSelect.innerHTML = '<option value="">회원을 선택하세요</option>';
        
        // 회원을 이름 기준 가나다순으로 정렬
        const sortedMembers = [...members].sort((a, b) => {
            return a.name.localeCompare(b.name, 'ko');
        });
        
        sortedMembers.forEach(member => {
            const option = document.createElement('option');
            option.value = member.id;
            option.textContent = `${member.name} (${member.member_code})`;
            if (assignment.member_id === member.id) {
                option.selected = true;
            }
            memberSelect.appendChild(option);
        });
        
        const guestNameInput = document.createElement('input');
        guestNameInput.type = 'text';
        guestNameInput.className = 'guest-name-input';
        guestNameInput.placeholder = '게스트 이름';
        guestNameInput.style.cssText = 'flex: 1; padding: 8px;';
        if (assignment.guest_name) {
            guestNameInput.value = assignment.guest_name;
        }
        
        const guestPhoneInput = document.createElement('input');
        guestPhoneInput.type = 'text';
        guestPhoneInput.className = 'guest-phone-input';
        guestPhoneInput.placeholder = '게스트 전화번호';
        guestPhoneInput.style.cssText = 'flex: 1; padding: 8px;';
        if (assignment.guest_phone) {
            guestPhoneInput.value = assignment.guest_phone;
        }
        
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn btn-sm btn-danger';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.onclick = () => {
            memberDiv.remove();
            updateAddMemberButton();
        };
        
        if (assignment.member_id) {
            memberTypeSelect.innerHTML = '<option value="member" selected>회원</option><option value="guest">게스트</option>';
            memberSelect.style.display = 'block';
            guestNameInput.style.display = 'none';
            guestPhoneInput.style.display = 'none';
        } else {
            memberTypeSelect.innerHTML = '<option value="member">회원</option><option value="guest" selected>게스트</option>';
            memberSelect.style.display = 'none';
            guestNameInput.style.display = 'block';
            guestPhoneInput.style.display = 'block';
        }
        
        memberTypeSelect.onchange = function() {
            if (this.value === 'member') {
                memberSelect.style.display = 'block';
                guestNameInput.style.display = 'none';
                guestPhoneInput.style.display = 'none';
            } else {
                memberSelect.style.display = 'none';
                guestNameInput.style.display = 'block';
                guestPhoneInput.style.display = 'block';
            }
        };
        
        memberDiv.appendChild(memberTypeSelect);
        memberDiv.appendChild(memberSelect);
        memberDiv.appendChild(guestNameInput);
        memberDiv.appendChild(guestPhoneInput);
        memberDiv.appendChild(removeBtn);
        
        container.appendChild(memberDiv);
    });
    
    updateAddMemberButton();
}

// 예약 선택 시 날짜 업데이트 및 예약회원 자동 추가
function updateAssignmentDate() {
    const reservationId = document.getElementById('assignmentReservation').value;
    if (!reservationId) {
        // 예약이 선택되지 않으면 배정 인원 초기화
        document.getElementById('assignmentMembersContainer').innerHTML = '';
        return;
    }
    
    const reservation = reservations.find(r => r.id === reservationId);
    if (!reservation) return;
    
    // 기존 배정이 있는지 확인 (수정 모드)
    const existingAssignments = courtAssignments.filter(a => a.reservation_id === reservationId);
    
    if (existingAssignments.length > 0) {
        // 기존 배정이 있으면 그대로 로드
        loadAssignmentMembers(existingAssignments);
    } else {
        // 새 배정 추가 시 예약회원을 디폴트로 추가
        const container = document.getElementById('assignmentMembersContainer');
        container.innerHTML = '';
        
        if (reservation.member_id) {
            // 예약회원이 있으면 자동으로 추가
            addAssignmentMember(reservation.member_id);
        } else {
            // 예약회원이 없으면 빈 인원 추가
            addAssignmentMember();
        }
    }
}

// 코트 배정 폼 제출 처리
async function handleCourtAssignmentSubmit(e) {
    e.preventDefault();
    
    const reservationId = document.getElementById('assignmentReservation').value;
    if (!reservationId) {
        showNotification('예약을 선택해주세요.', 'error');
        return;
    }
    
    const reservation = reservations.find(r => r.id === reservationId);
    if (!reservation) {
        showNotification('선택한 예약을 찾을 수 없습니다.', 'error');
        return;
    }
    
    const assignmentDate = reservation.game_date || reservation.reservation_date;
    
    // 배정 인원 수집
    const memberItems = document.querySelectorAll('.assignment-member-item');
    const assignments = [];
    
    for (const item of memberItems) {
        const memberType = item.querySelector('.member-type-select').value;
        const memberSelect = item.querySelector('.member-select');
        const guestNameInput = item.querySelector('.guest-name-input');
        const guestPhoneInput = item.querySelector('.guest-phone-input');
        
        if (memberType === 'member') {
            const memberId = memberSelect.value;
            if (!memberId) {
                showNotification('모든 회원을 선택해주세요.', 'error');
                return;
            }
            
            // 동일일 중복 체크
            const existingAssignment = courtAssignments.find(a => 
                a.member_id === memberId && 
                (a.assignment_date === assignmentDate || a.aq_reservations?.game_date === assignmentDate) &&
                a.reservation_id !== reservationId
            );
            
            if (existingAssignment) {
                const memberName = members.find(m => m.id === memberId)?.name || '알 수 없음';
                showNotification(`${memberName}님은 ${assignmentDate}에 이미 배정되어 있습니다.`, 'error');
                return;
            }
            
            assignments.push({
                reservation_id: reservationId,
                member_id: memberId,
                guest_name: null,
                guest_phone: null,
                assignment_date: assignmentDate
            });
        } else {
            const guestName = guestNameInput.value.trim();
            const guestPhone = guestPhoneInput.value.trim();
            
            if (!guestName) {
                showNotification('게스트 이름을 입력해주세요.', 'error');
                return;
            }
            
            // 동일일 중복 체크 (게스트)
            const existingAssignment = courtAssignments.find(a => 
                a.guest_name === guestName && 
                a.guest_phone === guestPhone &&
                (a.assignment_date === assignmentDate || a.aq_reservations?.game_date === assignmentDate) &&
                a.reservation_id !== reservationId
            );
            
            if (existingAssignment) {
                showNotification(`${guestName}님은 ${assignmentDate}에 이미 배정되어 있습니다.`, 'error');
                return;
            }
            
            assignments.push({
                reservation_id: reservationId,
                member_id: null,
                guest_name: guestName,
                guest_phone: guestPhone || null,
                assignment_date: assignmentDate
            });
        }
    }
    
    if (assignments.length === 0) {
        showNotification('최소 1명 이상 배정해주세요.', 'error');
        return;
    }
    
    if (assignments.length > 5) {
        showNotification('최대 5명까지 배정할 수 있습니다.', 'error');
        return;
    }
    
    try {
        showLoading(true);
        
        if (editingId) {
            // 기존 배정 삭제 후 새로 추가
            const { error: deleteError } = await supabase
                .from('aq_court_assignments')
                .delete()
                .eq('reservation_id', reservationId);
            
            if (deleteError) throw deleteError;
        }
        
        // 새 배정 추가
        const { data: insertedAssignments, error: insertError } = await supabase
            .from('aq_court_assignments')
            .insert(assignments)
            .select('id');
        
        if (insertError) throw insertError;
        
        // 배정 완료 이메일 발송 (비동기로 실행, 실패해도 배정은 저장됨)
        if (insertedAssignments && insertedAssignments.length > 0) {
            sendCourtAssignmentEmails(reservationId, insertedAssignments.map(a => a.id))
                .catch(error => {
                    console.error('이메일 발송 실패:', error);
                    // 이메일 발송 실패는 조용히 처리 (배정은 성공했으므로)
                });
        }
        
        showNotification('코트 배정이 성공적으로 저장되었습니다.', 'success');
        await loadCourtAssignments();
        renderCourtAssignmentsTable();
        closeCourtAssignmentModal();
        
    } catch (error) {
        console.error('코트 배정 저장 오류:', error);
        showNotification('코트 배정 저장 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 코트 배정 모달 닫기
function closeCourtAssignmentModal() {
    document.getElementById('courtAssignmentModal').style.display = 'none';
    document.getElementById('courtAssignmentForm').reset();
    document.getElementById('assignmentMembersContainer').innerHTML = '';
    editingId = null;
}

// 코트 배정 수정
function editCourtAssignment(reservationId) {
    openCourtAssignmentModal(reservationId);
}

// 코트 배정 완료 이메일 발송
async function sendCourtAssignmentEmails(reservationId, assignmentIds) {
    try {
        // 전역 변수 supabaseUrl과 supabaseKey 사용
        const response = await fetch(`${supabaseUrl}/functions/v1/send-court-assignment-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
                'apikey': supabaseKey
            },
            body: JSON.stringify({
                reservationId: reservationId,
                assignmentIds: assignmentIds
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('이메일 발송 함수 호출 오류:', response.status, errorText);
            return;
        }

        const data = await response.json();
        console.log('이메일 발송 결과:', data);
        
        // 이메일 발송 결과 확인
        if (data && data.results) {
            const successCount = data.results.filter(r => r.status === 'success').length;
            const errorCount = data.results.filter(r => r.status === 'error').length;
            
            if (successCount > 0) {
                console.log(`✓ ${successCount}명에게 이메일 발송 완료`);
            }
            if (errorCount > 0) {
                console.warn(`⚠ ${errorCount}명에게 이메일 발송 실패`);
            }
        }
    } catch (error) {
        console.error('이메일 발송 함수 호출 중 오류:', error);
    }
}

// 코트 배정 삭제
async function deleteCourtAssignment(reservationId) {
    if (!confirm('정말로 이 코트 배정을 삭제하시겠습니까?')) return;
    
    try {
        showLoading(true);
        
        const { error } = await supabase
            .from('aq_court_assignments')
            .delete()
            .eq('reservation_id', reservationId);
        
        if (error) throw error;
        
        showNotification('코트 배정이 성공적으로 삭제되었습니다.', 'success');
        await loadCourtAssignments();
        renderCourtAssignmentsTable();
        
    } catch (error) {
        console.error('코트 배정 삭제 오류:', error);
        showNotification('코트 배정 삭제 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}


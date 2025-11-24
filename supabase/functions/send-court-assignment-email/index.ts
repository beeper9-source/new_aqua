// Supabase Edge Function: 코트 배정 완료 이메일 발송

// Deno runtime 사용 - 네이버 SMTP 사용

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Max-Age': '86400'
};

serve(async (req) => {
  // CORS preflight 요청 처리 (OPTIONS 메서드)
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204 // No Content (표준 CORS 응답)
    });
  }

  try {
    console.log('코트 배정 이메일 Edge Function 호출됨:', {
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers.entries())
    });

    // 요청 본문 파싱
    const requestBody = await req.json();
    console.log('요청 본문:', {
      reservationId: requestBody.reservationId,
      assignmentIds: requestBody.assignmentIds
    });

    const { reservationId, assignmentIds } = requestBody;

    if (!reservationId) {
      return new Response(
        JSON.stringify({ error: 'reservationId가 필요합니다.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Supabase 클라이언트 생성
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 예약 정보 조회 (코트, 경기일, 시간 등)
    const { data: reservation, error: reservationError } = await supabase
      .from('aq_reservations')
      .select(`
        id,
        game_date,
        start_time,
        end_time,
        aq_courts!court_id(name, court_number),
        aq_members!member_id(name, member_code)
      `)
      .eq('id', reservationId)
      .single();

    if (reservationError || !reservation) {
      throw new Error(`예약 정보 조회 실패: ${reservationError?.message || '예약을 찾을 수 없습니다.'}`);
    }

    // 배정 정보 조회
    let query = supabase
      .from('aq_court_assignments')
      .select(`
        id,
        member_id,
        guest_name,
        guest_phone,
        assignment_date,
        aq_members!member_id(id, name, email, member_code)
      `)
      .eq('reservation_id', reservationId);

    if (assignmentIds && assignmentIds.length > 0) {
      query = query.in('id', assignmentIds);
    }

    const { data: assignments, error: assignmentsError } = await query;

    if (assignmentsError) {
      throw assignmentsError;
    }

    if (!assignments || assignments.length === 0) {
      return new Response(
        JSON.stringify({ error: '배정 정보를 찾을 수 없습니다.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // 배정된 회원들의 이메일 정보 수집
    const emailResults = [];

    for (const assignment of assignments) {
      let recipientEmail: string | null = null;
      let recipientName: string = '';
      let isGuest = false;

      if (assignment.member_id && assignment.aq_members) {
        // 회원인 경우
        recipientEmail = assignment.aq_members.email;
        recipientName = assignment.aq_members.name || '알 수 없음';
      } else if (assignment.guest_name) {
        // 게스트인 경우 - 게스트는 이메일이 없으므로 스킵
        console.log(`게스트는 이메일이 없어 스킵: ${assignment.guest_name}`);
        continue;
      }

      if (!recipientEmail) {
        console.log(`이메일이 없는 회원: ${recipientName}`);
        emailResults.push({
          name: recipientName,
          email: null,
          status: 'skipped',
          reason: '이메일 정보 없음'
        });
        continue;
      }

      // 이메일 본문 생성
      const gameDate = reservation.game_date || '';
      const gameDateWithDay = gameDate ? `${gameDate} (${getDayOfWeek(gameDate)})` : '';
      const startTime = reservation.start_time || '';
      const endTime = reservation.end_time || '';
      const courtName = reservation.aq_courts?.name || '알 수 없는 코트';
      const reservationMemberName = reservation.aq_members?.name || '알 수 없음';

      // 배정된 인원 목록 생성
      const assignedMembers = assignments
        .map(a => {
          if (a.member_id && a.aq_members) {
            return a.aq_members.name || '알 수 없음';
          } else if (a.guest_name) {
            return `${a.guest_name} (게스트)`;
          }
          return '알 수 없음';
        })
        .filter(name => name !== '알 수 없음')
        .join(', ');

      const emailBody = generateCourtAssignmentEmailBody(
        recipientName,
        gameDateWithDay,
        courtName,
        startTime,
        endTime,
        reservationMemberName,
        assignedMembers
      );

      // 네이버 SMTP를 사용하여 이메일 발송
      const naverAccount = Deno.env.get('NAVER_EMAIL') || 'beeper9';
      const naverEmail = naverAccount.includes('@') ? naverAccount : `${naverAccount}@naver.com`;
      
      // 환경 변수에서 비밀번호 가져오기 (여러 가능한 변수명 시도)
      let naverPassword = Deno.env.get('NAVER_PASSWORD') || 
                          Deno.env.get('NAVER_EMAIL_PASSWORD') || 
                          Deno.env.get('NAVER_SMTP_PASSWORD');
      
      // 환경 변수에 비밀번호가 없으면 기본값 사용 (하지만 경고)
      if (!naverPassword) {
        console.warn('⚠️ 환경 변수에서 비밀번호를 찾을 수 없습니다. 기본값을 사용합니다.');
        console.warn('⚠️ Supabase 대시보드에서 NAVER_PASSWORD 환경 변수를 설정해주세요.');
        naverPassword = 'QCJ4HC81QPW7';
      }

      console.log(`네이버 SMTP 설정: 계정=${naverAccount}, 이메일=${naverEmail}, 비밀번호 길이=${naverPassword.length}`);

      try {
        console.log(`이메일 발송 시도: ${recipientEmail}`);
        const emailSent = await sendEmailViaNaverSMTP(
          naverEmail,
          naverPassword,
          recipientEmail,
          `[코트 배정 완료] ${gameDateWithDay} ${courtName} 배정 알림`,
          emailBody
        );

        if (emailSent) {
          emailResults.push({
            name: recipientName,
            email: recipientEmail,
            status: 'success'
          });
          console.log(`✓ 이메일 발송 성공: ${recipientEmail}`);
        } else {
          emailResults.push({
            name: recipientName,
            email: recipientEmail,
            status: 'error',
            error: '이메일 발송 실패 (SMTP 오류)'
          });
          console.log(`✗ 이메일 발송 실패: ${recipientEmail}`);
        }
      } catch (emailError) {
        const errorMessage = emailError?.message || '알 수 없는 오류';
        emailResults.push({
          name: recipientName,
          email: recipientEmail,
          status: 'error',
          error: errorMessage
        });
        console.error(`이메일 발송 오류 (${recipientEmail}):`, {
          message: errorMessage,
          stack: emailError?.stack,
          name: emailError?.name
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: '코트 배정 이메일 발송 완료',
      results: emailResults
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });

  } catch (error) {
    console.error('Edge Function 오류 발생:', {
      message: error?.message || '알 수 없는 오류',
      stack: error?.stack,
      name: error?.name,
      cause: error?.cause
    });

    return new Response(JSON.stringify({
      success: false,
      error: error?.message || '알 수 없는 오류',
      details: process.env.DENO_ENV === 'development' ? {
        stack: error?.stack,
        name: error?.name
      } : undefined
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});

// 요일 구하기 함수
function getDayOfWeek(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[date.getDay()];
}

// 코트 배정 이메일 본문 생성 함수
function generateCourtAssignmentEmailBody(
  recipientName: string,
  gameDateWithDay: string,
  courtName: string,
  startTime: string,
  endTime: string,
  reservationMemberName: string,
  assignedMembers: string
) {
  const simpleStartTime = startTime ? `${parseInt(startTime.split(':')[0])}시` : '';
  const simpleEndTime = endTime ? `${parseInt(endTime.split(':')[0])}시` : '';
  const timeRange = simpleStartTime && simpleEndTime ? `${simpleStartTime} - ${simpleEndTime}` : simpleStartTime || '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
          color: white;
          padding: 20px;
          border-radius: 8px 8px 0 0;
          text-align: center;
        }
        .content {
          background: #f8f9fa;
          padding: 30px;
          border-radius: 0 0 8px 8px;
        }
        .assignment-info {
          background: white;
          padding: 20px;
          border-radius: 6px;
          margin: 20px 0;
          border-left: 4px solid #4CAF50;
        }
        .info-row {
          margin: 15px 0;
          padding: 10px 0;
          border-bottom: 1px solid #e9ecef;
        }
        .info-row:last-child {
          border-bottom: none;
        }
        .info-label {
          font-weight: bold;
          color: #6c757d;
          margin-bottom: 5px;
        }
        .info-value {
          font-size: 1.1em;
          color: #333;
        }
        .members-list {
          background: #e8f5e9;
          padding: 15px;
          border-radius: 4px;
          margin-top: 10px;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #6c757d;
          font-size: 0.9em;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>코트 배정 완료</h1>
      </div>
      <div class="content">
        <p>안녕하세요, <strong>${recipientName}</strong>님,</p>
        <p>코트 배정이 완료되었습니다.</p>
        
        <div class="assignment-info">
          <div class="info-row">
            <div class="info-label">경기일</div>
            <div class="info-value">${gameDateWithDay}</div>
          </div>
          <div class="info-row">
            <div class="info-label">코트</div>
            <div class="info-value">${courtName}</div>
          </div>
          <div class="info-row">
            <div class="info-label">시간</div>
            <div class="info-value">${timeRange}</div>
          </div>
          <div class="info-row">
            <div class="info-label">예약 회원</div>
            <div class="info-value">${reservationMemberName}</div>
          </div>
          <div class="info-row">
            <div class="info-label">배정 인원</div>
            <div class="members-list">
              ${assignedMembers}
            </div>
          </div>
        </div>
        
        <p>경기 당일 시간을 준수하여 참석해 주시기 바랍니다.</p>
        
        <div class="footer">
          <p>이 이메일은 자동으로 발송되었습니다.</p>
          <p>문의사항이 있으시면 관리자에게 연락해 주세요.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// 네이버 SMTP를 사용한 이메일 발송 함수
async function sendEmailViaNaverSMTP(
  senderEmail: string,
  senderPassword: string,
  receiverEmail: string,
  subject: string,
  htmlBody: string
): Promise<boolean> {
  try {
    // SMTP 서버 설정
    const smtpServer = "smtp.naver.com";
    const smtpPort = 465; // SSL/TLS 포트

    // 이메일 메시지 구성
    const message = createEmailMessage(senderEmail, receiverEmail, subject, htmlBody);

    // SMTP 연결 (465 포트는 직접 TLS 연결)
    console.log(`SMTP 서버 연결 시도: ${smtpServer}:${smtpPort} (SSL/TLS)`);
    let tlsConn;
    try {
      tlsConn = await Deno.connectTls({
        hostname: smtpServer,
        port: smtpPort
      });
      console.log('SMTP 서버 TLS 연결 성공');
    } catch (connectError) {
      throw new Error(`SMTP 서버 연결 실패: ${connectError?.message || '알 수 없는 오류'}`);
    }

    const tlsEncoder = new TextEncoder();
    const tlsDecoder = new TextDecoder();

    // SMTP 프로토콜 처리
    let response = await readSMTPResponse(tlsConn, tlsDecoder);
    console.log('SMTP 초기 응답:', response);
    if (!response || !response.startsWith('220')) {
      tlsConn.close();
      throw new Error(`SMTP 연결 실패: ${response || '(응답 없음)'}`);
    }

    // EHLO 명령
    const hostname = 'localhost';
    await writeSMTPCommand(tlsConn, tlsEncoder, `EHLO ${hostname}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    response = await readSMTPResponse(tlsConn, tlsDecoder);
    console.log('EHLO 응답:', response);
    if (!response || response.trim() === '') {
      tlsConn.close();
      throw new Error('EHLO 실패: 응답이 없습니다');
    }
    if (!response.startsWith('250')) {
      tlsConn.close();
      throw new Error(`EHLO 실패: ${response}`);
    }

    // AUTH LOGIN
    await writeSMTPCommand(tlsConn, tlsEncoder, 'AUTH LOGIN');
    response = await readSMTPResponse(tlsConn, tlsDecoder);
    if (!response.startsWith('334')) {
      tlsConn.close();
      throw new Error(`AUTH LOGIN 실패: ${response}`);
    }

    // 사용자명 전송 (base64 인코딩)
    const username = senderEmail.split('@')[0];
    const usernameB64 = btoa(username);
    console.log(`사용자명 인증 시도: ${username}`);
    await writeSMTPCommand(tlsConn, tlsEncoder, usernameB64);
    response = await readSMTPResponse(tlsConn, tlsDecoder);
    console.log(`사용자명 인증 응답: ${response}`);
    if (!response.startsWith('334')) {
      tlsConn.close();
      throw new Error(`사용자명 인증 실패: ${response}`);
    }
    console.log(`✓ 사용자명 인증 성공`);

    // 비밀번호 전송 (base64 인코딩)
    const passwordB64 = btoa(senderPassword);
    console.log(`=== SMTP 인증 시작 ===`);
    console.log(`사용자명: ${username} (base64: ${usernameB64})`);
    console.log(`전체 이메일 주소: ${senderEmail}`);
    console.log(`비밀번호 길이: ${senderPassword.length}`);
    console.log(`비밀번호 첫 2자: ${senderPassword.substring(0, 2)}***`);
    console.log(`⚠️ 네이버 SMTP 인증 실패 시 확인사항:`);
    console.log(`   1. 네이버 메일 → 환경설정 → POP3/IMAP 설정 → "외부 메일 프로그램 사용" 활성화`);
    console.log(`   2. 네이버 계정 비밀번호가 정확한지 확인`);
    console.log(`   3. 2단계 인증 활성화 시 앱 비밀번호 사용 필요`);
    
    await writeSMTPCommand(tlsConn, tlsEncoder, passwordB64);
    response = await readSMTPResponse(tlsConn, tlsDecoder);
    console.log(`비밀번호 인증 응답: ${response}`);
    if (!response.startsWith('235')) {
      tlsConn.close();
      const errorMsg = `비밀번호 인증 실패: ${response}`;
      console.error(`❌ ${errorMsg}`);
      console.error(`사용자명: ${username}, 전체 이메일: ${senderEmail}`);
      console.error(`비밀번호 길이: ${senderPassword.length}, 첫 2자: ${senderPassword.substring(0, 2)}`);
      console.error(`🔴 네이버 SMTP 인증 실패 원인 가능성:`);
      console.error(`   1. 네이버 메일 외부 프로그램 사용 설정이 꺼져 있음`);
      console.error(`   2. 비밀번호가 잘못됨 (현재: ${senderPassword.substring(0, 2)}***)`);
      console.error(`   3. 2단계 인증 활성화되어 앱 비밀번호 필요`);
      throw new Error(errorMsg);
    }
    console.log(`✓ 비밀번호 인증 성공`);

    // MAIL FROM
    await writeSMTPCommand(tlsConn, tlsEncoder, `MAIL FROM:<${senderEmail}>`);
    response = await readSMTPResponse(tlsConn, tlsDecoder);
    if (!response.startsWith('250')) {
      tlsConn.close();
      throw new Error(`MAIL FROM 실패: ${response}`);
    }

    // RCPT TO
    await writeSMTPCommand(tlsConn, tlsEncoder, `RCPT TO:<${receiverEmail}>`);
    response = await readSMTPResponse(tlsConn, tlsDecoder);
    if (!response.startsWith('250')) {
      tlsConn.close();
      throw new Error(`RCPT TO 실패: ${response}`);
    }

    // DATA
    await writeSMTPCommand(tlsConn, tlsEncoder, 'DATA');
    response = await readSMTPResponse(tlsConn, tlsDecoder);
    if (!response.startsWith('354')) {
      tlsConn.close();
      throw new Error(`DATA 실패: ${response}`);
    }

    // 메시지 본문 전송
    const messageLines = message.split('\r\n');
    for (const line of messageLines) {
      await writeSMTPCommand(tlsConn, tlsEncoder, line);
    }

    // 종료 마커 전송
    await writeSMTPCommand(tlsConn, tlsEncoder, '.');
    response = await readSMTPResponse(tlsConn, tlsDecoder);
    if (!response.startsWith('250')) {
      tlsConn.close();
      throw new Error(`메시지 전송 실패: ${response}`);
    }

    // QUIT
    await writeSMTPCommand(tlsConn, tlsEncoder, 'QUIT');
    response = await readSMTPResponse(tlsConn, tlsDecoder);
    tlsConn.close();

    console.log(`✓ 메일 발송 성공: ${receiverEmail}`);
    return true;

  } catch (error) {
    const errorMessage = error?.message || '알 수 없는 SMTP 오류';
    console.error(`✗ 메일 발송 실패: ${errorMessage}`);
    return false;
  }
}

// SMTP 명령 전송 헬퍼 함수
async function writeSMTPCommand(conn: Deno.TlsConn, encoder: TextEncoder, command: string) {
  const data = encoder.encode(command + '\r\n');
  await conn.write(data);
}

// SMTP 응답 읽기 헬퍼 함수
async function readSMTPResponse(conn: Deno.TlsConn, decoder: TextDecoder): Promise<string> {
  let fullResponse = '';
  const buffer = new Uint8Array(4096);
  let timeoutCount = 0;
  const maxTimeout = 50;
  let hasData = false;

  while (timeoutCount < maxTimeout) {
    const n = await conn.read(buffer);
    if (n === null || n === 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      timeoutCount++;
      if (hasData && fullResponse.trim().length > 0) {
        const lines = fullResponse.split('\r\n').filter((line) => line.trim().length > 0);
        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1].trim();
          if (lastLine.match(/^\d{3}(\s|$)/)) {
            break;
          }
        }
      }
      continue;
    }

    hasData = true;
    const chunk = decoder.decode(buffer.subarray(0, n));
    fullResponse += chunk;

    const lines = fullResponse.split('\r\n').filter((line) => line.trim().length > 0);
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1].trim();
      if (lastLine.match(/^\d{3}(\s|$)/)) {
        break;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const trimmedResponse = fullResponse.trim();
  if (trimmedResponse === '') {
    throw new Error('SMTP 응답 읽기 타임아웃: 응답이 없습니다');
  }

  return trimmedResponse;
}

// 이메일 메시지 생성 함수
function createEmailMessage(from: string, to: string, subject: string, htmlBody: string): string {
  function toBase64(str: string): string {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  const encodedSubject = `=?UTF-8?B?${toBase64(subject)}?=`;
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const encodedHtmlBody = toBase64(htmlBody);

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    encodedHtmlBody,
    `--${boundary}--`
  ].join('\r\n');
}


const API_URL = "https://script.google.com/macros/s/AKfycbzjveYTkQRe5h7OP1AkuJEpI4UrRHY1v83G-luKPjkNm4yUqogRr_4HTm5l9-vEqxg/exec"; 

let bpChart = null;
let currentRange = 'week';
let currentType = '';
let currentTargetDate = new Date(); 
let currentFilteredData = [];
let userId = localStorage.getItem('bp_user_id');

document.addEventListener('DOMContentLoaded', async () => {
    await checkUserId();
    initApp();
});

async function checkUserId() {
    if (userId) { document.getElementById('user-info').innerText = `👤 用戶: ${userId}`; return; }
    const modal = document.getElementById('login-modal');
    const input = document.getElementById('login-input');
    const btn = document.getElementById('confirm-login-btn');
    modal.style.display = 'flex';
    return new Promise((resolve) => {
        btn.onclick = async () => {
            let id = input.value.trim();
            if (!id) { alert("請輸入代號喔！"); return; }
            btn.disabled = true; btn.innerText = "心跳同步中...";
            try {
                const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "check", userId: id }) });
                const result = await res.json();
                if (result.exists) {
                    if (confirm(`歡迎回來！發現了「${id}」的數據。\n是否要同步找回您的健康日誌呢？`)) {
                        localStorage.setItem('bp_records', '[]'); finishLogin(id, modal); resolve();
                    } else { btn.disabled = false; btn.innerText = "開啟連線"; }
                } else {
                    localStorage.setItem('bp_records', '[]'); finishLogin(id, modal); resolve();
                }
            } catch (e) { finishLogin(id, modal); resolve(); }
        };
    });
}

function finishLogin(id, modal) { userId = id; localStorage.setItem('bp_user_id', userId); modal.style.display = 'none'; document.getElementById('user-info').innerText = `👤 用戶: ${userId}`; }
function resetUser() { if(confirm("切換代號將連結不同的雲端數據，確定更換嗎？")) { localStorage.removeItem('bp_user_id'); localStorage.setItem('bp_records', '[]'); location.reload(); } }

async function initApp() { updateTargetDateDisplay(); await syncFromCloud(); }
async function syncFromCloud() {
    if (!API_URL.startsWith("https")) return;
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "read", userId: userId }) });
        const cloudRecords = await response.json();
        if (cloudRecords && cloudRecords.length > 0) { localStorage.setItem('bp_records', JSON.stringify(cloudRecords)); }
    } catch (e) { console.log("同步中..."); }
    checkTodayStatus(); refreshDisplay();
}

function handleRangeClick(range) {
    currentRange = range;
    const panel = document.getElementById('custom-date-panel');
    document.querySelectorAll('.filter-buttons button').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${range}`).classList.add('active');
    if (range === 'custom') { panel.style.display = 'block'; } else { panel.style.display = 'none'; refreshDisplay(); }
}

function applyCustomRange() {
    const s = document.getElementById('start-date').value;
    const e = document.getElementById('end-date').value;
    if (!s || !e) { alert("請填寫完整日期喔！"); return; }
    refreshDisplay();
}

function refreshDisplay() {
    const all = JSON.parse(localStorage.getItem('bp_records') || '[]');
    const { filtered, start, end } = filterRecordsByRange(all);
    currentFilteredData = filtered;
    document.getElementById('card-date-display').innerText = (currentRange === 'today') ? `${start}` : `${start} ~ ${end}`;
    document.getElementById('history-list').innerHTML = filtered.slice(0, 5).map(r => `
        <div class="history-item">
            <div style="font-size:0.9rem;color:#999;margin-bottom:5px;">${r.date} · ${r.type === 'morning' ? '早晨' : '晚間'}</div>
            <div style="display:flex;justify-content:space-between;font-weight:900;font-size:1.3rem;color:#333;">
                <span>${r.sys}/${r.dia} <small style="font-size:0.8rem;color:#999;">mmHg</small></span>
                <span>💓 ${r.pulse}</span>
            </div>
        </div>`).join('');
    updateChart(filtered); calculateSummary(filtered);
}

function calculateSummary(filtered) {
    const avgText = document.getElementById('avg-text');
    const tipContent = document.getElementById('tip-content');
    if (filtered.length === 0) { avgText.innerText = "期待您的記錄"; tipContent.innerText = "開始記錄，讓我們給您健康建議！"; return; }
    const avgSys = Math.round(filtered.reduce((acc, r) => acc + r.sys, 0) / filtered.length);
    const avgDia = Math.round(filtered.reduce((acc, r) => acc + r.dia, 0) / filtered.length);
    avgText.innerText = `${avgSys}/${avgDia} mmHg`;
    if (avgSys >= 140 || avgDia >= 90) { tipContent.innerText = "⚠️ 平均數值偏高：請注意清淡飲食，建議與醫師聊聊喔。"; }
    else if (avgSys >= 130 || avgDia >= 80) { tipContent.innerText = "🟡 數值稍微偏高：最近勞累嗎？早點睡覺對血壓很有幫助！"; }
    else if (avgSys <= 90 || avgDia <= 60) { tipContent.innerText = "🔵 數值稍微偏低：起身請放慢，多補充水分與營養喔。"; }
    else if (avgSys <= 110 && avgDia <= 70) { tipContent.innerText = "✨ 數值非常理想：管理相當優秀！請繼續維持好習慣。"; }
    else { tipContent.innerText = "✅ 數值在正常範圍：目前很穩定，記得定時紀錄守護每一天。"; }
}

function filterRecordsByRange(records) {
    const now = new Date(); let s = new Date(); let e = new Date();
    if (currentRange === 'today') { s.setHours(0,0,0,0); e.setHours(23,59,59,999); }
    else if (currentRange === 'week') { s.setDate(now.getDate() - 7); s.setHours(0,0,0,0); }
    else if (currentRange === 'month') { s.setMonth(now.getMonth() - 1); s.setHours(0,0,0,0); }
    else if (currentRange === 'custom') { 
        const sv = document.getElementById('start-date').value;
        const ev = document.getElementById('end-date').value;
        if (sv && ev) { s = new Date(sv); e = new Date(ev); s.setHours(0,0,0,0); e.setHours(23,59,59,999); }
    }
    const filtered = records.filter(r => r.timestamp >= s.getTime() && r.timestamp <= e.getTime());
    return { filtered, start: s.toLocaleDateString('zh-TW'), end: e.toLocaleDateString('zh-TW') };
}

// PDF 終極優化：確保數據分行與不跑版
async function exportPDF() {
    const btn = document.querySelector('.btn-pdf-large'); btn.innerText = "⏳ 製作中...";
    document.getElementById('pdf-range-display').innerText = document.getElementById('card-date-display').innerText;
    document.getElementById('pdf-avg-text').innerText = document.getElementById('avg-text').innerText;
    const tableBody = document.getElementById('pdf-table-body');
    if (currentFilteredData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="padding:30px; border:1px solid #000;">尚未有紀錄數據</td></tr>';
    } else {
        // 重要邏輯：每一筆紀錄單獨一行
        tableBody.innerHTML = currentFilteredData.sort((a, b) => b.timestamp - a.timestamp).map(r => `
            <tr style="border-bottom: 2px solid #000;">
                <td style="border: 1.5px solid #000; padding: 18px; white-space: nowrap;">${r.date}</td>
                <td style="border: 1.5px solid #000; padding: 18px; white-space: nowrap;">${r.type === 'morning' ? '早晨' : '晚間'}</td>
                <td style="border: 1.5px solid #000; padding: 18px; font-weight: bold; font-size: 22px; white-space: nowrap;">${r.sys} / ${r.dia}</td>
                <td style="border: 1.5px solid #000; padding: 18px; white-space: nowrap;">${r.pulse}</td>
            </tr>`).join('');
    }
    const element = document.getElementById('pdf-template');
    const opt = { 
        margin: [10, 5], filename: `血壓記錄報表_${userId}.pdf`, image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, windowWidth: 800 }, // 鎖定寬度解決斷行
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    try { await html2pdf().set(opt).from(element).save(); } catch(e) { alert("PDF 產出異常"); } finally { btn.innerText = "📄 產出 PDF 報表"; }
}

function shareToLine() {
    const avg = document.getElementById('avg-text').innerText;
    const dateRange = document.getElementById('card-date-display').innerText;
    const tip = document.getElementById('tip-content').innerText;
    const msg = `【心跳守護｜雲端血壓日誌 🧡】\n👤 帳號名稱：${userId}\n📅 紀錄日期：${dateRange}\n📈 平均血壓：${avg}\n💡 溫馨建議：${tip}\n\n紀錄今天，守護明天。讓我們一起維持健康好習慣！`;
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(msg)}`, '_blank');
}

function updateTargetDateDisplay() { document.getElementById('target-date-display').innerText = currentTargetDate.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }); }
function changeDate(offset) { currentTargetDate.setDate(currentTargetDate.getDate() + offset); updateTargetDateDisplay(); checkTodayStatus(); refreshDisplay(); }
function openModal(type) { currentType = type; document.getElementById('modal-title').innerText = (type === 'morning' ? '☀️ 早晨健康時間' : '🌙 晚間放鬆時間'); document.getElementById('log-modal').style.display = 'flex'; }
function closeModal() { document.getElementById('log-modal').style.display = 'none'; document.querySelectorAll('#log-modal input').forEach(i => i.value = ''); }
async function saveData() {
    const sys = parseInt(document.getElementById('sys').value, 10);
    const dia = parseInt(document.getElementById('dia').value, 10);
    const pulse = parseInt(document.getElementById('pulse').value, 10);
    if (isNaN(sys) || isNaN(dia) || isNaN(pulse)) { alert("請填入數字喔！"); return; }
    const record = { timestamp: currentTargetDate.getTime(), type: currentType, date: currentTargetDate.toLocaleDateString('zh-TW'), sys, dia, pulse };
    let records = JSON.parse(localStorage.getItem('bp_records') || '[]');
    records = records.filter(r => !(r.date === record.date && r.type === record.type));
    records.unshift(record); localStorage.setItem('bp_records', JSON.stringify(records));
    closeModal(); refreshDisplay(); checkTodayStatus();
    if (API_URL.startsWith("https")) { fetch(API_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: "save", userId: userId, record: record }) }); }
}
function updateChart(filtered) { const ctx = document.getElementById('bpChart').getContext('2d'); if (bpChart) bpChart.destroy(); if (filtered.length === 0) return; const sorted = [...filtered].sort((a, b) => a.timestamp - b.timestamp); bpChart = new Chart(ctx, { type: 'line', data: { labels: sorted.map(r => r.date.slice(5)), datasets: [{ label: '收縮壓', data: sorted.map(r => r.sys), borderColor: '#A2D2FF', tension: 0.3 }, { label: '舒張壓', data: sorted.map(r => r.dia), borderColor: '#FFC2C7', tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false } }); }
function checkTodayStatus() {
    const targetKey = currentTargetDate.toLocaleDateString('zh-TW');
    const records = JSON.parse(localStorage.getItem('bp_records') || '[]');
    const mRec = records.find(r => r.date === targetKey && r.type === 'morning');
    const eRec = records.find(r => r.date === targetKey && r.type === 'evening');
    document.getElementById('morning-card').className = 'log-card morning' + (mRec ? ' morning-done completed' : '');
    document.getElementById('morning-status').innerText = mRec ? `已填: ${mRec.sys}/${mRec.dia}` : '尚未填寫';
    document.getElementById('evening-card').className = 'log-card evening' + (eRec ? ' evening-done completed' : '');
    document.getElementById('evening-status').innerText = eRec ? `已填: ${eRec.sys}/${eRec.dia}` : '尚未填寫';
}
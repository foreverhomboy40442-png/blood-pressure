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
    if (userId) {
        document.getElementById('user-info').innerText = `👤 用戶: ${userId}`;
        return;
    }
    const modal = document.getElementById('login-modal');
    const input = document.getElementById('login-input');
    const btn = document.getElementById('confirm-login-btn');
    modal.style.display = 'flex';
    return new Promise((resolve) => {
        btn.onclick = async () => {
            let id = input.value.trim();
            if (!id) { alert("請溫馨提醒自己輸入代號喔！"); return; }
            btn.disabled = true; btn.innerText = "心跳同步中...";
            try {
                const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "check", userId: id }) });
                const result = await res.json();
                if (result.exists) {
                    if (confirm(`歡迎回來！發現了「${id}」的數據。\n是否要同步找回您的健康日誌呢？`)) {
                        localStorage.setItem('bp_records', '[]'); 
                        finishLogin(id, modal); resolve();
                    } else { btn.disabled = false; btn.innerText = "開啟健康連線"; }
                } else {
                    localStorage.setItem('bp_records', '[]'); 
                    finishLogin(id, modal); resolve();
                }
            } catch (e) { finishLogin(id, modal); resolve(); }
        };
    });
}

function finishLogin(id, modal) {
    userId = id;
    localStorage.setItem('bp_user_id', userId);
    modal.style.display = 'none';
    document.getElementById('user-info').innerText = `👤 用戶: ${userId}`;
}

function resetUser() {
    if(confirm("切換代號將連結不同的雲端數據，確定更換嗎？")) {
        localStorage.removeItem('bp_user_id');
        localStorage.setItem('bp_records', '[]'); 
        location.reload();
    }
}

async function initApp() {
    updateTargetDateDisplay();
    await syncFromCloud();
}

async function syncFromCloud() {
    if (!API_URL.startsWith("https")) return;
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "read", userId: userId }) });
        const cloudRecords = await response.json();
        if (cloudRecords && cloudRecords.length > 0) {
            localStorage.setItem('bp_records', JSON.stringify(cloudRecords));
        }
    } catch (e) { console.log("同步中..."); }
    checkTodayStatus();
    refreshDisplay();
}

function handleRangeClick(range) {
    currentRange = range;
    const panel = document.getElementById('custom-date-panel');
    document.querySelectorAll('.filter-buttons button').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${range}`).classList.add('active');
    if (range === 'custom') {
        panel.style.display = 'block';
    } else {
        panel.style.display = 'none';
        refreshDisplay();
    }
}

function applyCustomRange() {
    const s = document.getElementById('start-date').value;
    const e = document.getElementById('end-date').value;
    if (!s || !e) { alert("請填寫完整的開始與結束日期喔！"); return; }
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
    updateChart(filtered);
    calculateSummary(filtered);
}

function calculateSummary(filtered) {
    const avgText = document.getElementById('avg-text');
    const tipContent = document.getElementById('tip-content');
    if (filtered.length === 0) { avgText.innerText = "期待您的第一筆記錄"; tipContent.innerText = "開始記錄血壓，讓我們能給您更精準的健康建議喔！"; return; }
    const avgSys = Math.round(filtered.reduce((acc, r) => acc + r.sys, 0) / filtered.length);
    const avgDia = Math.round(filtered.reduce((acc, r) => acc + r.dia, 0) / filtered.length);
    avgText.innerText = `${avgSys}/${avgDia} mmHg`;
    if (avgSys >= 140 || avgDia >= 90) { tipContent.innerText = "⚠️ 平均數值偏高：請注意清淡飲食，減少鈉含量攝取，並建議與醫師聊聊喔。"; }
    else if (avgSys >= 130 || avgDia >= 80) { tipContent.innerText = "🟡 數值稍微偏高：最近可能比較勞累嗎？記得多喝水、多休息，早點睡覺對血壓很有幫助！"; }
    else if (avgSys <= 90 || avgDia <= 60) { tipContent.innerText = "🔵 數值稍微偏低：起身時請放慢動作，多攝取充足的水分與營養，避免眩暈發生喔。"; }
    else if (avgSys <= 110 && avgDia <= 70) { tipContent.innerText = "✨ 數值非常理想：您的體態管理與作息相當優秀！請繼續維持這份好習慣。"; }
    else { tipContent.innerText = "✅ 數值在正常範圍：目前的數值很穩定，平時記得定時紀錄，守護您的每一天。"; }
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

async function exportPDF() {
    const btn = document.querySelector('.btn-pdf-large'); btn.innerText = "⏳ 製作中...";
    document.getElementById('pdf-user-info').innerText = `專屬健康 ID：${userId} | 報表日期：${new Date().toLocaleDateString()}`;
    document.getElementById('pdf-avg-summary').innerText = `期間平均血壓：${document.getElementById('avg-text').innerText}`;
    const tableBody = document.getElementById('pdf-table-body');
    tableBody.innerHTML = currentFilteredData.sort((a, b) => b.timestamp - a.timestamp).map(r => `<tr><td style="border:1px solid #ddd; padding:12px;">${r.date}</td><td style="border:1px solid #ddd; padding:12px; text-align:center;">${r.type === 'morning' ? '早晨' : '晚間'}</td><td style="border:1px solid #ddd; padding:12px; text-align:center; font-weight:bold;">${r.sys} / ${r.dia}</td><td style="border:1px solid #ddd; padding:12px; text-align:center;">${r.pulse}</td></tr>`).join('');
    const element = document.getElementById('pdf-template');
    try { await html2pdf().from(element).save(`健康報告_${userId}.pdf`); } finally { btn.innerText = "📄 產出 PDF 報表"; }
}

function shareToLine() {
    const avg = document.getElementById('avg-text').innerText;
    const msg = `【健康日誌回報 🧡】\n👤 帳號：${userId}\n📈 平均血壓：${avg}\n📊 統計：${currentFilteredData.length} 筆\n紀錄今天，守護明天！`;
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
    records.unshift(record);
    localStorage.setItem('bp_records', JSON.stringify(records));
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
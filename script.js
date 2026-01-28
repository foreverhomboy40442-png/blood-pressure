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

// 雲端帳號檢查與同步
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
            let inputId = input.value.trim();
            if (inputId === "") { alert("請輸入代號"); return; }
            btn.disabled = true; btn.innerText = "同步中...";
            try {
                const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "check", userId: inputId }) });
                const result = await res.json();
                if (result.exists) {
                    if (confirm(`代號「${inputId}」已有雲端紀錄。\n確認要同步完整的健康日誌嗎？`)) {
                        localStorage.setItem('bp_records', '[]'); // 先清空
                        finishLogin(inputId, modal); resolve();
                    } else { btn.disabled = false; btn.innerText = "開啟雲端同步"; }
                } else {
                    localStorage.setItem('bp_records', '[]'); // 新帳號清空
                    finishLogin(inputId, modal); resolve();
                }
            } catch (e) {
                localStorage.setItem('bp_records', '[]'); finishLogin(inputId, modal); resolve();
            }
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
    if(confirm("切換帳號會同步雲端數據，確定更換嗎？")) {
        localStorage.removeItem('bp_user_id');
        localStorage.setItem('bp_records', '[]'); //
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

async function saveData() {
    const sys = parseInt(document.getElementById('sys').value, 10);
    const dia = parseInt(document.getElementById('dia').value, 10);
    const pulse = parseInt(document.getElementById('pulse').value, 10);
    if (isNaN(sys) || isNaN(dia) || isNaN(pulse)) { alert("請輸入數字"); return; }
    
    const record = {
        timestamp: currentTargetDate.getTime(),
        type: currentType,
        date: currentTargetDate.toLocaleDateString('zh-TW'),
        sys, dia, pulse
    };

    let records = JSON.parse(localStorage.getItem('bp_records') || '[]');
    records = records.filter(r => !(r.date === record.date && r.type === record.type));
    records.unshift(record);
    localStorage.setItem('bp_records', JSON.stringify(records));

    closeModal();
    refreshDisplay();
    checkTodayStatus();

    if (API_URL.startsWith("https")) {
        fetch(API_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: "save", userId: userId, record: record }) });
    }
}

function refreshDisplay() {
    const all = JSON.parse(localStorage.getItem('bp_records') || '[]');
    const now = new Date();
    const weekAgo = now.setDate(now.getDate() - 7);
    const filtered = all.filter(r => r.timestamp >= weekAgo);
    currentFilteredData = filtered;
    
    document.getElementById('card-date-display').innerText = `近一週平均`;
    document.getElementById('history-list').innerHTML = filtered.slice(0, 5).map(r => `
        <div class="history-item">
            <div style="font-size:0.8rem;color:#999">${r.date} (${r.type === 'morning' ? '早' : '晚'})</div>
            <div style="display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem">
                <span>${r.sys}/${r.dia} mmHg</span>
                <span>💓 ${r.pulse}</span>
            </div>
        </div>`).join('');
    
    updateChart(filtered);
    calculateSummary(filtered);
}

// 產出 PDF 修正
async function exportPDF() {
    const btn = document.querySelector('.btn-pdf-large');
    btn.innerText = "⏳ 產出中...";
    
    document.getElementById('pdf-user-name').innerText = `用戶代號：${userId}`;
    document.getElementById('pdf-avg-main').innerText = document.getElementById('avg-text').innerText;
    
    const tableBody = document.getElementById('pdf-table-body');
    tableBody.innerHTML = currentFilteredData.sort((a, b) => b.timestamp - a.timestamp).map(r => `
        <tr>
            <td style="border:1px solid #ddd; padding:10px;">${r.date}</td>
            <td style="border:1px solid #ddd; padding:10px; text-align:center;">${r.type === 'morning' ? '早晨' : '晚間'}</td>
            <td style="border:1px solid #ddd; padding:10px; text-align:center; font-weight:bold;">${r.sys}/${r.dia}</td>
            <td style="border:1px solid #ddd; padding:10px; text-align:center;">${r.pulse}</td>
        </tr>`).join('');
    
    const element = document.getElementById('pdf-template');
    const opt = { 
        margin: 10, filename: `血壓報告_${userId}.pdf`,
        html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    try { await html2pdf().set(opt).from(element).save(); } finally { btn.innerText = "📄 產出 PDF 報表"; }
}

function shareToLine() {
    const avgText = document.getElementById('avg-text').innerText;
    const count = currentFilteredData.length;
    const msg = `【心跳守護回報】\n👤 用戶：${userId}\n📈 ${avgText}\n📊 統計筆數：${count} 筆\n隨時記錄，守護健康！`;
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(msg)}`, '_blank');
}

function updateChart(filtered) { 
    const ctx = document.getElementById('bpChart').getContext('2d'); if (bpChart) bpChart.destroy(); if (filtered.length === 0) return; 
    const sorted = [...filtered].sort((a, b) => a.timestamp - b.timestamp); 
    bpChart = new Chart(ctx, { type: 'line', data: { labels: sorted.map(r => r.date.slice(5)), datasets: [{ label: '收縮壓', data: sorted.map(r => r.sys), borderColor: '#A2D2FF', tension: 0.3 }, { label: '舒張壓', data: sorted.map(r => r.dia), borderColor: '#FFC2C7', tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false } }); 
}

function calculateSummary(filtered) {
    const avgText = document.getElementById('avg-text');
    const subAvgText = document.getElementById('sub-avg-text');
    if (filtered.length === 0) { avgText.innerText = "尚無資料"; subAvgText.innerText = ""; return; }
    const avgSys = Math.round(filtered.reduce((acc, r) => acc + r.sys, 0) / filtered.length);
    const avgDia = Math.round(filtered.reduce((acc, r) => acc + r.dia, 0) / filtered.length);
    avgText.innerText = `平均值：${avgSys}/${avgDia} mmHg`;
    subAvgText.innerText = `統計筆數：${filtered.length} 筆`;
}

function updateTargetDateDisplay() { document.getElementById('target-date-display').innerText = currentTargetDate.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }); }
function changeDate(offset) { currentTargetDate.setDate(currentTargetDate.getDate() + offset); updateTargetDateDisplay(); checkTodayStatus(); refreshDisplay(); }
function openModal(type) { currentType = type; document.getElementById('modal-title').innerText = (type === 'morning' ? '☀️ 早晨紀錄' : '🌙 晚間紀錄'); document.getElementById('log-modal').style.display = 'flex'; }
function closeModal() { document.getElementById('log-modal').style.display = 'none'; document.querySelectorAll('#log-modal input').forEach(i => i.value = ''); }
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
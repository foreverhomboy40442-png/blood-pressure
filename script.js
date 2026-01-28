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
    setupInputListeners();
});

// PM 防撞名機制：雲端唯一性檢查
async function checkUserId() {
    if (userId) {
        document.getElementById('user-info').innerText = `👤 用戶: ${userId}`;
        return;
    }

    let isUnique = false;
    while (!isUnique) {
        let inputId = prompt("【數據雲端同步】\n請輸入代號或手機。若此代號已有人使用，系統將要求重新輸入以防數據混淆：");
        
        if (!inputId || inputId.trim() === "") {
            inputId = "User_" + Math.floor(Math.random() * 9000 + 1000);
            alert(`已為您生成隨機帳號：${inputId}`);
        }
        inputId = inputId.trim();

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({ action: "check", userId: inputId })
            });
            const result = await response.json();
            if (result.exists) {
                alert(`⚠️ 代號「${inputId}」已被占用！請換一個代號。`);
            } else {
                userId = inputId;
                localStorage.setItem('bp_records', '[]'); 
                localStorage.setItem('bp_user_id', userId);
                isUnique = true;
            }
        } catch (e) {
            userId = inputId; // 離線保底
            localStorage.setItem('bp_user_id', userId);
            isUnique = true;
        }
    }
    document.getElementById('user-info').innerText = `👤 用戶: ${userId}`;
}

function resetUser() {
    if(confirm("切換帳號會同步不同的雲端數據，確定更換嗎？")) {
        localStorage.removeItem('bp_user_id');
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
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "read", userId: userId })
        });
        const cloudRecords = await response.json();
        if (cloudRecords && cloudRecords.length > 0) {
            localStorage.setItem('bp_records', JSON.stringify(cloudRecords));
        }
    } catch (e) { console.log("同步中..."); }
    checkTodayStatus();
    refreshDisplay();
}

function updateTargetDateDisplay() {
    const dateStr = currentTargetDate.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    document.getElementById('target-date-display').innerText = dateStr;
}

function changeDate(offset) {
    currentTargetDate.setDate(currentTargetDate.getDate() + offset);
    updateTargetDateDisplay();
    checkTodayStatus(); 
    refreshDisplay();
}

async function saveData() {
    const sys = parseInt(document.getElementById('sys').value, 10);
    const dia = parseInt(document.getElementById('dia').value, 10);
    const pulse = parseInt(document.getElementById('pulse').value, 10);
    
    if (isNaN(sys) || isNaN(dia) || isNaN(pulse)) {
        alert("請輸入正確數字");
        return;
    }
    
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

    if (API_URL.startsWith("https")) {
        fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ action: "save", userId: userId, record: record })
        });
    }
    closeModal();
    refreshDisplay();
    checkTodayStatus();
}

function refreshDisplay() {
    const all = JSON.parse(localStorage.getItem('bp_records') || '[]');
    const { filtered, start, end } = filterRecordsByRange(all);
    currentFilteredData = filtered;
    document.getElementById('card-date-display').innerText = (currentRange === 'today') ? `${start}` : `${start} ~ ${end}`;
    
    document.getElementById('history-list').innerHTML = filtered.slice(0, 5).map(r => `
        <div class="history-item">
            <div style="font-size:0.8rem;color:#999">${r.date}</div>
            <div style="display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem">
                <span>${r.sys}/${r.dia} mmHg</span>
                <span>💓 ${r.pulse}</span>
            </div>
        </div>`).join('');
    
    updateChart(filtered);
    calculateSummary(filtered);
}

async function exportPDF() {
    if (/Line/i.test(navigator.userAgent)) {
        alert("⚠️ LINE 內建瀏覽器無法下載檔案。\n請點選右上角『三個點』，選擇『使用預設瀏覽器開啟』即可正常下載！");
        return;
    }
    const btn = document.querySelector('.btn-pdf-large');
    btn.innerText = "⏳ 格式化報表中...";
    const tableBody = document.getElementById('pdf-table-body');
    tableBody.innerHTML = currentFilteredData.sort((a, b) => b.timestamp - a.timestamp).map(r => `
        <tr style="border-bottom: 1px solid #000;">
            <td style="padding: 10px; border: 1px solid #000;">${r.date}</td>
            <td style="text-align: center; border: 1px solid #000;">${r.type === 'morning' ? '早晨' : '晚間'}</td>
            <td style="text-align: center; font-weight: bold; border: 1px solid #000;">${r.sys}/${r.dia}</td>
            <td style="text-align: center; border: 1px solid #000;">${r.pulse}</td>
        </tr>`).join('');
    const element = document.getElementById('pdf-template');
    const opt = { 
        margin: [10, 5], filename: `血壓報告_${userId}.pdf`, 
        html2canvas: { scale: 2, useCORS: true, windowWidth: 1000 }, 
        jsPDF: { format: 'a4', orientation: 'portrait' }
    };
    try { await html2pdf().set(opt).from(element).save(); } finally { btn.innerText = "📄 產出 PDF 報表"; }
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

function openModal(type) { currentType = type; document.getElementById('modal-title').innerText = (type === 'morning' ? '☀️ 早晨紀錄' : '🌙 晚間紀錄'); document.getElementById('log-modal').style.display = 'flex'; }
function closeModal() { document.getElementById('log-modal').style.display = 'none'; document.querySelectorAll('#log-modal input').forEach(i => i.value = ''); }
function setRange(range) { currentRange = range; document.querySelectorAll('.filter-buttons button').forEach(b => b.classList.remove('active')); document.getElementById(`btn-${range}`).classList.add('active'); document.getElementById('custom-date-panel').style.display = 'none'; refreshDisplay(); }
function toggleCustomRange() { 
    const p = document.getElementById('custom-date-panel'); const btn = document.getElementById('btn-custom');
    if (p.style.display === 'block') { p.style.display = 'none'; btn.classList.remove('active'); } 
    else { document.querySelectorAll('.filter-buttons button').forEach(b => b.classList.remove('active')); p.style.display = 'block'; btn.classList.add('active'); }
}
function applyCustomRange() { currentRange = 'custom'; refreshDisplay(); }
function setupInputListeners() {}
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
function shareToLine() { const msg = `【血壓回報】${userId}\n📊 區間：${document.getElementById('card-date-display').innerText}\n📈 ${document.getElementById('avg-text').innerText}\n感謝使用心跳守護！`; window.open(`https://line.me/R/msg/text/?${encodeURIComponent(msg)}`, '_blank'); }
function updateChart(filtered) { const ctx = document.getElementById('bpChart').getContext('2d'); if (bpChart) bpChart.destroy(); if (filtered.length === 0) return; const sorted = [...filtered].sort((a, b) => a.timestamp - b.timestamp); bpChart = new Chart(ctx, { type: 'line', data: { labels: sorted.map(r => r.date.split('年')[1] || r.date), datasets: [{ label: '收縮壓', data: sorted.map(r => r.sys), borderColor: '#A2D2FF', tension: 0.3 }, { label: '舒張壓', data: sorted.map(r => r.dia), borderColor: '#FFC2C7', tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false } }); }
function calculateSummary(filtered) {
    const avgText = document.getElementById('avg-text');
    if (filtered.length === 0) { avgText.innerText = "尚無資料"; document.getElementById('health-tip').style.display='none'; return; }
    const avgSys = Math.round(filtered.reduce((acc, r) => acc + r.sys, 0) / filtered.length);
    const avgDia = Math.round(filtered.reduce((acc, r) => acc + r.dia, 0) / filtered.length);
    avgText.innerText = `平均值：${avgSys}/${avgDia} mmHg`;
    const tipBox = document.getElementById('health-tip');
    tipBox.style.display = 'block';
    if (avgSys < 120 && avgDia < 80) { tipBox.className='health-tip tip-normal'; tipBox.querySelector('.tip-title').innerText='✅ 健康達標'; tipBox.querySelector('.tip-content').innerText='數值很漂亮，請繼續維持。'; }
    else { tipBox.className='health-tip tip-danger'; tipBox.querySelector('.tip-title').innerText='⚠️ 注意波動'; tipBox.querySelector('.tip-content').innerText='請留意飲食與作息。'; }
    document.getElementById('pdf-avg-main').innerText = avgText.innerText;
}
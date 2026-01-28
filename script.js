let bpChart = null;
let currentRange = 'week';
let currentType = '';

document.addEventListener('DOMContentLoaded', () => {
    // 顯示今日日期
    const now = new Date();
    document.getElementById('current-date-display').innerText = now.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    initApp();
    setupInputListeners();
});

function initApp() {
    checkTodayStatus();
    refreshDisplay();
}

function refreshDisplay() {
    const allRecords = JSON.parse(localStorage.getItem('bp_records') || '[]');
    const { filtered, start, end } = filterRecordsByRange(allRecords);
    document.getElementById('range-date-display').innerText = `期間：${start} ~ ${end}`;
    renderHistory(filtered);
    updateChart(filtered);
    calculateSummary(filtered);
}

// 血壓建議邏輯
function getAdvice(sys, dia) {
    if (sys < 90 || dia < 60) return { text: "⚠️ 血壓偏低：請注意是否有頭暈現象，建議諮詢專業醫護人員。", class: "tip-low" };
    if (sys < 120 && dia < 80) return { text: "✅ 血壓正常：非常理想！請繼續保持均衡飲食與運動。", class: "tip-normal" };
    if (sys < 130 && dia < 80) return { text: "⚠️ 血壓偏高：數值稍高，建議減少鈉鹽攝取並觀察波動。", class: "tip-warning" };
    return { text: "🚨 血壓過高：數值已達高血壓警戒。請多休息、減少壓力，若持續偏高請務必就醫。", class: "tip-danger" };
}

function calculateSummary(filtered) {
    const avgText = document.getElementById('avg-text');
    const tipBox = document.getElementById('health-tip');
    if (filtered.length === 0) {
        avgText.innerText = "此期間尚未有資料";
        tipBox.style.display = 'none';
        return;
    }
    const avgSys = Math.round(filtered.reduce((acc, r) => acc + parseInt(r.sys), 0) / filtered.length);
    const avgDia = Math.round(filtered.reduce((acc, r) => acc + parseInt(r.dia), 0) / filtered.length);
    avgText.innerText = `區間平均血壓：${avgSys}/${avgDia} mmHg`;
    
    const advice = getAdvice(avgSys, avgDia);
    tipBox.innerText = advice.text;
    tipBox.className = `health-tip ${advice.class}`;
    tipBox.style.display = 'block';
}

// PDF 導出修復
async function exportPDF() {
    const btn = document.querySelector('.btn-pdf');
    if (typeof html2pdf === 'undefined') return alert("套件載入中，請稍候");
    
    btn.innerText = "⏳ 處理中...";
    const element = document.getElementById('report-area');
    const opt = {
        margin: [10, 5, 10, 5],
        filename: `血壓紀錄_${new Date().toLocaleDateString()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 3 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    const noPrint = document.querySelectorAll('.no-print');
    noPrint.forEach(el => el.style.display = 'none');

    try {
        await html2pdf().set(opt).from(element).save();
    } finally {
        noPrint.forEach(el => el.style.display = '');
        btn.innerText = "📄 產出 PDF";
    }
}

// LINE 分享修復
function shareToLine() {
    const range = document.getElementById('range-date-display').innerText;
    const avg = document.getElementById('avg-text').innerText;
    const advice = document.getElementById('health-tip').innerText;
    const message = `【心跳守護血壓報表】\n${range}\n${avg}\n\n💡 建議：\n${advice}`;

    if (navigator.share) {
        navigator.share({ title: '血壓紀錄', text: message }).catch(() => {});
    } else {
        window.open(`https://line.me/R/msg/text/?${encodeURIComponent(message)}`, '_blank');
    }
}

// 圖表更新
function updateChart(filtered) {
    const ctx = document.getElementById('bpChart').getContext('2d');
    if (bpChart) bpChart.destroy();
    if (filtered.length === 0) return;
    const sorted = [...filtered].sort((a, b) => a.timestamp - b.timestamp);
    const dates = [...new Set(sorted.map(r => r.date))];
    bpChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(d => d.split('/')[1] + '/' + d.split('/')[2]),
            datasets: [
                { label: '早晨', data: dates.map(d => sorted.find(r => r.date === d && r.type === 'morning')?.sys || null), borderColor: '#A2D2FF', tension: 0.3, spanGaps: true },
                { label: '晚間', data: dates.map(d => sorted.find(r => r.date === d && r.type === 'evening')?.sys || null), borderColor: '#FFC2C7', borderDash: [5, 5], tension: 0.3, spanGaps: true }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// 其餘過濾與儲存邏輯
function filterRecordsByRange(records) {
    const now = new Date(); let start = new Date(); let end = new Date();
    if (currentRange === 'week') start.setDate(now.getDate() - 7);
    else if (currentRange === 'month') start.setMonth(now.getMonth() - 1);
    else if (currentRange === 'custom') {
        const s = document.getElementById('start-date').value;
        const e = document.getElementById('end-date').value;
        if (s && e) { start = new Date(s); end = new Date(e); }
    }
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    const filtered = records.filter(r => r.timestamp >= start.getTime() && r.timestamp <= end.getTime());
    return { filtered, start: start.toLocaleDateString('zh-TW'), end: end.toLocaleDateString('zh-TW') };
}

function setRange(range) {
    currentRange = range;
    document.querySelectorAll('.filter-buttons button').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${range}`).classList.add('active');
    document.getElementById('custom-date-picker').style.display = 'none';
    refreshDisplay();
}

function toggleCustomRange() {
    const p = document.getElementById('custom-date-picker');
    p.style.display = (p.style.display === 'flex') ? 'none' : 'flex';
}

function applyCustomRange() {
    currentRange = 'custom';
    document.querySelectorAll('.filter-buttons button').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-custom').classList.add('active');
    refreshDisplay();
}

function setupInputListeners() {
    const inputs = document.querySelectorAll('#log-modal input');
    const btn = document.getElementById('btn-save');
    inputs.forEach(i => i.addEventListener('input', () => {
        btn.classList.toggle('can-save', Array.from(inputs).every(inp => inp.value.trim() !== ''));
    }));
}

function openModal(type) {
    currentType = type;
    document.getElementById('modal-title').innerText = (type === 'morning' ? '☀️ 早晨紀錄' : '🌙 晚間紀錄');
    document.getElementById('log-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('log-modal').style.display = 'none';
    document.querySelectorAll('#log-modal input').forEach(i => i.value = '');
}

function saveData() {
    const sys = document.getElementById('sys').value;
    const dia = document.getElementById('dia').value;
    const pulse = document.getElementById('pulse').value;
    if (!sys || !dia || !pulse) return;
    const records = JSON.parse(localStorage.getItem('bp_records') || '[]');
    records.unshift({ id: Date.now(), timestamp: Date.now(), type: currentType, date: new Date().toLocaleDateString('zh-TW'), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), sys, dia, pulse });
    localStorage.setItem('bp_records', JSON.stringify(records));
    closeModal(); initApp();
}

function checkTodayStatus() {
    const today = new Date().toLocaleDateString('zh-TW');
    const records = JSON.parse(localStorage.getItem('bp_records') || '[]');
    document.getElementById('morning-card').classList.toggle('completed', records.some(r => r.date === today && r.type === 'morning'));
    document.getElementById('evening-card').classList.toggle('completed', records.some(r => r.date === today && r.type === 'evening'));
}

function renderHistory(data) {
    document.getElementById('history-list').innerHTML = data.map(r => `<div class="history-item ${r.type === 'evening' ? 'evening-type' : ''}"><div style="font-size:0.8rem;color:#999">${r.date} ${r.time}</div><div style="display:flex;justify-content:space-between;font-weight:bold;font-size:1.1rem"><span>${r.type === 'morning' ? '☀️' : '🌙'} ${r.sys}/${r.dia}</span><span>💓 ${r.pulse}</span></div></div>`).join('');
}
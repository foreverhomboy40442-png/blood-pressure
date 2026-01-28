let bpChart = null;
let currentRange = 'week';
let currentType = '';

document.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    document.getElementById('current-date-display').innerText = now.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    initApp();
    setupInputListeners();
});

function initApp() {
    checkTodayStatus();
    refreshDisplay();
}

function getAdvice(sys, dia) {
    if (sys < 90 || dia < 60) return { title: "🚨 血壓目前偏低", content: "請注意是否有頭暈、虛弱現象，建議補充水分，並視情況諮詢醫師。", class: "tip-danger" };
    if (sys < 120 && dia < 80) return { title: "✅ 血壓非常正常", content: "目前數值很理想，代表您的身體狀況維持得很好，請繼續保持！", class: "tip-normal" };
    if (sys < 130 && dia < 80) return { title: "⚠️ 血壓稍微偏高", content: "數值雖然在邊緣，建議開始注意重鹹飲食並規律運動。", class: "tip-warning" };
    if (sys < 140 || dia < 90) return { title: "🚨 血壓已經偏高", content: "平均數值顯示血壓已達偏高程度。請多休息、減少壓力，建議諮詢醫師了解原因。", class: "tip-danger" };
    return { title: "🚨 血壓過於危險", content: "數值顯著過高！請務必諮詢專業醫護人員，並避免情緒激動與過度勞累。", class: "tip-danger" };
}

function refreshDisplay() {
    const all = JSON.parse(localStorage.getItem('bp_records') || '[]');
    const { filtered, start, end } = filterRecordsByRange(all);
    const infoBar = document.getElementById('range-info-bar');
    infoBar.innerText = (currentRange === 'today') ? `日期：${start}` : `區間：${start} ~ ${end}`;
    renderHistory(filtered);
    updateChart(filtered);
    calculateSummary(filtered);
}

function calculateSummary(filtered) {
    const avgText = document.getElementById('avg-text');
    const tipBox = document.getElementById('health-tip');
    const tipTitle = tipBox.querySelector('.tip-title');
    const tipContent = tipBox.querySelector('.tip-content');
    if (filtered.length === 0) { avgText.innerText = "目前尚無資料"; tipBox.style.display = 'none'; return; }
    const avgSys = Math.round(filtered.reduce((acc, r) => acc + parseInt(r.sys), 0) / filtered.length);
    const avgDia = Math.round(filtered.reduce((acc, r) => acc + parseInt(r.dia), 0) / filtered.length);
    avgText.innerText = `平均值：${avgSys}/${avgDia} mmHg`;
    const advice = getAdvice(avgSys, avgDia);
    tipTitle.innerText = advice.title; tipContent.innerText = advice.content;
    tipBox.className = `health-tip ${advice.class}`; tipBox.style.display = 'block';
}

function filterRecordsByRange(records) {
    const now = new Date(); let s = new Date(); let e = new Date();
    if (currentRange === 'today') { s.setHours(0,0,0,0); e.setHours(23,59,59,999); }
    else if (currentRange === 'week') s.setDate(now.getDate() - 7);
    else if (currentRange === 'month') s.setMonth(now.getMonth() - 1);
    else if (currentRange === 'custom') {
        const sv = document.getElementById('start-date').value;
        const ev = document.getElementById('end-date').value;
        if (sv && ev) { s = new Date(sv); e = new Date(ev); }
    }
    s.setHours(0,0,0,0); e.setHours(23,59,59,999);
    const filtered = records.filter(r => r.timestamp >= s.getTime() && r.timestamp <= e.getTime());
    return { filtered, start: s.toLocaleDateString('zh-TW'), end: e.toLocaleDateString('zh-TW') };
}

function checkTodayStatus() {
    const today = new Date().toLocaleDateString('zh-TW');
    const records = JSON.parse(localStorage.getItem('bp_records') || '[]');
    const mDone = records.some(r => r.date === today && r.type === 'morning');
    const eDone = records.some(r => r.date === today && r.type === 'evening');
    const mCard = document.getElementById('morning-card');
    const eCard = document.getElementById('evening-card');
    const mStatus = document.getElementById('morning-status');
    const eStatus = document.getElementById('evening-status');
    if (mDone) { mCard.classList.add('completed', 'morning-done'); mStatus.innerText = '今日已完成'; } 
    else { mCard.classList.remove('completed', 'morning-done'); mStatus.innerText = '今日尚未填寫'; }
    if (eDone) { eCard.classList.add('completed', 'evening-done'); eStatus.innerText = '今日已完成'; } 
    else { eCard.classList.remove('completed', 'evening-done'); eStatus.innerText = '今日尚未填寫'; }
}

function shareToLine() {
    const avg = document.getElementById('avg-text').innerText;
    const advice = document.querySelector('.tip-title').innerText + ": " + document.querySelector('.tip-content').innerText;
    const msg = `【心跳守護：血壓分析】\n${avg}\n\n💡 建議：${advice}`;
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(msg)}`, '_blank');
}

function updateChart(filtered) {
    const ctx = document.getElementById('bpChart').getContext('2d');
    if (bpChart) bpChart.destroy();
    if (filtered.length === 0) return;
    const sorted = [...filtered].sort((a, b) => a.timestamp - b.timestamp);
    bpChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sorted.map(r => (currentRange === 'today') ? r.time : r.date.slice(5)),
            datasets: [{ label: '收縮壓', data: sorted.map(r => r.sys), borderColor: '#A2D2FF', backgroundColor: '#A2D2FF', tension: 0.3 }, { label: '舒張壓', data: sorted.map(r => r.dia), borderColor: '#FFC2C7', backgroundColor: '#FFC2C7', tension: 0.3 }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { suggestedMin: 60 } } }
    });
}

function setRange(range) {
    currentRange = range;
    document.querySelectorAll('.filter-buttons button').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${range}`).classList.add('active');
    document.getElementById('custom-date-panel').style.display = 'none';
    refreshDisplay();
}

function toggleCustomRange() {
    const p = document.getElementById('custom-date-panel');
    p.style.display = (p.style.display === 'block') ? 'none' : 'block';
}

function applyCustomRange() { currentRange = 'custom'; refreshDisplay(); }

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

function renderHistory(data) {
    document.getElementById('history-list').innerHTML = data.slice(0, 15).map(r => `<div class="history-item"><div style="font-size:0.85rem;color:#999">${r.date} ${r.time}</div><div style="display:flex;justify-content:space-between;font-weight:bold;font-size:1.1rem"><span>${r.type === 'morning' ? '☀️' : '🌙'} ${r.sys}/${r.dia}</span><span>💓 ${r.pulse}</span></div></div>`).join('');
}
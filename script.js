let bpChart = null;
let currentRange = 'week';
let currentType = '';

document.addEventListener('DOMContentLoaded', () => {
    // 1. 顯示今日日期
    const now = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    document.getElementById('current-date-display').innerText = now.toLocaleDateString('zh-TW', options);
    
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
    
    // 更新區間文字顯示
    document.getElementById('range-date-display').innerText = `${start} 至 ${end}`;
    
    renderHistory(filtered);
    updateChart(filtered);
    calculateSummary(filtered);
}

function filterRecordsByRange(records) {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    if (currentRange === 'week') {
        start.setDate(now.getDate() - 7);
    } else if (currentRange === 'month') {
        start.setMonth(now.getMonth() - 1);
    } else if (currentRange === 'custom') {
        const startVal = document.getElementById('start-date').value;
        const endVal = document.getElementById('end-date').value;
        if (startVal && endVal) {
            start = new Date(startVal);
            end = new Date(endVal);
        } else {
            start.setDate(now.getDate() - 7);
        }
    }

    // 設定搜尋邊界
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);

    const filtered = records.filter(r => {
        const rDate = new Date(r.timestamp);
        return rDate >= start && rDate <= end;
    });

    return { 
        filtered, 
        start: start.toLocaleDateString('zh-TW'), 
        end: end.toLocaleDateString('zh-TW') 
    };
}

// PDF 產出功能
function exportPDF() {
    const element = document.getElementById('report-area');
    const opt = {
        margin: [10, 10],
        filename: `血壓健康報表_${new Date().toLocaleDateString()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // 暫時隱藏不需列印的按鈕
    const noPrintElements = document.querySelectorAll('.no-print');
    noPrintElements.forEach(el => el.style.display = 'none');

    html2pdf().set(opt).from(element).save().then(() => {
        // 恢復顯示
        noPrintElements.forEach(el => el.style.display = '');
    });
}

// 其餘功能維持 (setRange, updateChart, saveData, setupInputListeners 等)...
// 注意：將之前的 updateChart, calculateSummary, renderHistory 套入新的 filtered 數據。

function setRange(range) {
    currentRange = range;
    document.querySelectorAll('.filter-buttons button').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${range}`).classList.add('active');
    document.getElementById('custom-date-picker').style.display = 'none';
    document.getElementById('range-title').innerText = `📊 ${range === 'week' ? '本週' : '本月'}數據摘要`;
    refreshDisplay();
}

function toggleCustomRange() {
    const picker = document.getElementById('custom-date-picker');
    picker.style.display = (picker.style.display === 'flex') ? 'none' : 'flex';
}

function applyCustomRange() {
    currentRange = 'custom';
    document.querySelectorAll('.filter-buttons button').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-custom').classList.add('active');
    document.getElementById('range-title').innerText = `📊 自訂區間摘要`;
    refreshDisplay();
}

function updateChart(filtered) {
    const ctx = document.getElementById('bpChart').getContext('2d');
    if (bpChart) bpChart.destroy();
    if (filtered.length === 0) return;
    const sorted = [...filtered].sort((a, b) => a.timestamp - b.timestamp);
    const dates = [...new Set(sorted.map(r => r.date))];
    bpChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(d => d.slice(5)),
            datasets: [
                { label: '早晨', data: dates.map(d => sorted.find(r => r.date === d && r.type === 'morning')?.sys || null), borderColor: '#A2D2FF', tension: 0.3, spanGaps: true },
                { label: '晚間', data: dates.map(d => sorted.find(r => r.date === d && r.type === 'evening')?.sys || null), borderColor: '#FFC2C7', borderDash: [5, 5], tension: 0.3, spanGaps: true }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function calculateSummary(filtered) {
    const avgText = document.getElementById('avg-text');
    if (filtered.length === 0) { avgText.innerText = "此區間無數據"; return; }
    const avgSys = Math.round(filtered.reduce((acc, r) => acc + parseInt(r.sys), 0) / filtered.length);
    const avgDia = Math.round(filtered.reduce((acc, r) => acc + parseInt(r.dia), 0) / filtered.length);
    avgText.innerText = `區間平均血壓：${avgSys}/${avgDia} mmHg`;
}

function renderHistory(data) {
    document.getElementById('history-list').innerHTML = data.map(r => `
        <div class="history-item ${r.type === 'evening' ? 'evening-type' : ''}">
            <div style="font-size:0.8rem; color:#999">${r.date} ${r.time}</div>
            <div style="display:flex; justify-content:space-between; font-weight:bold;">
                <span>${r.type === 'morning' ? '☀️' : '🌙'} ${r.sys}/${r.dia}</span>
                <span>💓 ${r.pulse}</span>
            </div>
        </div>
    `).join('');
}

function setupInputListeners() {
    const inputs = document.querySelectorAll('#log-modal input');
    const saveBtn = document.getElementById('btn-save');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            const allFilled = Array.from(inputs).every(i => i.value.trim() !== '');
            saveBtn.classList.toggle('can-save', allFilled);
        });
    });
}

function openModal(type) {
    currentType = type;
    document.getElementById('modal-title').innerText = type === 'morning' ? '☀️ 早晨紀錄' : '🌙 晚間紀錄';
    document.getElementById('log-modal').style.display = 'flex';
    document.getElementById('btn-save').classList.remove('can-save');
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
    const now = new Date();
    const record = {
        id: Date.now(),
        timestamp: now.getTime(),
        type: currentType,
        date: now.toLocaleDateString('zh-TW'),
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sys, dia, pulse
    };
    const records = JSON.parse(localStorage.getItem('bp_records') || '[]');
    records.unshift(record);
    localStorage.setItem('bp_records', JSON.stringify(records));
    closeModal();
    initApp();
}

function checkTodayStatus() {
    const today = new Date().toLocaleDateString('zh-TW');
    const records = JSON.parse(localStorage.getItem('bp_records') || '[]');
    document.getElementById('morning-card').classList.toggle('completed', records.some(r => r.date === today && r.type === 'morning'));
    document.getElementById('evening-card').classList.toggle('completed', records.some(r => r.date === today && r.type === 'evening'));
}
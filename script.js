let bpChart = null;
let currentRange = 'week';
let currentType = '';
let currentTargetDate = new Date(); 
let currentFilteredData = [];

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupInputListeners();
});

function initApp() {
    updateTargetDateDisplay();
    checkTodayStatus();
    refreshDisplay();
}

function changeDate(offset) {
    currentTargetDate.setDate(currentTargetDate.getDate() + offset);
    updateTargetDateDisplay();
    checkTodayStatus(); 
    refreshDisplay();
}

function updateTargetDateDisplay() {
    const dateStr = currentTargetDate.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    document.getElementById('target-date-display').innerText = dateStr;
}

// 嚴格去重儲存
function saveData() {
    const sys = parseInt(document.getElementById('sys').value, 10);
    const dia = parseInt(document.getElementById('dia').value, 10);
    const pulse = parseInt(document.getElementById('pulse').value, 10);
    
    if (isNaN(sys) || isNaN(dia) || isNaN(pulse)) {
        alert("請輸入正確數字");
        return;
    }
    
    const dateKey = currentTargetDate.toLocaleDateString('zh-TW');
    let records = JSON.parse(localStorage.getItem('bp_records') || '[]');
    records = records.filter(r => !(r.date === dateKey && r.type === currentType));

    const newRecord = {
        id: Date.now(),
        timestamp: currentTargetDate.getTime(),
        type: currentType,
        date: dateKey,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sys, dia, pulse
    };

    records.unshift(newRecord);
    records.sort((a, b) => b.timestamp - a.timestamp);
    
    localStorage.setItem('bp_records', JSON.stringify(records));
    closeModal();
    initApp();
}

function calculateSummary(filtered) {
    const avgText = document.getElementById('avg-text');
    const subAvgText = document.getElementById('sub-avg-text');
    const tipBox = document.getElementById('health-tip');
    const validData = filtered.filter(r => !isNaN(parseInt(r.sys, 10)));
    
    if (validData.length === 0) {
        avgText.innerText = "尚無資料";
        subAvgText.innerText = "";
        tipBox.style.display = 'none';
        return;
    }

    const count = validData.length;
    const avgSys = Math.round(validData.reduce((acc, r) => acc + parseInt(r.sys, 10), 0) / count);
    const avgDia = Math.round(validData.reduce((acc, r) => acc + parseInt(r.dia, 10), 0) / count);
    const avgPulse = Math.round(validData.reduce((acc, r) => acc + parseInt(r.pulse, 10), 0) / count);

    const label = (currentRange === 'today') ? "今日平均" : (currentRange === 'week' ? "近一週平均" : (currentRange === 'month' ? "近一個月平均" : "累計平均"));
    avgText.innerText = `${label}：${avgSys}/${avgDia} mmHg`;
    subAvgText.innerHTML = `統計筆數：${count} 筆 | 平均心率：${avgPulse} bpm`;

    document.getElementById('pdf-avg-main').innerText = avgText.innerText;
    document.getElementById('pdf-avg-sub').innerHTML = subAvgText.innerHTML;

    const advice = getAdvice(avgSys, avgDia);
    tipBox.querySelector('.tip-title').innerText = advice.title;
    tipBox.querySelector('.tip-content').innerText = advice.content;
    tipBox.className = `health-tip ${advice.class}`;
    tipBox.style.display = 'block';
}

function refreshDisplay() {
    const all = JSON.parse(localStorage.getItem('bp_records') || '[]');
    const { filtered, start, end } = filterRecordsByRange(all);
    currentFilteredData = filtered;
    const rangeText = (currentRange === 'today') ? `${start}` : `${start} ~ ${end}`;
    document.getElementById('card-date-display').innerText = rangeText;
    
    document.getElementById('history-list').innerHTML = filtered.slice(0, 5).map(r => `
        <div class="history-item">
            <div style="font-size:0.85rem;color:#999">${r.date}</div>
            <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:1.1rem">
                <span>${r.sys}/${r.dia} mmHg</span>
                <span>💓 ${r.pulse}</span>
            </div>
        </div>`).join('');
    
    updateChart(filtered);
    calculateSummary(filtered);
}

// 核心優化：響應式渲染，確保電腦與手機下載 PDF 比例皆為最佳
async function exportPDF() {
    const btn = document.querySelector('.btn-pdf-large');
    if (typeof html2pdf === 'undefined') { alert("載入中..."); return; }
    if (currentFilteredData.length === 0) { alert("無資料。"); return; }
    
    btn.innerText = "⏳ 格式化報表中...";
    document.getElementById('pdf-range').innerText = `報告區間：${document.getElementById('card-date-display').innerText}`;
    const tableBody = document.getElementById('pdf-table-body');
    
    tableBody.innerHTML = currentFilteredData.sort((a, b) => b.timestamp - a.timestamp).map(r => `
        <tr style="page-break-inside: avoid; border-bottom: 1px solid #000;">
            <td style="border: 1px solid #000; padding: 10px;">${r.date}</td>
            <td style="border: 1px solid #000; padding: 10px; text-align: center;">${r.type === 'morning' ? '早晨' : '晚間'}</td>
            <td style="border: 1px solid #000; padding: 10px; text-align: center; font-weight: bold; font-size:20px;">${r.sys} / ${r.dia}</td>
            <td style="border: 1px solid #000; padding: 10px; text-align: center;">${r.pulse}</td>
        </tr>`).join('');

    const element = document.getElementById('pdf-template');
    
    // 最佳比例設定：windowWidth 與 scale 是電腦版不跑版的關鍵
    const opt = { 
        margin: [10, 5, 10, 5], 
        filename: `血壓評估報告_${new Date().toLocaleDateString()}.pdf`, 
        image: { type: 'jpeg', quality: 0.98 }, 
        html2canvas: { 
            scale: 3, 
            useCORS: true, 
            scrollY: 0, 
            windowWidth: 800 // 鎖定渲染寬度，解決電腦版斷一半問題
        }, 
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
    };

    try { await html2pdf().set(opt).from(element).save(); } catch (e) { alert("產出失敗。"); } finally { btn.innerText = "📄 產出 PDF 報表"; }
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
function closeModal() { document.getElementById('log-modal').style.display = 'none'; document.querySelectorAll('#log-modal input').forEach(i => i.value = ''); document.getElementById('btn-save').classList.remove('can-save'); }
function setupInputListeners() { const inputs = document.querySelectorAll('#log-modal input'); const btn = document.getElementById('btn-save'); inputs.forEach(i => i.addEventListener('input', () => { btn.classList.toggle('can-save', Array.from(inputs).every(inp => inp.value.trim() !== '')); })); }
function setRange(range) { currentRange = range; document.querySelectorAll('.filter-buttons button').forEach(b => b.classList.remove('active')); document.getElementById(`btn-${range}`).classList.add('active'); document.getElementById('custom-date-panel').style.display = 'none'; refreshDisplay(); }
function toggleCustomRange() { const p = document.getElementById('custom-date-panel'); p.style.display = (p.style.display === 'block') ? 'none' : 'block'; }
function applyCustomRange() { currentRange = 'custom'; refreshDisplay(); }
function checkTodayStatus() {
    const targetKey = currentTargetDate.toLocaleDateString('zh-TW');
    const records = JSON.parse(localStorage.getItem('bp_records') || '[]');
    const mRec = records.find(r => r.date === targetKey && r.type === 'morning');
    const eRec = records.find(r => r.date === targetKey && r.type === 'evening');
    const mCard = document.getElementById('morning-card'); const eCard = document.getElementById('evening-card');
    if (mRec) { mCard.classList.add('completed', 'morning-done'); document.getElementById('morning-status').innerText = `已填: ${mRec.sys}/${mRec.dia}`; } else { mCard.classList.remove('completed', 'morning-done'); document.getElementById('morning-status').innerText = '尚未填寫'; }
    if (eRec) { eCard.classList.add('completed', 'evening-done'); document.getElementById('evening-status').innerText = `已填: ${eRec.sys}/${eRec.dia}`; } else { eCard.classList.remove('completed', 'evening-done'); document.getElementById('evening-status').innerText = '尚未填寫'; }
}
function shareToLine() { 
    const tipTitle = document.querySelector('.tip-title').innerText;
    const tipContent = document.querySelector('.tip-content').innerText;
    const msg = `【心跳守護】血壓回報\n📊 查詢日期：${document.getElementById('card-date-display').innerText}\n📈 ${document.getElementById('avg-text').innerText}\n💡 建議：${tipTitle} - ${tipContent}\n\n隨時追蹤，守護健康！`; 
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(msg)}`, '_blank'); 
}
function updateChart(filtered) { 
    const ctx = document.getElementById('bpChart').getContext('2d'); if (bpChart) bpChart.destroy(); if (filtered.length === 0) return; 
    const sorted = [...filtered].sort((a, b) => a.timestamp - b.timestamp); 
    bpChart = new Chart(ctx, { 
        type: 'line', 
        data: { 
            labels: sorted.map(r => r.date.slice(5)), 
            datasets: [
                { label: '收縮壓', data: sorted.map(r => r.sys), borderColor: '#A2D2FF', tension: 0.3 }, 
                { label: '舒張壓', data: sorted.map(r => r.dia), borderColor: '#FFC2C7', tension: 0.3 }
            ] 
        }, 
        options: { responsive: true, maintainAspectRatio: false } 
    }); 
}
function getAdvice(sys, dia) { 
    if (sys < 90 || dia < 60) return { title: "📉 數值偏低", content: "請注意是否頭暈，建議補充水分或諮詢醫師。", class: "tip-danger" };
    if (sys < 120 && dia < 80) return { title: "✅ 健康達標", content: "數值很漂亮！請繼續維持規律作息與運動。", class: "tip-normal" };
    if (sys < 130 && dia < 80) return { title: "⚠️ 稍有波動", content: "請留意飲食清淡，減少鹽分攝取並多休息。", class: "tip-warning" };
    if (sys < 140 || dia < 90) return { title: "🚨 警戒提醒", content: "建議放鬆心情重複測量，若持續請諮詢醫師。", class: "tip-danger" };
    return { title: "🆘 顯著偏高", content: "數值顯著偏高，請務必諮詢醫師並遵照醫囑。", class: "tip-danger" };
}
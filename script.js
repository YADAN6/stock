let chart = null;
let currentStockCode = '';
let currentPeriod = 'day';
let stockList = [];

function initChart() {
    chart = echarts.init(document.getElementById('chartContainer'));
    chart.setOption({
        backgroundColor: 'transparent',
        title: {
            text: '请输入股票名称查询K线图',
            left: 'center',
            top: 20,
            textStyle: {
                color: '#fff',
                fontSize: 18
            }
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'cross'
            },
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            textStyle: {
                color: '#fff'
            }
        },
        grid: {
            left: '10%',
            right: '10%',
            bottom: '15%',
            top: '15%'
        },
        xAxis: {
            type: 'category',
            data: [],
            axisLine: { lineStyle: { color: '#4a90d9' } },
            axisLabel: { color: '#fff', rotate: 45 },
            splitLine: { show: false }
        },
        yAxis: {
            type: 'value',
            scale: true,
            axisLine: { lineStyle: { color: '#4a90d9' } },
            axisLabel: { color: '#fff' },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
        },
        dataZoom: [
            {
                type: 'inside',
                start: 0,
                end: 100
            },
            {
                type: 'slider',
                show: true,
                start: 0,
                end: 100,
                bottom: 10,
                height: 20,
                borderColor: '#4a90d9',
                fillerColor: 'rgba(74, 144, 217, 0.3)',
                handleStyle: {
                    color: '#4a90d9'
                },
                textStyle: {
                    color: '#fff'
                }
            }
        ],
        series: []
    });
}

function loadStockList() {
    fetch('a_stock_list.json')
        .then(response => response.json())
        .then(data => {
            stockList = data;
            console.log('股票列表加载完成，共', stockList.length, '只股票');
        })
        .catch(error => {
            console.error('加载股票列表失败:', error);
        });
}

function searchStock() {
    const input = document.getElementById('stockInput').value.trim();
    if (!input) {
        alert('请输入股票名称或代码');
        return;
    }
    
    let code = input;
    let stockName = '';
    
    if (/^\d{6}$/.test(input)) {
        const stock = stockList.find(s => s.code === input);
        if (stock) {
            code = getFullCode(input);
            stockName = stock.name;
        } else {
            alert('未找到该股票代码');
            return;
        }
    } else if (!/^(sh|sz)\d{6}$/i.test(input)) {
        const stock = stockList.find(s => s.name === input || s.name.includes(input));
        if (stock) {
            code = getFullCode(stock.code);
            stockName = stock.name;
        } else {
            alert('未找到该股票，请尝试输入股票代码或完整名称');
            return;
        }
    }
    
    currentStockCode = code.toLowerCase();
    loadKlineData(currentStockCode, currentPeriod, stockName);
}

function getFullCode(code) {
    const prefix = code.startsWith('6') || code.startsWith('9') ? 'sh' : 'sz';
    return prefix + code;
}

function loadKlineData(code, period, stockName) {
    const periodMap = {
        'day': 240,
        'week': 10080,
        'month': 43200,
        'hour': 60
    };
    
    const scale = periodMap[period];
    const apiUrl = `http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${code}&scale=${scale}&ma=5,10,20&datalen=200`;
    
    // 尝试多个CORS代理
    const proxyUrls = [
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(apiUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`
    ];
    
    chart.showLoading({
        text: '加载中...',
        textStyle: { color: '#fff' },
        maskColor: 'rgba(0, 0, 0, 0.3)'
    });
    
    // 依次尝试不同的代理
    fetchWithFallback(proxyUrls, 0)
        .then(data => {
            chart.hideLoading();
            handleSinaData(data, stockName);
        })
        .catch(error => {
            chart.hideLoading();
            console.error('获取数据失败:', error);
            alert('获取数据失败，请稍后重试');
        });
}

function fetchWithFallback(proxyUrls, index) {
    return new Promise((resolve, reject) => {
        if (index >= proxyUrls.length) {
            reject(new Error('所有代理都失败了'));
            return;
        }
        
        fetch(proxyUrls[index])
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data && data.length > 0) {
                    resolve(data);
                } else {
                    // 如果数据为空，尝试下一个代理
                    console.log(`代理 ${index + 1} 返回空数据，尝试下一个代理`);
                    return fetchWithFallback(proxyUrls, index + 1).then(resolve).catch(reject);
                }
            })
            .catch(error => {
                console.log(`代理 ${index + 1} 失败:`, error.message, '尝试下一个代理');
                return fetchWithFallback(proxyUrls, index + 1).then(resolve).catch(reject);
            });
    });
}

function handleSinaData(data, stockName) {
    if (!data || data.length === 0) {
        alert('获取数据失败');
        return;
    }
    
    const dates = [];
    const values = [];
    const closes = [];
    let latestPrice = 0;
    let changePercent = 0;
    
    data.forEach(item => {
        dates.push(item.day);
        values.push([parseFloat(item.open), parseFloat(item.close), parseFloat(item.low), parseFloat(item.high)]);
        closes.push(parseFloat(item.close));
        if (item === data[data.length - 1]) {
            latestPrice = parseFloat(item.close);
            if (item.preClose) {
                changePercent = ((parseFloat(item.close) - parseFloat(item.preClose)) / parseFloat(item.preClose) * 100).toFixed(2);
            }
        }
    });
    
    // 计算移动平均线
    const ma5 = calculateMA(closes, 5);
    const ma20 = calculateMA(closes, 20);
    const ma60 = calculateMA(closes, 60);
    
    updateStockInfo(stockName || '-', currentStockCode, latestPrice, changePercent);
    renderChart(dates, values, ma5, ma20, ma60);
}

function calculateMA(data, dayCount) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
        if (i < dayCount - 1) {
            result.push('-');
            continue;
        }
        let sum = 0;
        for (let j = 0; j < dayCount; j++) {
            sum += data[i - j];
        }
        result.push((sum / dayCount).toFixed(2));
    }
    return result;
}

function updateStockInfo(name, code, price, change) {
    document.getElementById('stockName').textContent = name || '-';
    document.getElementById('stockCode').textContent = code || '-';
    document.getElementById('latestPrice').textContent = price ? price.toFixed(2) : '-';
    
    const changeEl = document.getElementById('changePercent');
    changeEl.textContent = change ? `${change > 0 ? '+' : ''}${change}%` : '-';
    changeEl.className = change > 0 ? 'up' : change < 0 ? 'down' : '';
}

function renderChart(dates, values, ma5, ma20, ma60) {
    chart.setOption({
        title: {
            text: `${document.getElementById('stockName').textContent} K线图`,
            left: 'center',
            top: 20,
            textStyle: {
                color: '#fff',
                fontSize: 18
            }
        },
        legend: {
            data: ['K线', 'MA5', 'MA20', 'MA60'],
            top: 50,
            textStyle: {
                color: '#fff'
            }
        },
        xAxis: {
            type: 'category',
            data: dates,
            axisLine: { lineStyle: { color: '#4a90d9' } },
            axisLabel: { color: '#fff', rotate: 45 },
            splitLine: { show: false }
        },
        yAxis: {
            type: 'value',
            scale: true,
            axisLine: { lineStyle: { color: '#4a90d9' } },
            axisLabel: { color: '#fff' },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
        },
        series: [
            {
                name: 'K线',
                type: 'candlestick',
                data: values,
                itemStyle: {
                    color: '#ff4757',
                    color0: '#2ed573',
                    borderColor: '#ff4757',
                    borderColor0: '#2ed573'
                }
            },
            {
                name: 'MA5',
                type: 'line',
                data: ma5,
                smooth: true,
                lineStyle: {
                    color: '#ffd700',
                    width: 1
                }
            },
            {
                name: 'MA20',
                type: 'line',
                data: ma20,
                smooth: true,
                lineStyle: {
                    color: '#ff6b6b',
                    width: 1
                }
            },
            {
                name: 'MA60',
                type: 'line',
                data: ma60,
                smooth: true,
                lineStyle: {
                    color: '#4ecdc4',
                    width: 1
                }
            }
        ]
    });
}

function switchPeriod(period) {
    currentPeriod = period;
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    
    if (currentStockCode) {
        const stockName = document.getElementById('stockName').textContent;
        loadKlineData(currentStockCode, period, stockName);
    }
}

document.getElementById('searchBtn').addEventListener('click', searchStock);
document.getElementById('stockInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchStock();
    }
});

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        switchPeriod(tab.dataset.period);
    });
});

window.addEventListener('resize', () => {
    if (chart) {
        chart.resize();
    }
});

loadStockList();
initChart();

function searchStockByCode(code) {
    currentStockCode = code;
    document.getElementById('stockInput').value = code;
    const stock = stockList.find(s => getFullCode(s.code) === code);
    loadKlineData(code, currentPeriod, stock ? stock.name : '');
}
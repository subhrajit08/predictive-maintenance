import { useState, useRef, useEffect, useMemo } from "react"
import axios from "axios"
import { API_BASE_URL } from "../config"
import {
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts"

const ALL_SENSORS = Array.from({ length: 21 }, (_, i) => `sensor_${i + 1}`)
const OPS = ["op_1", "op_2", "op_3"]
const SIGNAL_SENSORS = [2, 3, 4, 7, 9, 11, 12, 14, 17, 20, 21]

const ALL_COLUMNS = ["unit", "cycle", ...OPS, ...ALL_SENSORS]

const DEFAULT_VALS = {
    unit: 1, cycle: 1,
    op_1: -0.0007, op_2: -0.0004, op_3: 100.0,
    sensor_1: 518.67, sensor_2: 641.82, sensor_3: 1589.70,
    sensor_4: 1400.60, sensor_5: 14.62, sensor_6: 21.61,
    sensor_7: 554.36, sensor_8: 2388.06, sensor_9: 9046.19,
    sensor_10: 1.30, sensor_11: 47.47, sensor_12: 521.66,
    sensor_13: 2388.02, sensor_14: 8138.62, sensor_15: 8.4195,
    sensor_16: 0.03, sensor_17: 392, sensor_18: 2388,
    sensor_19: 100.0, sensor_20: 39.06, sensor_21: 23.419,
}

const STATE_CONFIG = {
    Normal: { color: "#10B981", bg: "rgba(16,185,129,0.1)", border: "#10B981", msg: "Engine is operating normally. No maintenance required." },
    Warning: { color: "#F59E0B", bg: "rgba(245,158,11,0.1)", border: "#F59E0B", msg: "Engine showing early degradation. Schedule inspection soon." },
    Critical: { color: "#EF4444", bg: "rgba(239,68,68,0.1)", border: "#EF4444", msg: "Engine in critical state. Immediate maintenance required." },
}

function PulseRing({ color }) {
    return (
        <div style={{ position: "relative", width: "80px", height: "80px", margin: "0 auto 1.5rem" }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${color}`, opacity: 0.3, animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite" }} />
            <div style={{ position: "absolute", inset: "10px", borderRadius: "50%", background: `${color}22`, border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: color }} />
            </div>
            <style>{`@keyframes ping { 0% { transform: scale(1); opacity: 0.3; } 100% { transform: scale(1.8); opacity: 0; } }`}</style>
        </div>
    )
}

function computeModelFeatures(rows, idx) {
    const row = rows[idx]
    const unitRows = rows.filter(r => r.unit === row.unit && r.cycle <= row.cycle).slice(-5)
    const features = { op_1: row.op_1, op_2: row.op_2, op_3: row.op_3 }
    SIGNAL_SENSORS.forEach(s => {
        const key = `sensor_${s}`
        const vals = unitRows.map(r => r[key])
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length
        const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
        features[key] = row[key]
        features[`${key}_rmean`] = parseFloat(mean.toFixed(5))
        features[`${key}_rstd`] = parseFloat(std.toFixed(5))
    })
    return features
}

function computeManualFeatures(inputs, multiplier = 1.0) {
    const features = { op_1: inputs.op_1, op_2: inputs.op_2, op_3: inputs.op_3 }
    SIGNAL_SENSORS.forEach(s => {
        const key = `sensor_${s}`
        const rawVal = inputs[key]
        const scaledVal = parseFloat((rawVal * multiplier).toFixed(5))
        features[key] = scaledVal
        features[`${key}_rmean`] = scaledVal
        features[`${key}_rstd`] = 0.0
    })
    return features
}

export default function Predict() {
    const [mode, setMode] = useState("upload")
    const [allRows, setAllRows] = useState([])
    const [fileName, setFileName] = useState(null)
    const [rowIndex, setRowIndex] = useState(0)
    const [manualVals, setManualVals] = useState(DEFAULT_VALS)
    const [result, setResult] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [parseError, setParseError] = useState(null)
    const fileRef = useRef()
    const [isPlaying, setIsPlaying] = useState(false)
    const simIntervalRef = useRef(null)

    const [selectedUnit, setSelectedUnit] = useState(1)
    const [uniqueUnits, setUniqueUnits] = useState([])
    const [batchResults, setBatchResults] = useState([])
    const [batchLoading, setBatchLoading] = useState(false)
    const [batchError, setBatchError] = useState(null)

    const [parsedHeaders, setParsedHeaders] = useState([])
    const [rawParsedLines, setRawParsedLines] = useState([])
    const [columnMap, setColumnMap] = useState({})
    const [showMappingUI, setShowMappingUI] = useState(false)
    const [hasHeader, setHasHeader] = useState(false)

    const [selectedSensor, setSelectedSensor] = useState("sensor_2")
    const [alerts, setAlerts] = useState([])
    const [stressMultiplier, setStressMultiplier] = useState(100)
    const prevStatusRef = useRef(null)

    const unitRows = useMemo(() => allRows.filter(r => r.unit === selectedUnit), [allRows, selectedUnit])

    const handleConfirmMapping = () => {
        setParseError(null)
        try {
            const mappedRows = rawParsedLines.map((row, idx) => {
                const obj = {}
                ALL_COLUMNS.forEach(colName => {
                    const srcIdx = columnMap[colName]
                    if (srcIdx === undefined || srcIdx === -1 || srcIdx >= row.length) {
                        throw new Error(`Mapping for ${colName} is invalid or out of bounds.`)
                    }
                    const val = parseFloat(row[srcIdx])
                    if (isNaN(val)) {
                        throw new Error(`Non-numeric value found in row ${idx + 1} for column ${colName}.`)
                    }
                    obj[colName] = val
                })
                return obj
            })

            setAllRows(mappedRows)
            const units = [...new Set(mappedRows.map(r => r.unit))].sort((a, b) => a - b)
            setUniqueUnits(units)
            if (units.length > 0) {
                setSelectedUnit(units[0])
            }
            setRowIndex(0)
            setShowMappingUI(false)
        } catch (err) {
            setParseError(err.message || "Failed to process data. Ensure all mapped columns contain numbers.")
        }
    }

    const handleFile = (e) => {
        const file = e.target.files[0]
        if (!file) return
        setFileName(file.name)
        setResult(null); setError(null); setParseError(null)
        const reader = new FileReader()
        reader.onload = (ev) => {
            try {
                const text = ev.target.result.trim()
                const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
                if (lines.length === 0) {
                    throw new Error("Empty file")
                }

                // 1. Detect Delimiter
                const firstLine = lines[0]
                let delimiter = /\s+/
                if (firstLine.includes(",")) {
                    delimiter = ","
                } else if (firstLine.includes("\t")) {
                    delimiter = "\t"
                }

                // 2. Parse First Line to check if it contains headers
                const firstRowParts = firstLine.split(delimiter).map(p => p.trim())
                const hasHeader = firstRowParts.some(part => /[a-zA-Z]/.test(part))
                setHasHeader(hasHeader)

                let headers = []
                let dataLines = []

                if (hasHeader) {
                    headers = firstRowParts
                    dataLines = lines.slice(1)
                } else {
                    headers = firstRowParts.map((_, idx) => `Col ${idx + 1}`)
                    dataLines = lines
                }

                // 3. Parse all data lines
                const parsed = dataLines.map(line => {
                    return line.split(delimiter).map(p => p.trim())
                })

                if (parsed.length === 0) {
                    throw new Error("No data rows found")
                }

                // 4. Auto-detect mapping
                const newMap = {}
                ALL_COLUMNS.forEach((colName, colIdx) => {
                    let matchedIdx = -1
                    if (colName === "unit") {
                        matchedIdx = headers.findIndex(h => /unit|id|engine/i.test(h))
                    } else if (colName === "cycle") {
                        matchedIdx = headers.findIndex(h => /cycle|time|step/i.test(h))
                    } else if (colName === "op_1") {
                        matchedIdx = headers.findIndex(h => /op_?1|setting_?1/i.test(h))
                    } else if (colName === "op_2") {
                        matchedIdx = headers.findIndex(h => /op_?2|setting_?2/i.test(h))
                    } else if (colName === "op_3") {
                        matchedIdx = headers.findIndex(h => /op_?3|setting_?3/i.test(h))
                    } else if (colName.startsWith("sensor_")) {
                        const sNum = colName.split("_")[1]
                        const re = new RegExp(`sensor_?\\s*0*${sNum}$|s_?\\s*0*${sNum}$|s${sNum}$`, "i")
                        matchedIdx = headers.findIndex(h => re.test(h))
                    }

                    if (matchedIdx === -1) {
                        matchedIdx = colIdx < headers.length ? colIdx : -1
                    }
                    newMap[colName] = matchedIdx
                })

                setParsedHeaders(headers)
                setRawParsedLines(parsed)
                setColumnMap(newMap)
                setShowMappingUI(true)
            } catch (err) {
                setParseError("Could not parse file. Please upload a valid space-separated, CSV, or TSV telemetry file.")
                setAllRows([])
                setUniqueUnits([])
                setBatchResults([])
                setFileName(null)
            }
        }
        reader.readAsText(file)
    }

    const runBatchPrediction = async (unitId, rows) => {
        setBatchLoading(true)
        setBatchError(null)
        try {
            const unitRows = rows.filter(r => r.unit === unitId)
            const computed = []
            
            const history = {}
            SIGNAL_SENSORS.forEach(s => { history[s] = [] })

            unitRows.forEach(row => {
                const features = { op_1: row.op_1, op_2: row.op_2, op_3: row.op_3 }
                SIGNAL_SENSORS.forEach(s => {
                    const key = `sensor_${s}`
                    const val = row[key]
                    
                    const hist = history[s]
                    hist.push(val)
                    if (hist.length > 5) {
                        hist.shift()
                    }

                    const sum = hist.reduce((a, b) => a + b, 0)
                    const mean = sum / hist.length
                    
                    let sumSqDiff = 0
                    for (let i = 0; i < hist.length; i++) {
                        sumSqDiff += (hist[i] - mean) ** 2
                    }
                    const std = Math.sqrt(sumSqDiff / hist.length)

                    features[key] = val
                    features[`${key}_rmean`] = parseFloat(mean.toFixed(5))
                    features[`${key}_rstd`] = parseFloat(std.toFixed(5))
                })
                computed.push(features)
            })

            const res = await axios.post(`${API_BASE_URL}/predict_batch`, computed)
            
            const results = res.data.results.map((item, idx) => ({
                cycle: unitRows[idx].cycle,
                label: item.label,
                prediction: item.prediction,
                Normal: item.probability.Normal,
                Warning: item.probability.Warning,
                Critical: item.probability.Critical,
                rul: item.rul,
                originalIndex: rows.findIndex(r => r.unit === unitId && r.cycle === unitRows[idx].cycle)
            }))
            
            setBatchResults(results)
        } catch (e) {
            setBatchError(e.response?.data?.error || "Could not fetch batch predictions.")
        } finally {
            setBatchLoading(false)
        }
    }

    useEffect(() => {
        if (mode === "upload" && allRows.length > 0 && selectedUnit) {
            runBatchPrediction(selectedUnit, allRows)
        }
    }, [selectedUnit, allRows, mode])

    useEffect(() => {
        if (mode === "upload" && allRows.length > 0 && rowIndex !== undefined) {
            const autoPredict = async () => {
                try {
                    const features = computeModelFeatures(allRows, rowIndex)
                    const res = await axios.post(`${API_BASE_URL}/predict`, features)
                    setResult(res.data)
                } catch (e) {
                    console.error("Auto predict failed:", e)
                }
            }
            autoPredict()
        }
    }, [rowIndex, allRows, mode])

    useEffect(() => {
        if (isPlaying) {
            simIntervalRef.current = setInterval(() => {
                setRowIndex(currentIdx => {
                    const activeUnitIdx = Math.max(0, unitRows.indexOf(allRows[currentIdx]))
                    if (activeUnitIdx < unitRows.length - 1) {
                        const nextRow = unitRows[activeUnitIdx + 1]
                        return allRows.indexOf(nextRow)
                    } else {
                        setIsPlaying(false)
                        return currentIdx
                    }
                })
            }, 1000)
        } else {
            clearInterval(simIntervalRef.current)
        }
        return () => clearInterval(simIntervalRef.current)
    }, [isPlaying, unitRows, allRows])

    const toggleSimulation = () => {
        setIsPlaying(p => !p)
    }

    const handlePredict = async () => {
        setLoading(true); setError(null); setResult(null)
        try {
            const features = mode === "upload"
                ? computeModelFeatures(allRows, rowIndex)
                : computeManualFeatures(manualVals, stressMultiplier / 100)
            const res = await axios.post(`${API_BASE_URL}/predict`, features)
            setResult(res.data)
        } catch (e) {
            setError(e.response?.data?.error || `Could not connect to API. Make sure Flask is running on ${API_BASE_URL}.`)
        } finally {
            setLoading(false)
        }
    }

    const handleChartClick = (state) => {
        if (state && state.activeTooltipIndex !== undefined) {
            const clickedPoint = batchResults[state.activeTooltipIndex]
            if (clickedPoint) {
                setRowIndex(clickedPoint.originalIndex)
            }
        }
    }

    useEffect(() => {
        if (allRows.length > 0 && selectedUnit) {
            const firstRowOfUnit = allRows.findIndex(r => r.unit === selectedUnit)
            if (firstRowOfUnit !== -1) {
                setRowIndex(firstRowOfUnit)
            }
        }
    }, [selectedUnit])

    const dismissAlert = (id) => {
        setAlerts(prev => prev.filter(alert => alert.id !== id))
    }

    useEffect(() => {
        if (alerts.length > 0) {
            const timer = setTimeout(() => {
                dismissAlert(alerts[alerts.length - 1].id)
            }, 4000)
            return () => clearTimeout(timer)
        }
    }, [alerts])

    useEffect(() => {
        if (mode === "manual") {
            const autoPredictManual = async () => {
                try {
                    const features = computeManualFeatures(manualVals, stressMultiplier / 100)
                    const res = await axios.post(`${API_BASE_URL}/predict`, features)
                    setResult(res.data)
                } catch (e) {
                    console.error("Manual auto predict failed:", e)
                }
            }
            const timer = setTimeout(autoPredictManual, 150)
            return () => clearTimeout(timer)
        }
    }, [manualVals, stressMultiplier, mode])

    const activeCycle = allRows[rowIndex]?.cycle || 1

    useEffect(() => {
        if (result && result.label) {
            const currentLabel = result.label
            const lastLabel = prevStatusRef.current
            
            if (lastLabel && lastLabel !== currentLabel) {
                let severity = "info"
                let icon = "ℹ️"
                if (currentLabel === "Warning") {
                    severity = "warning"
                    icon = "⚠️"
                } else if (currentLabel === "Critical") {
                    severity = "critical"
                    icon = "🚨"
                }

                const newAlert = {
                    id: Date.now(),
                    text: `Engine #${selectedUnit} transitioned from ${lastLabel} to ${currentLabel} (Cycle ${activeCycle})`,
                    severity,
                    icon
                }
                setAlerts(prev => [newAlert, ...prev].slice(0, 5))
            }
            prevStatusRef.current = currentLabel
        }
    }, [result, selectedUnit, activeCycle])

    const handleExportPDF = () => {
        if (allRows.length === 0 || batchResults.length === 0) return

        const printWindow = window.open("", "_blank")
        if (!printWindow) return

        const normalCount = batchResults.filter(r => r.label === "Normal").length
        const warningCount = batchResults.filter(r => r.label === "Warning").length
        const criticalCount = batchResults.filter(r => r.label === "Critical").length
        const total = batchResults.length

        const finalRUL = batchResults[batchResults.length - 1]?.rul || 0
        const activeUnitLabel = batchResults[batchResults.length - 1]?.label || "Normal"

        const currentData = allRows[rowIndex] || {}
        const tableRows = [...OPS, ...ALL_SENSORS].map(key => {
            return `
                <tr>
                    <td style="padding: 6px 12px; border-bottom: 1px solid #e2e8f0; font-family: monospace;">${key}</td>
                    <td style="padding: 6px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace; font-weight: 600;">
                        ${currentData[key] !== undefined ? currentData[key].toFixed(4) : "N/A"}
                    </td>
                </tr>
            `
        }).join("")

        printWindow.document.write(`
            <html>
            <head>
                <title>Engine Diagnostics Report - Engine #${selectedUnit}</title>
                <style>
                    body {
                        font-family: 'Inter', system-ui, sans-serif;
                        color: #1e293b;
                        padding: 3rem;
                        background: #fff;
                    }
                    .header {
                        border-bottom: 2px solid #3b82f6;
                        padding-bottom: 1.5rem;
                        margin-bottom: 2rem;
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                    }
                    .title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
                    .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
                    .meta { text-align: right; font-size: 12px; color: #64748b; }
                    .card-grid {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 1.5rem;
                        margin-bottom: 2.5rem;
                    }
                    .card {
                        background: #f8fafc;
                        border: 1px solid #e2e8f0;
                        border-radius: 12px;
                        padding: 1.25rem;
                        text-align: center;
                    }
                    .card-val { font-size: 28px; font-weight: 700; margin-top: 6px; }
                    .table-title { font-size: 15px; font-weight: 700; margin-bottom: 1rem; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 2.5rem; }
                    th { text-align: left; padding: 8px 12px; background: #f1f5f9; font-size: 11px; text-transform: uppercase; color: #475569; }
                    .badge {
                        display: inline-block;
                        padding: 4px 10px;
                        border-radius: 6px;
                        font-weight: 600;
                        font-size: 12px;
                    }
                    .badge-Normal { background: #dcfce7; color: #15803d; }
                    .badge-Warning { background: #fef9c3; color: #a16207; }
                    .badge-Critical { background: #fee2e2; color: #b91c1c; }
                    @media print {
                        body { padding: 0; }
                        button { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h1 class="title">Engine Diagnostics & Maintenance Report</h1>
                        <div class="subtitle">NASA CMAPSS Turbofan Health Monitoring — Fleet Intelligence</div>
                    </div>
                    <div class="meta">
                        <div>Report Date: ${new Date().toLocaleDateString()}</div>
                        <div>Target Unit: <strong>Engine #${selectedUnit}</strong></div>
                    </div>
                </div>

                <div class="card-grid">
                    <div class="card" style="border-top: 4px solid #3b82f6;">
                        <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Operating Cycles</div>
                        <div class="card-val">${total}</div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">total flight recordings</div>
                    </div>
                    <div class="card" style="border-top: 4px solid ${
                        finalRUL > 50 ? "#22c55e" : finalRUL > 20 ? "#eab308" : "#ef4444"
                    };">
                        <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Est. RUL at Last Cycle</div>
                        <div class="card-val" style="color: ${
                            finalRUL > 50 ? "#15803d" : finalRUL > 20 ? "#a16207" : "#b91c1c"
                        };">${finalRUL} <span style="font-size: 14px;">cycles</span></div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">remaining life forecast</div>
                    </div>
                    <div class="card" style="border-top: 4px solid #64748b;">
                        <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Diagnostics Verdict</div>
                        <div class="card-val"><span class="badge badge-${activeUnitLabel}">${activeUnitLabel}</span></div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">based on model classification</div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 2rem;">
                    <div>
                        <div class="table-title">Full Lifecycle Health Profile</div>
                        <table>
                            <thead>
                                <tr>
                                    <th>State</th>
                                    <th style="text-align: right;">Cycle Count</th>
                                    <th style="text-align: right;">Percentage</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500; color: #15803d;">Normal</td>
                                    <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">${normalCount}</td>
                                    <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">${((normalCount / total) * 100).toFixed(1)}%</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500; color: #a16207;">Warning</td>
                                    <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">${warningCount}</td>
                                    <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">${((warningCount / total) * 100).toFixed(1)}%</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500; color: #b91c1c;">Critical</td>
                                    <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">${criticalCount}</td>
                                    <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">${((criticalCount / total) * 100).toFixed(1)}%</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="table-title">Maintenance Recommendation</div>
                        <div style="background: #f8fafc; border-left: 4px solid #3b82f6; padding: 1rem; border-radius: 0 8px 8px 0; font-size: 13px; line-height: 1.5;">
                            ${
                                activeUnitLabel === "Critical" 
                                ? "<strong>🚨 ACTION REQUIRED IMMEDIATE:</strong> The engine is currently in a critical wear phase. Schedule a complete turbine teardown and replace degraded components before further operations."
                                : activeUnitLabel === "Warning"
                                ? "<strong>⚠️ PREVENTATIVE MAINTENANCE:</strong> Engine is showing early compressor degradation trends. Schedule shop-visit and blade inspection within the next 10-15 flight cycles."
                                : "<strong>✅ DEPLOYABLE:</strong> The engine is operating within safe nominal parameters. No scheduled maintenance is required at this time. Continue standard trend monitoring."
                            }
                        </div>
                    </div>

                    <div>
                        <div class="table-title">Sensor Snapshot (Cycle ${activeCycle})</div>
                        <table style="font-size: 11px;">
                            <thead>
                                <tr>
                                    <th>Parameter</th>
                                    <th style="text-align: right;">Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tableRows}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style="margin-top: 3rem; text-align: center;">
                    <button onclick="window.print()" style="padding: 10px 24px; background: #3b82f6; border: none; border-radius: 6px; color: #fff; font-weight: 600; font-size: 14px; cursor: pointer;">
                        Print Report / Save as PDF
                    </button>
                </div>
            </body>
            </html>
        `)
        printWindow.document.close()
    }

    const activeUnitIndex = Math.max(0, unitRows.indexOf(allRows[rowIndex]))

    const cfg = result ? STATE_CONFIG[result.label] : null
    const canPredict = mode === "manual" || (mode === "upload" && allRows.length > 0)

    return (
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>

            {/* Header */}
            <div style={{ marginBottom: "2rem" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--accent)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "6px" }}>Live Prediction</div>
                <h1 style={{ fontSize: "26px", fontWeight: 700, marginBottom: "6px" }}>Engine Health Predictor</h1>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Upload sensor data or enter readings manually to predict engine health.</div>
            </div>

            {/* Mode Toggle */}
            <div style={{ display: "flex", gap: "4px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "4px", marginBottom: "1.5rem", width: "fit-content" }}>
                {["upload", "manual"].map(m => (
                    <button key={m} onClick={() => { setMode(m); setResult(null); setError(null) }} style={{
                        padding: "8px 24px", borderRadius: "7px", border: "none",
                        background: mode === m ? "var(--accent)" : "transparent",
                        color: mode === m ? "#fff" : "var(--text-secondary)",
                        fontSize: "13px", fontWeight: mode === m ? 600 : 400,
                        cursor: "pointer", transition: "all 0.15s", textTransform: "capitalize"
                    }}>
                        {m === "upload" ? "Upload File" : "Manual Input"}
                    </button>
                ))}
            </div>

            {/* Upload Mode */}
            {mode === "upload" && (
                <div style={{ display: "grid", gridTemplateColumns: (allRows.length > 0 && !showMappingUI) ? "1.2fr 1fr" : "1fr", gap: "2rem", alignItems: "start", marginBottom: "1.5rem" }}>
                    
                    {showMappingUI ? (
                        /* Column Mapping UI */
                        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.5rem" }}>
                            <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "0.5rem" }}>Verify Telemetry Column Mapping</h3>
                            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
                                We auto-detected columns for your file: <strong>{fileName}</strong>. Please review or adjust them to align with our model features.
                            </p>

                            {parseError && (
                                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid #EF4444", borderRadius: "10px", padding: "1rem", fontSize: "13px", color: "#EF4444", marginBottom: "1.5rem" }}>
                                    {parseError}
                                </div>
                            )}

                            {/* Section 1: Core Fields */}
                            <div style={{ marginBottom: "1.5rem" }}>
                                <h4 style={{ fontSize: "12px", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem", borderBottom: "1px solid var(--border)", paddingBottom: "4px" }}>
                                    Core Attributes
                                </h4>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                                    {["unit", "cycle", "op_1", "op_2", "op_3"].map(colName => (
                                        <div key={colName}>
                                            <label style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px", textTransform: "capitalize" }}>
                                                {colName.replace("_", " ")}
                                            </label>
                                            <select
                                                value={columnMap[colName] !== undefined ? columnMap[colName] : -1}
                                                onChange={e => setColumnMap(p => ({ ...p, [colName]: parseInt(e.target.value) }))}
                                                style={{
                                                    width: "100%", background: "#0d1424", border: "1px solid var(--border)", borderRadius: "6px",
                                                    color: "var(--text-primary)", fontSize: "12px", padding: "6px 8px", outline: "none", cursor: "pointer"
                                                }}
                                            >
                                                <option value={-1}>-- Not Mapped --</option>
                                                {parsedHeaders.map((h, i) => (
                                                    <option key={i} value={i}>
                                                        {hasHeader ? `Col ${i + 1} (${h})` : `Col ${i + 1}`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Section 2: Sensor Fields */}
                            <div style={{ marginBottom: "1.5rem" }}>
                                <h4 style={{ fontSize: "12px", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem", borderBottom: "1px solid var(--border)", paddingBottom: "4px" }}>
                                    Engine Sensors
                                </h4>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", maxHeight: "280px", overflowY: "auto", paddingRight: "4px" }}>
                                    {ALL_SENSORS.map(colName => (
                                        <div key={colName}>
                                            <label style={{ display: "block", fontSize: "10px", color: "var(--text-secondary)", marginBottom: "4px", fontFamily: "var(--font-mono)" }}>
                                                {colName}
                                            </label>
                                            <select
                                                value={columnMap[colName] !== undefined ? columnMap[colName] : -1}
                                                onChange={e => setColumnMap(p => ({ ...p, [colName]: parseInt(e.target.value) }))}
                                                style={{
                                                    width: "100%", background: "#0d1424", border: "1px solid var(--border)", borderRadius: "6px",
                                                    color: "var(--text-primary)", fontSize: "11px", padding: "4px 6px", outline: "none", cursor: "pointer"
                                                }}
                                            >
                                                <option value={-1}>-- Not Mapped --</option>
                                                {parsedHeaders.map((h, i) => (
                                                    <option key={i} value={i}>
                                                        {hasHeader ? `Col ${i + 1} (${h})` : `Col ${i + 1}`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Buttons */}
                            <div style={{ display: "flex", gap: "12px", marginTop: "1rem" }}>
                                <button
                                    onClick={() => { setShowMappingUI(false); setFileName(null); setRawParsedLines([]); }}
                                    style={{
                                        flex: 1, padding: "10px", background: "transparent", border: "1px solid var(--border)",
                                        borderRadius: "8px", color: "var(--text-secondary)", fontSize: "13px", fontWeight: 500,
                                        cursor: "pointer", transition: "all 0.15s"
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.borderColor = "var(--text-muted)"}
                                    onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmMapping}
                                    style={{
                                        flex: 2, padding: "10px", background: "var(--accent)", border: "none",
                                        borderRadius: "8px", color: "#fff", fontSize: "13px", fontWeight: 600,
                                        cursor: "pointer", transition: "all 0.15s"
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#2563eb"}
                                    onMouseLeave={e => e.currentTarget.style.background = "var(--accent)"}
                                >
                                    Confirm & Predict
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Normal Upload & Simulation Left Column */
                        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                        <div
                            onClick={() => fileRef.current.click()}
                            style={{
                                border: "2px dashed var(--border)", borderRadius: "12px",
                                padding: "2rem", textAlign: "center", cursor: "pointer",
                                transition: "border 0.15s",
                                background: fileName ? "rgba(59,130,246,0.05)" : "transparent"
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent)"}
                            onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
                        >
                            <input ref={fileRef} type="file" accept=".txt,.csv" onChange={handleFile} style={{ display: "none" }} />
                            <div style={{ fontSize: "28px", marginBottom: "8px" }}>📂</div>
                            <div style={{ fontSize: "14px", fontWeight: 500, color: fileName ? "var(--accent)" : "var(--text-primary)", marginBottom: "4px" }}>
                                {fileName || "Click to upload"}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                                {allRows.length > 0 ? `${allRows.length.toLocaleString()} rows loaded` : "Space-separated .txt file"}
                            </div>
                        </div>

                        {parseError && (
                            <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid #EF4444", borderRadius: "10px", padding: "1rem", fontSize: "13px", color: "#EF4444" }}>{parseError}</div>
                        )}

                        {allRows.length > 0 && (
                            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.5rem" }}>
                                {/* Row Slider */}
                                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
                                    <button
                                        onClick={toggleSimulation}
                                        style={{
                                            background: isPlaying ? "var(--critical)" : "var(--accent)",
                                            border: "none", borderRadius: "50%", width: "42px", height: "42px",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            color: "#fff", cursor: "pointer", fontSize: "16px", transition: "all 0.15s"
                                        }}
                                        title={isPlaying ? "Pause Simulation" : "Play Simulation"}
                                    >
                                        {isPlaying ? "⏸" : "▶"}
                                    </button>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                                            Select Cycle (1 — {unitRows.length}) for Engine #{selectedUnit}
                                        </label>
                                        <input type="range" min={0} max={unitRows.length - 1} value={activeUnitIndex}
                                            onChange={e => {
                                                const uIdx = parseInt(e.target.value)
                                                const newGlobalRow = unitRows[uIdx]
                                                setRowIndex(allRows.indexOf(newGlobalRow))
                                                if (isPlaying) toggleSimulation()
                                            }}
                                            style={{ width: "100%", accentColor: "var(--accent)" }}
                                        />
                                    </div>
                                    <div style={{ textAlign: "center", minWidth: "80px" }}>
                                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 700, color: "var(--accent)" }}>{activeCycle}</div>
                                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>cycle index</div>
                                    </div>
                                </div>

                                {/* All sensor values display */}
                                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                    Sensor Readings — Engine #{selectedUnit}, Cycle {activeCycle}
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}>
                                    {[...OPS, ...ALL_SENSORS].map(key => (
                                        <div key={key} style={{ background: "#0d1424", borderRadius: "6px", padding: "6px 10px", display: "flex", justifyContent: "space-between" }}>
                                            <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{key}</span>
                                            <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-secondary)" }}>
                                                {allRows[rowIndex]?.[key]?.toFixed(3)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        </div>
                    )}

                    {/* Right Column - Batch Analysis Report */}
                    {allRows.length > 0 && !showMappingUI && (
                        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem", minHeight: "100%" }}>
                            
                            {/* Header & Unit Selector */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                            Batch Analysis
                                        </div>
                                        <button
                                            onClick={handleExportPDF}
                                            style={{
                                                background: "rgba(59,130,246,0.1)", border: "1px solid var(--accent)", borderRadius: "6px",
                                                color: "var(--accent)", fontSize: "10px", fontWeight: 600, padding: "3px 8px", cursor: "pointer", transition: "all 0.15s"
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.color = "#fff"; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = "rgba(59,130,246,0.1)"; e.currentTarget.style.color = "var(--accent)"; }}
                                        >
                                            📄 Export Diagnostics
                                        </button>
                                    </div>
                                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                                        Full Unit Degradation Trend
                                    </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Unit:</span>
                                    <select
                                        value={selectedUnit}
                                        onChange={e => setSelectedUnit(parseInt(e.target.value))}
                                        style={{
                                            background: "#0d1424", border: "1px solid var(--border)", borderRadius: "6px",
                                            color: "var(--text-primary)", fontSize: "12px", fontFamily: "var(--font-mono)",
                                            padding: "4px 8px", outline: "none", cursor: "pointer"
                                        }}
                                    >
                                        {uniqueUnits.map(u => (
                                            <option key={u} value={u}>Engine #{u}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Divider */}
                            <div style={{ height: "1px", background: "var(--border)" }} />

                            {batchLoading ? (
                                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "300px", gap: "12px" }}>
                                    <div style={{ fontSize: "24px", animation: "spin 1.5s linear infinite" }}>🔄</div>
                                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Running predictions for Engine #{selectedUnit}...</div>
                                    <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                                </div>
                            ) : batchError ? (
                                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid #EF4444", borderRadius: "8px", padding: "1rem", fontSize: "12px", color: "#EF4444" }}>
                                    {batchError}
                                </div>
                            ) : (
                                <>
                                    {/* Classification Metrics */}
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                                        {[
                                            { label: "Normal", color: "#10B981", count: batchResults.filter(r => r.label === "Normal").length },
                                            { label: "Warning", color: "#F59E0B", count: batchResults.filter(r => r.label === "Warning").length },
                                            { label: "Critical", color: "#EF4444", count: batchResults.filter(r => r.label === "Critical").length },
                                        ].map(stat => {
                                            const pct = batchResults.length > 0 ? ((stat.count / batchResults.length) * 100).toFixed(0) : 0
                                            return (
                                                <div key={stat.label} style={{ background: "#0d1424", border: `1px solid ${stat.color}22`, borderRadius: "8px", padding: "8px 10px", textAlign: "center" }}>
                                                    <div style={{ fontSize: "10px", color: stat.color, fontWeight: 600, textTransform: "uppercase" }}>{stat.label}</div>
                                                    <div style={{ fontSize: "18px", fontWeight: 700, margin: "2px 0", color: "var(--text-primary)" }}>{stat.count}</div>
                                                    <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{pct}% of cycles</div>
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {/* Degradation Chart */}
                                    <div style={{ background: "#0d1424", borderRadius: "8px", padding: "10px" }}>
                                        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
                                            <span>Probability Trend vs. Operating Cycle</span>
                                            <span style={{ color: "var(--accent)" }}>Click point to inspect</span>
                                        </div>
                                        <ResponsiveContainer width="100%" height={210}>
                                            <AreaChart data={batchResults} onClick={handleChartClick} style={{ cursor: "pointer" }} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.2} />
                                                <XAxis dataKey="cycle" tick={{ fontSize: 9, fill: "var(--text-secondary)" }} stroke="var(--border)" />
                                                <YAxis tick={{ fontSize: 9, fill: "var(--text-secondary)" }} domain={[0, 1]} stroke="var(--border)" tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
                                                <Tooltip
                                                    content={({ active, payload, label }) => {
                                                        if (active && payload && payload.length) {
                                                            const data = payload[0].payload
                                                            return (
                                                                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px", fontSize: "11px" }}>
                                                                    <div style={{ fontWeight: 600, marginBottom: "6px" }}>Cycle {label}</div>
                                                                    <div style={{ color: "#10B981" }}>Normal: {(data.Normal * 100).toFixed(0)}%</div>
                                                                    <div style={{ color: "#F59E0B" }}>Warning: {(data.Warning * 100).toFixed(0)}%</div>
                                                                    <div style={{ color: "#EF4444" }}>Critical: {(data.Critical * 100).toFixed(0)}%</div>
                                                                    <div style={{ height: "1px", background: "var(--border)", margin: "6px 0" }} />
                                                                    <div style={{ color: "var(--accent)", fontWeight: 600 }}>Est. RUL: {data.rul} cycles</div>
                                                                </div>
                                                            )
                                                        }
                                                        return null
                                                    }}
                                                />
                                                <Area type="monotone" dataKey="Normal" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.15} />
                                                <Area type="monotone" dataKey="Warning" stackId="1" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.15} />
                                                <Area type="monotone" dataKey="Critical" stackId="1" stroke="#EF4444" fill="#EF4444" fillOpacity={0.15} />
                                            </AreaChart></ResponsiveContainer></div>


                                    {/* Explanation note */}
                                    <div style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: 1.4 }}>
                                        💡 The chart shows the progressive degradation of **Engine #{selectedUnit}** over its {batchResults.length} operational cycles. Clicking any point updates the telemetry details and row selection on the left.
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                </div>
            )}

            {/* Manual Mode */}
            {mode === "manual" && (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.5rem", marginBottom: "1.5rem" }}>
                    
                    {/* What-If Presets Panel */}
                    <div style={{ display: "flex", gap: "10px", marginBottom: "1.5rem", alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>Presets:</span>
                        {[
                            { name: "Nominal Cruise", desc: "Default safe settings", values: DEFAULT_VALS },
                            {
                                name: "Takeoff Stress", desc: "High temperatures and settings", values: {
                                    ...DEFAULT_VALS,
                                    op_1: 0.0025, op_2: 0.0008, op_3: 100.0,
                                    sensor_2: 643.5, sensor_3: 1600.2, sensor_4: 1425.4,
                                    sensor_7: 550.2, sensor_11: 48.2, sensor_12: 518.5,
                                    sensor_20: 38.5, sensor_21: 23.1
                                }
                            },
                            {
                                name: "HPC Blade Wear", desc: "High compressor exhaust temp & low pressure", values: {
                                    ...DEFAULT_VALS,
                                    sensor_2: 642.9, sensor_3: 1595.4, sensor_4: 1418.1,
                                    sensor_7: 552.1, sensor_11: 47.9, sensor_12: 520.1,
                                    sensor_14: 8145.2, sensor_20: 38.8, sensor_21: 23.2
                                }
                            }
                        ].map(preset => (
                            <button
                                key={preset.name}
                                onClick={() => {
                                    setManualVals(preset.values)
                                    setStressMultiplier(100)
                                }}
                                style={{
                                    padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border)",
                                    background: "#0d1424", color: "var(--text-secondary)", fontSize: "11px",
                                    cursor: "pointer", transition: "all 0.15s"
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                                title={preset.desc}
                            >
                                {preset.name}
                            </button>
                        ))}
                    </div>

                    {/* Stress Multiplier Slider */}
                    <div style={{ background: "#0d1424", borderRadius: "10px", padding: "12px", marginBottom: "1.5rem", border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", alignItems: "center" }}>
                            <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>System Stress Multiplier</span>
                            <span style={{ fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 600, color: stressMultiplier > 105 ? "var(--critical)" : stressMultiplier > 95 ? "var(--accent)" : "var(--normal)" }}>
                                {stressMultiplier}%
                            </span>
                        </div>
                        <input
                            type="range" min={80} max={120} value={stressMultiplier}
                            onChange={e => setStressMultiplier(parseInt(e.target.value))}
                            style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer" }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>
                            <span>80% (Under-stressed)</span>
                            <span>100% (Nominal)</span>
                            <span>120% (Over-loaded)</span>
                        </div>
                    </div>

                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Operational Settings
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "1.5rem" }}>
                        {OPS.map(key => (
                            <div key={key}>
                                <label style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", display: "block", marginBottom: "4px" }}>{key}</label>
                                <input type="number" step="any" value={manualVals[key]}
                                    onChange={e => setManualVals(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
                                    style={{ width: "100%", padding: "8px 10px", background: "#0d1424", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "12px", outline: "none" }}
                                    onFocus={e => e.target.style.borderColor = "var(--accent)"}
                                    onBlur={e => e.target.style.borderColor = "var(--border)"}
                                />
                            </div>
                        ))}
                    </div>

                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        All Sensor Readings
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                        {ALL_SENSORS.map(key => (
                            <div key={key}>
                                <label style={{ fontSize: "11px", fontFamily: "var(--font-mono)", display: "block", marginBottom: "4px", color: "var(--text-muted)" }}>
                                    {key}
                                </label>
                                <input type="number" step="any" value={manualVals[key]}
                                    onChange={e => setManualVals(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
                                    style={{ width: "100%", padding: "8px 10px", background: "#0d1424", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "12px", outline: "none" }}
                                    onFocus={e => e.target.style.borderColor = "var(--accent)"}
                                    onBlur={e => e.target.style.borderColor = "var(--border)"}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Predict Button */}
            {(!showMappingUI || mode === "manual") && (
                <button onClick={handlePredict} disabled={loading || !canPredict} style={{
                    width: "100%", padding: "14px", background: !canPredict ? "#1a2235" : loading ? "#1e3a5f" : "var(--accent)",
                    border: "none", borderRadius: "10px", color: !canPredict ? "var(--text-muted)" : "#fff",
                    fontSize: "15px", fontWeight: 600, cursor: !canPredict || loading ? "not-allowed" : "pointer",
                    transition: "all 0.15s", marginBottom: "1.5rem", letterSpacing: "0.03em"
                }}
                    onMouseEnter={e => { if (canPredict && !loading) e.currentTarget.style.background = "#2563eb" }}
                    onMouseLeave={e => { if (canPredict && !loading) e.currentTarget.style.background = "var(--accent)" }}
                >
                    {!canPredict ? "Upload a file first" : loading ? "Predicting..." : "Predict Health State"}
                </button>
            )}

            {/* Error */}
            {(!showMappingUI || mode === "manual") && error && (
                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid #EF4444", borderRadius: "10px", padding: "1rem 1.25rem", fontSize: "13px", color: "#EF4444", marginBottom: "1.5rem" }}>
                    {error}
                </div>
            )}

            {/* Result */}
            {(!showMappingUI || mode === "manual") && result && cfg && (
                <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: "12px", padding: "2rem", textAlign: "center", animation: "fadeIn 0.4s ease" }}>
                    <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }`}</style>
                    <PulseRing color={cfg.color} />
                    <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: cfg.color, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "6px" }}>Health State</div>
                    <div style={{ fontSize: "36px", fontWeight: 700, color: cfg.color, marginBottom: "8px" }}>{result.label}</div>
                    <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>{cfg.msg}</div>

                    {/* RUL Prediction Card */}
                    {result.rul !== undefined && (
                        <div style={{
                            background: "rgba(0,0,0,0.2)", borderRadius: "10px", padding: "1.25rem",
                            marginBottom: "1.5rem", borderLeft: `4px solid ${
                                result.rul > 50 ? "#10B981" : result.rul > 20 ? "#F59E0B" : "#EF4444"
                            }`
                        }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ textAlign: "left" }}>
                                    <div style={{ fontSize: "10px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                        Remaining Useful Life (RUL)
                                    </div>
                                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                                        Estimated cycles remaining before maintenance
                                    </div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <span style={{
                                        fontSize: "26px", fontWeight: 700, fontFamily: "var(--font-mono)",
                                        color: result.rul > 50 ? "#10B981" : result.rul > 20 ? "#F59E0B" : "#EF4444"
                                    }}>
                                        {result.rul}
                                    </span>
                                    <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "4px" }}>cycles</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", textAlign: "left" }}>
                        {Object.entries(result.probability).map(([cls, prob]) => {
                            const c = STATE_CONFIG[cls].color
                            return (
                                <div key={cls} style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "12px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                                        <span style={{ fontSize: "12px", color: c, fontWeight: 600 }}>{cls}</span>
                                        <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{(prob * 100).toFixed(1)}%</span>
                                    </div>
                                    <div style={{ height: "4px", background: "rgba(255,255,255,0.1)", borderRadius: "2px" }}>
                                        <div style={{ height: "100%", width: `${prob * 100}%`, background: c, borderRadius: "2px", transition: "width 0.8s ease" }} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Sensor Trend Profile */}
            {mode === "upload" && allRows.length > 0 && !showMappingUI && !batchLoading && batchResults.length > 0 && (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.5rem", marginTop: "1.5rem" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>Sensor Trend Profile</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Sensor:</span>
                            <select
                                value={selectedSensor}
                                onChange={e => setSelectedSensor(e.target.value)}
                                style={{
                                    background: "#0d1424", border: "1px solid var(--border)", borderRadius: "6px",
                                    color: "var(--text-primary)", fontSize: "12px", fontFamily: "var(--font-mono)",
                                    padding: "4px 8px", outline: "none", cursor: "pointer"
                                }}
                            >
                                {SIGNAL_SENSORS.map(s => (
                                    <option key={s} value={`sensor_${s}`}>sensor_${s}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ background: "#0d1424", borderRadius: "8px", padding: "12px" }}>
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={batchResults} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="sensorGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity="0.3"/>
                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.2} />
                                <XAxis dataKey="cycle" tick={{ fontSize: 9, fill: "var(--text-secondary)" }} stroke="var(--border)" />
                                <YAxis tick={{ fontSize: 9, fill: "var(--text-secondary)" }} domain={["auto", "auto"]} stroke="var(--border)" />
                                <Tooltip
                                    content={({ active, payload, label }) => {
                                        if (active && payload && payload.length) {
                                            const idx = batchResults.findIndex(r => r.cycle === label)
                                            const val = allRows[batchResults[idx]?.originalIndex]?.[selectedSensor]
                                            return (
                                                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px", fontSize: "11px" }}>
                                                    <div style={{ fontWeight: 600, marginBottom: "4px" }}>Cycle {label}</div>
                                                    <div style={{ color: "#3B82F6", fontWeight: 600 }}>{selectedSensor}: {val?.toFixed(4)}</div>
                                                </div>
                                            )
                                        }
                                        return null
                                    }}
                                />
                                <Area type="monotone" dataKey={({ cycle }) => {
                                    const idx = batchResults.findIndex(r => r.cycle === cycle)
                                    return allRows[batchResults[idx]?.originalIndex]?.[selectedSensor] || 0
                                }} stroke="#3B82F6" fill="url(#sensorGrad)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Alerts Toast Queue */}
            <div style={{ position: "fixed", top: "20px", right: "20px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "10px", width: "320px", pointerEvents: "none" }}>
                {alerts.map(alert => (
                    <div
                        key={alert.id}
                        style={{
                            background: alert.severity === "critical" ? "rgba(239,68,68,0.95)" : alert.severity === "warning" ? "rgba(245,158,11,0.95)" : "rgba(59,130,246,0.95)",
                            color: "#fff",
                            border: "1px solid rgba(255,255,255,0.15)",
                            borderRadius: "10px",
                            padding: "12px 16px",
                            fontSize: "12px",
                            fontWeight: 500,
                            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.5)",
                            display: "flex",
                            gap: "10px",
                            alignItems: "flex-start",
                            pointerEvents: "auto",
                            cursor: "pointer",
                            animation: "slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
                        }}
                        onClick={() => dismissAlert(alert.id)}
                    >
                        <span style={{ fontSize: "16px", flexShrink: 0 }}>{alert.icon}</span>
                        <div style={{ flex: 1, lineHeight: 1.4 }}>{alert.text}</div>
                        <button style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", fontSize: "14px", cursor: "pointer", padding: 0 }}>&times;</button>
                    </div>
                ))}
                <style>{`
                    @keyframes slideIn {
                        from { transform: translateX(120%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                `}</style>
            </div>
        </div>
    )
}
import { useEffect, useState } from "react"
import { API_BASE_URL } from "../config"
import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis,
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from "recharts"

const modelData = [
    { model: "Random Forest", accuracy: 0.9167, precision: 0.8566, recall: 0.8706, f1: 0.8630 },
    { model: "SVM", accuracy: 0.8968, precision: 0.8256, recall: 0.8387, f1: 0.8314 },
    { model: "Gradient Boosting", accuracy: 0.9135, precision: 0.8526, recall: 0.8555, f1: 0.8540 },
    { model: "XGBoost", accuracy: 0.9117, precision: 0.8471, recall: 0.8599, f1: 0.8531 },
    { model: "KNN", accuracy: 0.8190, precision: 0.7595, recall: 0.8499, f1: 0.7799 },
    { model: "Decision Tree", accuracy: 0.8628, precision: 0.7821, recall: 0.8262, f1: 0.7972 },
]

const radarData = [
    { metric: "Accuracy", value: 0.9167 },
    { metric: "Precision", value: 0.8566 },
    { metric: "Recall", value: 0.8706 },
    { metric: "F1 Score", value: 0.8630 },
]

const classData = [
    { name: "Normal", value: 15531, color: "#10B981" },
    { name: "Warning", value: 3000, color: "#F59E0B" },
    { name: "Critical", value: 2096, color: "#EF4444" },
]

function ModelCard({ label, value, sub }) {
    return (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px 16px" }}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
            <div style={{ fontSize: "20px", fontWeight: 700, margin: "2px 0", color: "var(--text-primary)" }}>{value}</div>
            <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{sub}</div>
        </div>
    )
}

function StatCard({ label, value, sub, color }) {
    return (
        <div style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "1.25rem 1.5rem",
            borderTop: `3px solid ${color}`,
        }}>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {label}
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, fontFamily: "var(--font-mono)", color }}>
                {value}
            </div>
            {sub && <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>{sub}</div>}
        </div>
    )
}

export default function Dashboard() {
    const [selected, setSelected] = useState("Random Forest")
    const [apiStatus, setApiStatus] = useState("checking")
    const sel = modelData.find(m => m.model === selected)

    useEffect(() => {
        fetch(`${API_BASE_URL}/health`)
            .then(() => setApiStatus("online"))
            .catch(() => setApiStatus("offline"))
    }, [])

    return (
        <div style={{ maxWidth: "1100px" }}>

            {/* Header */}
            <div style={{ marginBottom: "2rem" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--accent)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "6px" }}>
                    Model Performance
                </div>
                <h1 style={{ fontSize: "26px", fontWeight: 700, marginBottom: "6px" }}>
                    Analysis Dashboard
                </h1>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                    5-Fold Stratified Cross Validation — NASA CMAPSS FD001 — 20,631 samples
                </div>
                <div style={{ marginTop: "8px", fontSize: "12px", fontFamily: "var(--font-mono)", color: apiStatus === "online" ? "var(--normal)" : "var(--critical)" }}>
                    ● API {apiStatus}
                </div>
            </div>

            {/* Stat Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
                <StatCard label="Best Model" value="RF" sub="Random Forest" color="#3B82F6" />
                <StatCard label="Best F1" value="86.3%" sub="Macro F1 Score" color="#10B981" />
                <StatCard label="Total Samples" value="20.6k" sub="Engine cycles" color="#F59E0B" />
                <StatCard label="Classes" value="3" sub="Normal / Warning / Critical" color="#EF4444" />
            </div>

            {/* Model Selector + F1 Bar */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>

                {/* F1 Comparison */}
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.5rem" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "1.25rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        F1 Score Comparison
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={modelData} layout="vertical" margin={{ left: 10, right: 30 }}>
                            <XAxis type="number" domain={[0.8, 1]} tick={{ fontSize: 10, fill: "#94A3B8" }} tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
                            <YAxis type="category" dataKey="model" tick={{ fontSize: 11, fill: "#94A3B8" }} width={110} />
                            <Tooltip
                                formatter={v => [`${(v * 100).toFixed(2)}%`, "F1"]}
                                contentStyle={{ background: "#1a2235", border: "1px solid #1e2d47", borderRadius: "8px", fontSize: "12px" }}
                            />
                            <Bar dataKey="f1" radius={[0, 4, 4, 0]} onClick={d => setSelected(d.model)} style={{ cursor: "pointer" }}>
                                {modelData.map(m => (
                                    <Cell key={m.model} fill={m.model === selected ? "#3B82F6" : "#1e3a5f"} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px" }}>Click a bar to inspect model</div>
                </div>

                {/* Radar for selected model */}
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.5rem" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Metric Breakdown
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--accent)", marginBottom: "1rem", fontFamily: "var(--font-mono)" }}>
                        {selected}
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                        <RadarChart data={[
                            { metric: "Accuracy", value: sel.accuracy * 100 },
                            { metric: "Precision", value: sel.precision * 100 },
                            { metric: "Recall", value: sel.recall * 100 },
                            { metric: "F1", value: sel.f1 * 100 },
                        ]}>
                            <PolarGrid stroke="#1e2d47" />
                            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                            <Radar dataKey="value" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.25} />
                        </RadarChart>
                    </ResponsiveContainer>
                    {/* Metric Pills */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "8px" }}>
                        {["accuracy", "precision", "recall", "f1"].map(m => (
                            <div key={m} style={{ background: "#0d1424", borderRadius: "8px", padding: "8px 12px", display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "capitalize" }}>{m}</span>
                                <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--normal)", fontWeight: 600 }}>
                                    {(sel[m] * 100).toFixed(2)}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Class Distribution */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.5rem" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "1.25rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Class Distribution — Training Data
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
                    {classData.map(c => {
                        const pct = ((c.value / 20631) * 100).toFixed(1)
                        return (
                            <div key={c.name} style={{ background: "#0d1424", borderRadius: "10px", padding: "1rem 1.25rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                                    <span style={{ fontSize: "13px", fontWeight: 600, color: c.color }}>{c.name}</span>
                                    <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{pct}%</span>
                                </div>
                                <div style={{ height: "6px", background: "var(--border)", borderRadius: "3px", overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${pct}%`, background: c.color, borderRadius: "3px", transition: "width 1s ease" }} />
                                </div>
                                <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", marginTop: "6px" }}>
                                    {c.value.toLocaleString()} samples
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

        </div>
    )
}
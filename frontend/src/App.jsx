import { useState } from "react"
import Sidebar from "./components/Sidebar"
import Dashboard from "./components/Dashboard"
import Predict from "./components/Predict"

export default function App() {
    const [page, setPage] = useState("dashboard")

    return (
        <div style={{ display: "flex", minHeight: "100vh" }}>
            <Sidebar page={page} setPage={setPage} />
            <main style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
                {page === "dashboard" && <Dashboard />}
                {page === "predict" && <Predict />}
            </main>
        </div>
    )
}
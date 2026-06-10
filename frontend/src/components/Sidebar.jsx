export default function Sidebar({ page, setPage }) {
    const links = [
        { id: "dashboard", label: "Dashboard", icon: "▦" },
        { id: "predict", label: "Predict", icon: "⬡" },
    ]

    return (
        <aside style={{
            width: "220px",
            minHeight: "100vh",
            background: "#0d1424",
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            padding: "2rem 0",
            position: "sticky",
            top: 0,
            height: "100vh",
        }}>

            {/* Logo */}
            <div style={{ padding: "0 1.5rem 2rem" }}>
                <div style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: "var(--accent)",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    marginBottom: "4px"
                }}>
                    CNC Monitor
                </div>
                <div style={{
                    fontSize: "15px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    lineHeight: 1.3
                }}>
                    Predictive<br />Maintenance
                </div>
            </div>

            {/* Divider */}
            <div style={{ height: "1px", background: "var(--border)", margin: "0 1.5rem 1.5rem" }} />

            {/* Nav Links */}
            <nav style={{ flex: 1 }}>
                {links.map(link => (
                    <button
                        key={link.id}
                        onClick={() => setPage(link.id)}
                        style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "0.75rem 1.5rem",
                            background: page === link.id ? "rgba(59,130,246,0.12)" : "transparent",
                            border: "none",
                            borderLeft: page === link.id ? "3px solid var(--accent)" : "3px solid transparent",
                            color: page === link.id ? "var(--accent)" : "var(--text-secondary)",
                            fontSize: "14px",
                            fontWeight: page === link.id ? 600 : 400,
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "all 0.15s",
                        }}
                        onMouseEnter={e => {
                            if (page !== link.id) e.currentTarget.style.color = "var(--text-primary)"
                        }}
                        onMouseLeave={e => {
                            if (page !== link.id) e.currentTarget.style.color = "var(--text-secondary)"
                        }}
                    >
                        <span style={{ fontSize: "16px" }}>{link.icon}</span>
                        {link.label}
                    </button>
                ))}
            </nav>

            {/* Footer */}
            <div style={{
                padding: "1.5rem",
                borderTop: "1px solid var(--border)",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "var(--text-muted)",
                lineHeight: 1.6
            }}>
                <div>NASA CMAPSS</div>
                <div>FD001 Dataset</div>
                <div style={{ marginTop: "4px", color: "var(--normal)" }}>● API Connected</div>
            </div>

        </aside>
    )
}
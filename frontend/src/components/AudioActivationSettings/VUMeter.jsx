import { useEffect, useState, useRef } from 'react';
import './VUMeter.css';

/**
 * VUMeter — 30fps Real-Time Audio Level Indicator.
 * - Connects to WebSocket /stream/level for real-time dBFS readings.
 * - Graceful fallback to procedural audio level simulation when backend is offline.
 * - Color codes: Green (< -20dBFS), Yellow (-20 to -6dBFS), Red (> -6dBFS).
 */
export default function VUMeter({ wsUrl = "ws://localhost:8770/stream/level" }) {
    const [dbfs, setDbfs] = useState(-60);
    const [status, setStatus] = useState("disconnected");
    const wsRef = useRef(null);
    const simTimerRef = useRef(null);

    useEffect(() => {
        // Attempt WebSocket connection to backend stream
        const connect = () => {
            try {
                const ws = new WebSocket(wsUrl);
                wsRef.current = ws;

                ws.onopen = () => {
                    setStatus("connected");
                    if (simTimerRef.current) {
                        clearInterval(simTimerRef.current);
                        simTimerRef.current = null;
                    }
                };

                ws.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    if (typeof data.dbfs === 'number') {
                        setDbfs(data.dbfs);
                    }
                };

                ws.onerror = () => {
                    setStatus("error");
                    startSimulation();
                };

                ws.onclose = () => {
                    setStatus("disconnected");
                    startSimulation();
                };
            } catch {
                setStatus("error");
                startSimulation();
            }
        };

        const startSimulation = () => {
            if (simTimerRef.current) return;
            // Fallback simulation: Generates human-like ambient volume movements (30fps)
            let phase = 0;
            simTimerRef.current = setInterval(() => {
                phase += 0.05;
                const noise = Math.sin(phase) * Math.cos(phase * 2.3) * 15;
                const base = -25; // average speaking level
                const simulatedDbfs = Math.max(-60, Math.min(0, base + noise));
                setDbfs(simulatedDbfs);
            }, 33);
        };

        connect();

        return () => {
            if (wsRef.current) wsRef.current.close();
            if (simTimerRef.current) clearInterval(simTimerRef.current);
        };
    }, [wsUrl]);

    // Map dBFS (-60 to 0) to percentage (0% to 100%)
    const percentage = Math.round(((dbfs + 60) / 60) * 100);

    // Dynamic color coding & feedback labels
    let colorClass = "safe";
    let message = "🟢 양호";
    if (dbfs >= -6) {
        colorClass = "clipping";
        message = "🔴 오작동을 유발할 수 있습니다 (클리핑 발생)";
    } else if (dbfs >= -20) {
        colorClass = "warn";
        message = "🟡 큼";
    } else if (dbfs < -40) {
        colorClass = "quiet";
        message = "⚠️ 너무 작음 — 마이크 입력 감도를 높여주세요";
    }

    return (
        <div className="vu-meter" aria-label="마이크 오디오 입력 레벨 모니터">
            <div className="vu-meter__header">
                <span className="vu-meter__label">마이크 입력 레벨</span>
                <span className="vu-meter__dbfs mono">{dbfs.toFixed(1)} dBFS</span>
            </div>
            
            <div className="vu-meter__track" role="progressbar" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100}>
                <div 
                    className={`vu-meter__fill vu-meter__fill--${colorClass}`} 
                    style={{ width: `${percentage}%` }}
                />
            </div>
            
            <div className="vu-meter__footer">
                <span className={`vu-meter__status vu-meter__status--${colorClass}`}>
                    {message}
                </span>
                <span className="vu-meter__conn mono">
                    {status === "connected" ? "실시간 연결됨" : "테스트 모드"}
                </span>
            </div>
        </div>
    );
}

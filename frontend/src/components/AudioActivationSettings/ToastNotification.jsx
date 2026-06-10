import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic } from 'lucide-react';
import './ToastNotification.css';

/**
 * ToastNotification — Non-intrusive 2s pop alert for audio activation triggers.
 */
export default function ToastNotification({ show, message = "호출어가 감지되었습니다", onClose }) {
    useEffect(() => {
        if (!show) return undefined;
        const timer = setTimeout(() => {
            onClose?.();
        }, 2000);
        return () => clearTimeout(timer);
    }, [show, onClose]);

    return (
        <AnimatePresence>
            {show && (
                <motion.div 
                    className="audio-toast"
                    role="status"
                    aria-live="polite"
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                >
                    <div className="audio-toast__content">
                        <span className="audio-toast__icon-badge">
                            <Mic size={14} />
                        </span>
                        <span className="audio-toast__text">{message}</span>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

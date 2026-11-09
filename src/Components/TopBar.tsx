import React from 'react';
import { Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauriApp } from '../services/updateService';

const TopBar: React.FC = () => {
    if (!isTauriApp()) return null;
    const appWindow = getCurrentWindow();

    return (
        <header className="app-top-bar" data-tauri-drag-region>
            <span className="app-top-bar__title" data-tauri-drag-region>AnthroWeb</span>
            <div className="app-top-bar__controls">
                <button
                    type="button"
                    className="app-top-bar__btn"
                    onClick={() => void appWindow.minimize()}
                    aria-label="Minimize"
                >
                    <Minus size={12} />
                </button>
                <button
                    type="button"
                    className="app-top-bar__btn"
                    onClick={() => void appWindow.toggleMaximize()}
                    aria-label="Maximize"
                >
                    <Square size={10} />
                </button>
                <button
                    type="button"
                    className="app-top-bar__btn app-top-bar__btn--close"
                    onClick={() => void appWindow.close()}
                    aria-label="Close"
                >
                    <X size={12} />
                </button>
            </div>
        </header>
    );
};

export default TopBar;
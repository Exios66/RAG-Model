
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect } from 'react';

interface Settings {
    apiKey: string;
    model: string;
    baseUrl: string;
}

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentSettings: Settings;
    onSave: (settings: Settings) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, currentSettings, onSave }) => {
    const [settings, setSettings] = useState<Settings>(currentSettings);

    useEffect(() => {
        setSettings(currentSettings);
    }, [currentSettings, isOpen]);

    const handleChange = (field: keyof Settings, value: string) => {
        setSettings(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(settings);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="bg-gem-slate p-6 rounded-lg shadow-xl w-full max-w-md">
                <h3 id="settings-title" className="text-xl font-bold mb-4 text-gem-offwhite">Settings</h3>
                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label htmlFor="api-key" className="block text-sm font-medium text-gem-offwhite/80 mb-1">
                            API Key <span className="text-xs text-gem-offwhite/50">(Optional if using AI Studio)</span>
                        </label>
                        <input
                            id="api-key"
                            type="password"
                            value={settings.apiKey}
                            onChange={(e) => handleChange('apiKey', e.target.value)}
                            placeholder="Enter custom API Key"
                            className="w-full bg-gem-mist border border-gem-mist/50 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-gem-blue text-gem-offwhite"
                        />
                    </div>

                    <div>
                        <label htmlFor="model-select" className="block text-sm font-medium text-gem-offwhite/80 mb-1">
                            Model
                        </label>
                        <select
                            id="model-select"
                            value={settings.model}
                            onChange={(e) => handleChange('model', e.target.value)}
                            className="w-full bg-gem-mist border border-gem-mist/50 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-gem-blue text-gem-offwhite"
                        >
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</option>
                            <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                            <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                            <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Exp</option>
                        </select>
                    </div>

                    <div>
                        <label htmlFor="base-url" className="block text-sm font-medium text-gem-offwhite/80 mb-1">
                            Base URL <span className="text-xs text-gem-offwhite/50">(e.g., for OpenRouter/Proxies)</span>
                        </label>
                        <input
                            id="base-url"
                            type="text"
                            value={settings.baseUrl}
                            onChange={(e) => handleChange('baseUrl', e.target.value)}
                            placeholder="https://generativelanguage.googleapis.com"
                            className="w-full bg-gem-mist border border-gem-mist/50 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-gem-blue text-gem-offwhite"
                        />
                        <p className="text-xs text-gem-offwhite/60 mt-1">
                            Leave empty for default Google GenAI endpoint. 
                        </p>
                    </div>

                    <div className="flex justify-end space-x-3 mt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-md bg-gem-mist hover:bg-gem-mist/70 transition-colors text-gem-offwhite"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 rounded-md bg-gem-blue hover:bg-blue-500 text-white transition-colors"
                        >
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SettingsModal;

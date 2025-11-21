
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppStatus, ChatMessage, RagStore } from './types';
import * as geminiService from './services/geminiService';
import Spinner from './components/Spinner';
import WelcomeScreen from './components/WelcomeScreen';
import ProgressBar from './components/ProgressBar';
import ChatInterface from './components/ChatInterface';
import SettingsModal from './components/SettingsModal';

declare global {
    interface AIStudio {
        openSelectKey: () => Promise<void>;
        hasSelectedApiKey: () => Promise<boolean>;
    }
    interface Window {
        aistudio?: AIStudio;
    }
}

const STORAGE_KEYS = {
    API_KEY: 'gemini_api_key',
    MODEL: 'gemini_model',
    BASE_URL: 'gemini_base_url',
    RAG_STORES: 'gemini_rag_stores',
    CHAT_HISTORY_PREFIX: 'chat_history_'
};

const App: React.FC = () => {
    const [status, setStatus] = useState<AppStatus>(AppStatus.Initializing);
    const [isStudioKeySelected, setIsStudioKeySelected] = useState(false);
    const [apiKeyError, setApiKeyError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<{ current: number, total: number, message?: string, fileName?: string } | null>(null);
    const [activeRagStoreName, setActiveRagStoreName] = useState<string | null>(null);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [isQueryLoading, setIsQueryLoading] = useState(false);
    const [exampleQuestions, setExampleQuestions] = useState<string[]>([]);
    const [documentName, setDocumentName] = useState<string>('');
    const [files, setFiles] = useState<File[]>([]);
    
    // Saved Stores State
    const [savedStores, setSavedStores] = useState<RagStore[]>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.RAG_STORES);
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    
    // Settings State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settings, setSettings] = useState({
        apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || '',
        model: localStorage.getItem(STORAGE_KEYS.MODEL) || 'gemini-2.5-flash',
        baseUrl: localStorage.getItem(STORAGE_KEYS.BASE_URL) || ''
    });

    // Combined key check: True if studio key is selected OR custom key is provided
    const isKeyReady = isStudioKeySelected || (!!settings.apiKey && settings.apiKey.length > 0);
    
    const checkApiKey = useCallback(async () => {
        if (window.aistudio?.hasSelectedApiKey) {
            try {
                const hasKey = await window.aistudio.hasSelectedApiKey();
                setIsStudioKeySelected(hasKey);
            } catch (e) {
                console.error("Error checking for API key:", e);
                setIsStudioKeySelected(false);
            }
        }
    }, []);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkApiKey();
            }
        };
        
        checkApiKey();
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', checkApiKey);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', checkApiKey);
        };
    }, [checkApiKey]);

    // Removed auto-delete on unload to allow persistence
    // useEffect(() => { ... }, []);

    // Load chat history when active store changes
    useEffect(() => {
        if (activeRagStoreName) {
            const historyKey = `${STORAGE_KEYS.CHAT_HISTORY_PREFIX}${activeRagStoreName}`;
            const savedHistory = localStorage.getItem(historyKey);
            if (savedHistory) {
                try {
                    setChatHistory(JSON.parse(savedHistory));
                } catch (e) {
                    console.error("Failed to parse chat history", e);
                    setChatHistory([]);
                }
            } else {
                setChatHistory([]);
            }
        }
    }, [activeRagStoreName]);

    // Save chat history when it changes
    useEffect(() => {
        if (activeRagStoreName && chatHistory.length > 0) {
            const historyKey = `${STORAGE_KEYS.CHAT_HISTORY_PREFIX}${activeRagStoreName}`;
            localStorage.setItem(historyKey, JSON.stringify(chatHistory));
        }
    }, [chatHistory, activeRagStoreName]);

    const handleError = (message: string, err: any) => {
        console.error(message, err);
        setError(`${message}${err ? `: ${err instanceof Error ? err.message : String(err)}` : ''}`);
        setStatus(AppStatus.Error);
    };

    const clearError = () => {
        setError(null);
        setStatus(AppStatus.Welcome);
    }

    useEffect(() => {
        setStatus(AppStatus.Welcome);
    }, []);

    const handleSelectKey = async () => {
        if (window.aistudio?.openSelectKey) {
            try {
                await window.aistudio.openSelectKey();
                await checkApiKey();
            } catch (err) {
                console.error("Failed to open API key selection dialog", err);
            }
        } else {
            console.log('window.aistudio.openSelectKey() not available.');
            alert('API key selection is not available in this environment.');
        }
    };
    
    const handleSaveSettings = (newSettings: typeof settings) => {
        setSettings(newSettings);
        localStorage.setItem(STORAGE_KEYS.API_KEY, newSettings.apiKey);
        localStorage.setItem(STORAGE_KEYS.MODEL, newSettings.model);
        localStorage.setItem(STORAGE_KEYS.BASE_URL, newSettings.baseUrl);
        
        // Clear error if they provided a key
        if (newSettings.apiKey) {
            setApiKeyError(null);
        }
    };

    const handleUploadAndStartChat = async () => {
        if (!isKeyReady) {
            setApiKeyError("Please select your Gemini API Key or enter one in Settings.");
            throw new Error("API Key is required.");
        }
        if (files.length === 0) return;
        
        setApiKeyError(null);

        try {
            geminiService.initialize(settings.apiKey, settings.model, settings.baseUrl);
        } catch (err) {
            handleError("Initialization failed. Please check your API Key in settings.", err);
            throw err;
        }
        
        setStatus(AppStatus.Uploading);
        const totalSteps = files.length + 2;
        setUploadProgress({ current: 0, total: totalSteps, message: "Creating document index..." });

        try {
            // Generate document display name
            let docName = '';
            if (files.length === 1) {
                docName = files[0].name;
            } else if (files.length === 2) {
                docName = `${files[0].name} & ${files[1].name}`;
            } else {
                docName = `${files.length} documents`;
            }
            // Add timestamp to differentiate duplicates
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const fullDisplayName = `${docName} (${timestamp})`;

            const storeName = `chat-session-${Date.now()}`;
            const ragStoreName = await geminiService.createRagStore(storeName);
            
            setUploadProgress({ current: 1, total: totalSteps, message: "Generating embeddings..." });

            for (let i = 0; i < files.length; i++) {
                setUploadProgress(prev => ({ 
                    ...(prev!),
                    current: i + 1,
                    message: "Generating embeddings...",
                    fileName: `(${i + 1}/${files.length}) ${files[i].name}`
                }));
                await geminiService.uploadToRagStore(ragStoreName, files[i]);
            }
            
            setUploadProgress({ current: files.length + 1, total: totalSteps, message: "Generating suggestions...", fileName: "" });
            const questions = await geminiService.generateExampleQuestions(ragStoreName);
            setExampleQuestions(questions);

            setUploadProgress({ current: totalSteps, total: totalSteps, message: "All set!", fileName: "" });
            
            await new Promise(resolve => setTimeout(resolve, 500));

            setDocumentName(fullDisplayName);
            setActiveRagStoreName(ragStoreName);
            // chatHistory will be cleared/initialized via useEffect because key changes
            
            // Save the new store to the list
            const newStore: RagStore = { name: ragStoreName, displayName: fullDisplayName };
            const updatedStores = [newStore, ...savedStores];
            setSavedStores(updatedStores);
            localStorage.setItem(STORAGE_KEYS.RAG_STORES, JSON.stringify(updatedStores));

            setStatus(AppStatus.Chatting);
            setFiles([]);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
            if (errorMessage.includes('api key not valid') || errorMessage.includes('requested entity was not found')) {
                setApiKeyError("The selected API key is invalid. Please check settings or select a different key.");
                setIsStudioKeySelected(false);
                setStatus(AppStatus.Welcome);
            } else {
                handleError("Failed to start chat session", err);
            }
            throw err;
        } finally {
            setUploadProgress(null);
        }
    };

    const handleSelectStore = (store: RagStore) => {
        if (!isKeyReady) {
            setApiKeyError("Please select your Gemini API Key or enter one in Settings.");
            return;
        }
        
        // Re-init service just in case (e.g. settings changed)
        geminiService.initialize(settings.apiKey, settings.model, settings.baseUrl);
        
        setActiveRagStoreName(store.name);
        setDocumentName(store.displayName);
        // History loads via useEffect
        setStatus(AppStatus.Chatting);
    };

    const handleDeleteStore = async (storeName: string) => {
        if (window.confirm("Are you sure you want to delete this chat history? This cannot be undone.")) {
            // 1. Update UI
            const updatedStores = savedStores.filter(s => s.name !== storeName);
            setSavedStores(updatedStores);
            localStorage.setItem(STORAGE_KEYS.RAG_STORES, JSON.stringify(updatedStores));
            
            // 2. Clear history from LS
            localStorage.removeItem(`${STORAGE_KEYS.CHAT_HISTORY_PREFIX}${storeName}`);
            
            // 3. Delete from Gemini API (optional, but good for hygiene)
            if (isKeyReady) {
                 try {
                    geminiService.initialize(settings.apiKey, settings.model, settings.baseUrl);
                    await geminiService.deleteRagStore(storeName);
                } catch (e) {
                    console.warn("Could not delete remote store, likely already gone or auth error", e);
                }
            }
        }
    };

    const handleBackToHome = () => {
        // We simply reset the view to Welcome, preserving the store data
        setActiveRagStoreName(null);
        setChatHistory([]);
        setExampleQuestions([]);
        setDocumentName('');
        setFiles([]);
        setStatus(AppStatus.Welcome);
    };

    const handleSendMessage = async (message: string) => {
        if (!activeRagStoreName) return;

        const userMessage: ChatMessage = { role: 'user', parts: [{ text: message }] };
        setChatHistory(prev => [...prev, userMessage]);
        setIsQueryLoading(true);

        try {
            const result = await geminiService.fileSearch(activeRagStoreName, message);
            const modelMessage: ChatMessage = {
                role: 'model',
                parts: [{ text: result.text }],
                groundingChunks: result.groundingChunks
            };
            setChatHistory(prev => [...prev, modelMessage]);
        } catch (err) {
            const errorMessage: ChatMessage = {
                role: 'model',
                parts: [{ text: "Sorry, I encountered an error. Please try again." }]
            };
            setChatHistory(prev => [...prev, errorMessage]);
            handleError("Failed to get response", err);
        } finally {
            setIsQueryLoading(false);
        }
    };
    
    const renderContent = () => {
        switch(status) {
            case AppStatus.Initializing:
                return (
                    <div className="flex items-center justify-center h-screen">
                        <Spinner /> <span className="ml-4 text-xl">Initializing...</span>
                    </div>
                );
            case AppStatus.Welcome:
                 return <WelcomeScreen 
                    onUpload={handleUploadAndStartChat} 
                    apiKeyError={apiKeyError} 
                    files={files} 
                    setFiles={setFiles} 
                    isKeyReady={isKeyReady} 
                    onSelectKey={handleSelectKey}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                    savedStores={savedStores}
                    onSelectStore={handleSelectStore}
                    onDeleteStore={handleDeleteStore}
                 />;
            case AppStatus.Uploading:
                let icon = null;
                if (uploadProgress?.message === "Creating document index...") {
                    icon = <img src="https://services.google.com/fh/files/misc/applet-upload.png" alt="Uploading files icon" className="h-80 w-80 rounded-lg object-cover" />;
                } else if (uploadProgress?.message === "Generating embeddings...") {
                    icon = <img src="https://services.google.com/fh/files/misc/applet-creating-embeddings_2.png" alt="Creating embeddings icon" className="h-240 w-240 rounded-lg object-cover" />;
                } else if (uploadProgress?.message === "Generating suggestions...") {
                    icon = <img src="https://services.google.com/fh/files/misc/applet-suggestions_2.png" alt="Generating suggestions icon" className="h-240 w-240 rounded-lg object-cover" />;
                } else if (uploadProgress?.message === "All set!") {
                    icon = <img src="https://services.google.com/fh/files/misc/applet-completion_2.png" alt="Completion icon" className="h-240 w-240 rounded-lg object-cover" />;
                }

                return <ProgressBar 
                    progress={uploadProgress?.current || 0} 
                    total={uploadProgress?.total || 1} 
                    message={uploadProgress?.message || "Preparing your chat..."} 
                    fileName={uploadProgress?.fileName}
                    icon={icon}
                />;
            case AppStatus.Chatting:
                return <ChatInterface 
                    documentName={documentName}
                    history={chatHistory}
                    isQueryLoading={isQueryLoading}
                    onSendMessage={handleSendMessage}
                    onBack={handleBackToHome}
                    exampleQuestions={exampleQuestions}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                />;
            case AppStatus.Error:
                 return (
                    <div className="flex flex-col items-center justify-center h-screen bg-red-900/20 text-red-300">
                        <h1 className="text-3xl font-bold mb-4">Application Error</h1>
                        <p className="max-w-md text-center mb-4">{error}</p>
                        <button onClick={clearError} className="px-4 py-2 rounded-md bg-gem-mist hover:bg-gem-mist/70 transition-colors text-gem-offwhite" title="Return to the welcome screen">
                           Try Again
                        </button>
                    </div>
                );
            default:
                 return <WelcomeScreen 
                    onUpload={handleUploadAndStartChat} 
                    apiKeyError={apiKeyError} 
                    files={files} 
                    setFiles={setFiles} 
                    isKeyReady={isKeyReady} 
                    onSelectKey={handleSelectKey}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                    savedStores={savedStores}
                    onSelectStore={handleSelectStore}
                    onDeleteStore={handleDeleteStore}
                 />;
        }
    }

    return (
        <main className="h-screen bg-gem-onyx text-gem-offwhite">
            {renderContent()}
            <SettingsModal 
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                currentSettings={settings}
                onSave={handleSaveSettings}
            />
        </main>
    );
};

export default App;

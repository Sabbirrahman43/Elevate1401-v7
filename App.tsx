import React, { useState, useEffect } from 'react';
import Onboarding from './components/Onboarding';
import Settings from './components/Settings';
import LiveSession from './components/LiveSession';
import TaskItem from './components/TaskItem';
import FocusMode from './components/FocusMode';
import HistoryView from './components/HistoryView';
import ConfirmationModal from './components/ConfirmationModal';
import BackgroundEffects from './components/BackgroundEffects';
import RewardModal from './components/RewardModal';
import Dashboard from './components/Dashboard';
import AuthScreen from './components/AuthScreen';

import { UserProfile, AIConfig, Theme, ChatMessage, Task, DayLog, TaskType } from './types';
import { getThemeColors, isDarkTheme } from './utils/helpers';
import { runEvaluator, formatTime, calculateLevel } from './utils/tracker';
import { getRandomQuote } from './utils/quotes';
import { Mic, Send, Settings2, Calendar, Clock, Hash, Volume2, VolumeX, Trophy } from 'lucide-react';

// Services
import { storageService } from './services/storage';
import { aiService } from './services/ai';
import { authService } from './services/auth';

const DEFAULT_AI_CONFIG: AIConfig = {
  name: 'Coach',
  gender: 'Male',
  voice: 'Deep',
  roles: ['Coach', 'Strategist'],
  behaviors: ['Straightforward', 'Focus-driven']
};

export default function App() {
  // --- AUTH STATE ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // --- APP STATE ---
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [aiConfig, setAiConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
  const [theme, setTheme] = useState<Theme>('Focus');
  
  // Tracker State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [history, setHistory] = useState<DayLog[]>([]);
  
  // UI State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLiveOpen, setIsLiveOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeTaskForFocus, setActiveTaskForFocus] = useState<Task | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Rewards & Modals
  const [rewardState, setRewardState] = useState<{isOpen: boolean; streak: number; quote: string}>({ isOpen: false, streak: 0, quote: '' });
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, message: '', onConfirm: () => {} });
  
  // Voice & Chat State
  const [isAutoSpeechEnabled, setIsAutoSpeechEnabled] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Task Creation State
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskTarget, setNewTaskTarget] = useState(1);
  const [newTaskType, setNewTaskType] = useState<TaskType>('count');

  // --- INITIALIZATION ---
  useEffect(() => {
    // Check Auth First
    const isAuth = authService.isAuthenticated();
    setIsAuthenticated(isAuth);

    if (isAuth) {
        initAppData();
    }
  }, []);

  const initAppData = () => {
    const user = storageService.getUser();
    if (user) setUserProfile(user);

    const ai = storageService.getAIConfig();
    if (ai) setAiConfig(ai);
    
    setTheme(storageService.getTheme());
    setIsAutoSpeechEnabled(storageService.getAutoSpeech());
    
    const loadedTasks = storageService.getTasks();
    setTasks(loadedTasks);
    
    const loadedHistory = storageService.getHistory();
    setHistory(loadedHistory);
    
    // Load persisted messages
    const loadedMessages = storageService.getMessages();
    setMessages(loadedMessages);

    // Initial Welcome (only if no messages exist)
    if (user && loadedMessages.length === 0) {
       setMessages([{
        id: 'init',
        role: 'model',
        text: "Tracker active. Engine ready. How are we executing today?",
        timestamp: Date.now()
      }]);
    }

    const lastDate = storageService.getLastActiveDate();
    const todayStr = new Date().toISOString().split('T')[0];

    if (lastDate && lastDate !== todayStr) {
      const hasProgress = loadedTasks.some(t => t.current > 0);
      
      if (hasProgress) {
        const metrics = runEvaluator(loadedTasks, loadedHistory);
        const log: DayLog = {
          date: lastDate, 
          tasks: JSON.parse(JSON.stringify(loadedTasks)),
          stats: {
             completionRate: metrics.completionRate,
             totalFocusTimeMs: 0
          }
        };

        const newHist = [...loadedHistory, log];
        setHistory(newHist);
        storageService.saveHistory(newHist);
      }

      const resetTasks = loadedTasks.map(t => ({...t, current: 0, sessions: [], updatedAt: Date.now()}));
      setTasks(resetTasks);
      storageService.saveTasks(resetTasks);
      
      storageService.setLastActiveDate(todayStr);
      
      const dayMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'system',
        text: `New day detected. Previous data from ${lastDate} has been archived.`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, dayMsg]);
    } else if (!lastDate) {
      storageService.setLastActiveDate(todayStr);
    }
  };

  const handleAuthSuccess = () => {
    setIsAuthenticated(true);
    initAppData();
  };

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) setAvailableVoices(voices);
    };
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // --- PERSISTENCE ---
  useEffect(() => {
    if (userProfile) storageService.saveUser(userProfile);
  }, [userProfile]);

  useEffect(() => {
    storageService.saveAIConfig(aiConfig);
  }, [aiConfig]);

  useEffect(() => {
    storageService.saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    storageService.saveTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    storageService.saveHistory(history);
  }, [history]);

  useEffect(() => {
    storageService.saveAutoSpeech(isAutoSpeechEnabled);
  }, [isAutoSpeechEnabled]);

  // Persist messages whenever they change
  useEffect(() => {
    if (messages.length > 0) storageService.saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getWeeklyProgress = () => {
    if (history.length === 0) return 0;
    const recent = history.slice(-7);
    const sum = recent.reduce((acc, curr) => acc + curr.stats.completionRate, 0);
    return Math.round(sum / recent.length);
  };

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    const configVoice = aiConfig.voice.toLowerCase();
    const isFemale = configVoice.includes('female');
    let chosenVoice = availableVoices.find(v => {
      const name = v.name.toLowerCase();
      if (isFemale) return name.includes('female') || name.includes('samantha') || name.includes('google us english');
      return name.includes('male') || name.includes('daniel') || name.includes('google uk english male');
    });

    if (!chosenVoice) chosenVoice = availableVoices.find(v => v.lang.startsWith('en')) || availableVoices[0];
    if (chosenVoice) utterance.voice = chosenVoice;
    
    if (configVoice.includes('cute')) { utterance.pitch = 1.2; utterance.rate = 1.1; }
    else if (configVoice.includes('deep')) { utterance.pitch = 0.8; }
    
    window.speechSynthesis.speak(utterance);
  };

  const addTask = () => {
    if (!newTaskTitle.trim()) return;
    const newTask: Task = {
      id: Date.now().toString(),
      title: newTaskTitle,
      category: 'General',
      type: newTaskType,
      target: newTaskTarget,
      unit: newTaskType === 'duration' ? 'min' : 'reps',
      current: 0,
      sessions: [],
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setTasks(prev => [...prev, newTask]);
    setNewTaskTitle('');
    if (userProfile) setUserProfile({ ...userProfile, xp: (userProfile.xp || 0) + 10 });
  };

  const updateTask = (updatedTask: Task) => {
    const oldTask = tasks.find(t => t.id === updatedTask.id);
    const completedNow = oldTask && oldTask.current < oldTask.target && updatedTask.current >= updatedTask.target;
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    if (completedNow && userProfile) setUserProfile({ ...userProfile, xp: (userProfile.xp || 0) + 50 });
  };

  const deleteTask = (id: string) => {
    setConfirmConfig({
      isOpen: true,
      message: "Permanently delete this tracker? All session history for this goal will be lost.",
      onConfirm: () => setTasks(prev => prev.filter(t => t.id !== id))
    });
  };

  const endDay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setConfirmConfig({
      isOpen: true,
      message: "Conclude the day? This will archive today's stats to history and reset all counters to zero for tomorrow.",
      onConfirm: performEndDay
    });
  };

  const performEndDay = () => {
    const metrics = runEvaluator(tasks, history, userProfile || undefined);
    const todayStr = new Date().toISOString().split('T')[0];
    
    let bonusXp = 0;
    if (metrics.completionRate >= 80) bonusXp = 100;
    else if (metrics.completionRate >= 50) bonusXp = 50;

    const log: DayLog = {
      date: todayStr,
      tasks: JSON.parse(JSON.stringify(tasks)), 
      stats: {
        completionRate: metrics.completionRate,
        totalFocusTimeMs: 0
      }
    };
    
    const newHistory = [...history, log];
    setHistory(newHistory);
    
    const resetTasks = tasks.map(t => ({...t, current: 0, sessions: [], updatedAt: Date.now()}));
    setTasks(resetTasks);
    
    if (userProfile) setUserProfile({ ...userProfile, xp: (userProfile.xp || 0) + bonusXp });

    const endMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'model',
      text: `Day archived. You gained ${bonusXp} XP. Summary: ${metrics.summary}`,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, endMsg]);

    if (metrics.streak > 0) {
      setRewardState({
        isOpen: true,
        streak: metrics.streak,
        quote: getRandomQuote()
      });
    }
  };

  const handleFocusSessionEnd = (durationMs: number) => {
    if (activeTaskForFocus) {
      const durationMin = Math.round(durationMs / 60000);
      let newCurrent = activeTaskForFocus.current;
      if (activeTaskForFocus.type === 'duration') newCurrent += durationMin;

      const currentSessions = Array.isArray(activeTaskForFocus.sessions) ? activeTaskForFocus.sessions : [];
      const updated = {
        ...activeTaskForFocus,
        current: newCurrent,
        sessions: [...currentSessions, { startTs: Date.now() - durationMs, endTs: Date.now(), durationMs }]
      };
      updateTask(updated);
      
      if (userProfile && durationMin > 0) {
        setUserProfile({ ...userProfile, xp: (userProfile.xp || 0) + (durationMin * 2) });
      }
      setActiveTaskForFocus(null);
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !userProfile) return;

    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: inputText,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, newMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const metrics = runEvaluator(tasks, history, userProfile);
      
      // Use the AI Service abstraction
      const text = await aiService.generateResponse(newMsg.text, {
        user: userProfile,
        config: aiConfig,
        theme,
        metrics
      });

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, botMsg]);
      if (isAutoSpeechEnabled) speakText(text);

    } catch (error: any) {
      const metrics = runEvaluator(tasks, history, userProfile);
      const errorDetail = error.message || "Unknown Error";
      
      let friendlyError = "AI Unavailable.";
      if (errorDetail.includes("API Key")) friendlyError = "API Key Invalid or Missing.";
      if (errorDetail.includes("fetch")) friendlyError = "Network Error - Check Connection.";
      
      const errorMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'model',
        text: `[SYSTEM ALERT]: ${friendlyError}\n\nTechnical: ${errorDetail}\n\nEvaluator Status: ${metrics.summary}`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!isAuthenticated) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  if (!userProfile?.onboarded) {
    return <Onboarding onComplete={(p) => setUserProfile(p)} />;
  }

  const themeColors = getThemeColors(theme);
  const darkClass = isDarkTheme(theme) ? 'dark' : '';
  const evaluatorMetrics = runEvaluator(tasks, history, userProfile);
  const weeklyRate = getWeeklyProgress();
  const { level, progress: levelProgress } = calculateLevel(userProfile.xp || 0);

  return (
    <div className={`h-[100dvh] w-full flex flex-col overflow-hidden transition-colors duration-500 ease-in-out ${themeColors} ${darkClass} relative`}>
      
      <BackgroundEffects theme={theme} />

      <ConfirmationModal 
        isOpen={confirmConfig.isOpen}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />

      <RewardModal 
        isOpen={rewardState.isOpen}
        streak={rewardState.streak}
        quote={rewardState.quote}
        onClose={() => setRewardState(prev => ({ ...prev, isOpen: false }))}
      />
      
      {activeTaskForFocus && (
        <FocusMode task={activeTaskForFocus} onClose={handleFocusSessionEnd} />
      )}

      {isHistoryOpen && (
        <HistoryView history={history} onClose={() => setIsHistoryOpen(false)} />
      )}

      {isSettingsOpen && (
        <Settings 
          config={aiConfig} setConfig={setAiConfig} 
          theme={theme} setTheme={setTheme}
          userProfile={userProfile} setUserProfile={setUserProfile}
          onClose={() => setIsSettingsOpen(false)} 
        />
      )}

      <LiveSession 
        isOpen={isLiveOpen} onClose={() => setIsLiveOpen(false)}
        userProfile={userProfile} aiConfig={aiConfig} theme={theme} metrics={evaluatorMetrics}
      />

      {/* HEADER */}
      <header className="flex-none p-4 flex justify-between items-center bg-inherit z-20 border-b border-black/5 dark:border-white/5 backdrop-blur-md">
        <div className="flex items-center gap-3">
           {/* LOGO - Relative path for GitHub Pages compatibility */}
           <img src="./logo.png" alt="Elevate" className="w-10 h-10 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
           <div>
              <h1 className="font-bold tracking-widest uppercase text-lg leading-none">Elevate1401</h1>
              <div className="flex gap-2 text-xs opacity-60 font-mono items-center mt-0.5">
                  <span>{currentTime.toLocaleDateString()}</span>
                  <span>•</span>
                  <span>{formatTime(currentTime)}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="text-[10px] font-bold bg-indigo-600 text-white px-1.5 rounded flex items-center gap-1">
                    <Trophy size={8} /> LVL {level}
                </div>
                <div className="w-16 h-1 bg-gray-200/20 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${levelProgress}%` }}></div>
                </div>
              </div>
           </div>
        </div>
        <div className="flex gap-2">
           <button onClick={() => setIsHistoryOpen(true)} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10">
            <Calendar className="w-5 h-5" />
          </button>
           <button onClick={() => setIsLiveOpen(true)} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10">
            <Mic className="w-5 h-5" />
          </button>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10">
            <Settings2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-48 max-w-4xl mx-auto w-full space-y-6 z-10">
        
        <Dashboard 
          metrics={evaluatorMetrics} 
          weeklyRate={weeklyRate} 
          userXP={userProfile.xp || 0} 
          activeTaskCount={tasks.length}
          onEndDay={endDay}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks.map(task => (
                <TaskItem 
                    key={task.id} 
                    task={task} 
                    onUpdate={updateTask} 
                    onDelete={deleteTask}
                    onStartSession={(t) => setActiveTaskForFocus(t)}
                />
            ))}
            
            <div className="bg-white/5 p-4 rounded-xl border border-white/10 border-dashed hover:border-solid hover:border-indigo-500/50 transition-all flex flex-col justify-center gap-3 min-h-[140px]">
                 <div className="flex gap-2 items-center">
                    <input 
                        className="flex-1 bg-transparent outline-none placeholder-gray-500 text-sm font-medium" 
                        placeholder="Add New Goal..." 
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addTask()}
                    />
                 </div>
                 <div className="flex gap-2 items-center">
                    <div className="flex bg-black/10 dark:bg-white/5 rounded-lg p-0.5">
                        <button onClick={() => setNewTaskType('count')} className={`p-1.5 rounded ${newTaskType === 'count' ? 'bg-white/10 shadow-sm' : 'opacity-50'}`}><Hash size={14} /></button>
                        <button onClick={() => setNewTaskType('duration')} className={`p-1.5 rounded ${newTaskType === 'duration' ? 'bg-white/10 shadow-sm' : 'opacity-50'}`}><Clock size={14} /></button>
                    </div>
                    <input 
                        type="number" 
                        className="w-16 bg-transparent border-b border-gray-500 outline-none text-center text-sm" 
                        value={newTaskTarget}
                        min={1}
                        onChange={(e) => setNewTaskTarget(parseInt(e.target.value))}
                    />
                    <button onClick={addTask} className="ml-auto px-3 py-1.5 bg-indigo-600 rounded-lg text-white hover:bg-indigo-700 text-xs font-bold">
                        ADD
                    </button>
                 </div>
            </div>
        </div>

        {tasks.length === 0 && (
            <div className="text-center opacity-50 py-10">
                <p>No active trackers.</p>
                <p className="text-sm">Add a goal to activate the engine.</p>
            </div>
        )}
      </main>

      {/* CHAT OVERLAY */}
      <div className={`absolute bottom-0 left-0 right-0 bg-inherit border-t border-black/10 dark:border-white/10 shadow-[0_-5px_30px_rgba(0,0,0,0.3)] transition-[height] duration-300 ease-out z-40 flex flex-col ${showChat ? 'h-[60vh]' : 'h-24 pb-4'}`}>
          <div onClick={() => setShowChat(!showChat)} className="flex-none w-full h-10 flex justify-center items-center cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 touch-manipulation">
              <div className="w-12 h-1.5 bg-gray-400/50 rounded-full" />
          </div>

          <div className="flex-1 flex flex-col min-h-0">
              <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${!showChat ? 'hidden' : ''}`}>
                  <div className="flex justify-end mb-2">
                    <button onClick={() => setIsAutoSpeechEnabled(!isAutoSpeechEnabled)} className={`text-xs flex items-center gap-1 px-2 py-1 rounded-full border ${isAutoSpeechEnabled ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-400 text-gray-500'}`}>
                      {isAutoSpeechEnabled ? <Volume2 size={12}/> : <VolumeX size={12}/>} Auto-Speech
                    </button>
                  </div>
                  {messages.map(msg => (
                      <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
                          <div className={`max-w-[85%] p-3 rounded-xl text-sm relative ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-zinc-800'}`}>
                              {msg.text}
                              {msg.role === 'model' && (
                                <button onClick={() => speakText(msg.text)} className="absolute -right-8 top-2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-black/10 rounded-full transition-all text-gray-500">
                                  <Volume2 size={14} />
                                </button>
                              )}
                          </div>
                      </div>
                  ))}
                  {isTyping && <div className="text-xs opacity-50 ml-4">Evaluating...</div>}
              </div>

              <div className="flex-none p-4 pt-0 border-t border-transparent flex gap-2 bg-inherit">
                 <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    onFocus={() => setShowChat(true)}
                    placeholder={`Speak to ${aiConfig.name}...`}
                    className="flex-1 bg-black/5 dark:bg-white/10 p-3 rounded-xl outline-none"
                  />
                  <button onClick={handleSendMessage} className="p-3 bg-indigo-600 text-white rounded-xl flex-none">
                    <Send className="w-5 h-5" />
                  </button>
              </div>
          </div>
      </div>
    </div>
  );
}
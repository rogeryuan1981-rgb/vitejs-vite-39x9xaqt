import React, { useState, useEffect, useRef } from 'react';
import { Howl, Howler } from 'howler';
import { db, storage } from './firebaseConfig'; 
import { collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

const bgmOptions = [
  { id: 'bgm1', name: '音軌 I：無名之霧', src: 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_510b642674.mp3' },
  { id: 'bgm2', name: '音軌 II：深海脈動', src: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_13876d2035.mp3' },
  { id: 'bgm3', name: '音軌 III：遠古耳語', src: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_55a2988189.mp3' },
  { id: 'bgm4', name: '音軌 IV：溶洞滴水', src: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_627043815e.mp3' },
  { id: 'bgm5', name: '音軌 V：混沌祭祀', src: 'https://cdn.pixabay.com/download/audio/2024/02/14/audio_3498b8c2e1.mp3' },
];

export default function App() {
  const [theme, setTheme] = useState('theme-relic');
  const [activeBgm, setActiveBgm] = useState(bgmOptions[0]);
  const [bgmVolume, setBgmVolume] = useState(0.2);
  const [isUnlocked, setIsUnlocked] = useState(false);
  
  const bgmRef = useRef(null);
  const voiceRef = useRef(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [dbStatus, setDbStatus] = useState('連線中...');
  const [scenarios, setScenarios] = useState([]);
  const [activeScenario, setActiveScenario] = useState('');
  const [activeDeckType, setActiveDeckType] = useState('調查牌組');
  const [searchId, setSearchId] = useState('');
  const [currentCard, setCurrentCard] = useState(null);
  const [cardList, setCardList] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);

  useEffect(() => {
    const initApp = async () => {
      try {
        await getDocs(collection(db, "system_check"));
        setDbStatus('連線成功');
        await refreshScenarios();
      } catch (error) {
        setDbStatus('連線失敗');
      }
    };
    initApp();
  }, []);

  const refreshScenarios = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "cards"));
      const names = new Set();
      querySnapshot.forEach(doc => names.add(doc.data().scenario));
      const list = Array.from(names);
      setScenarios(list);
      if (list.length > 0 && !activeScenario) setActiveScenario(list[0]);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (activeScenario) fetchFilteredCards();
  }, [activeScenario, activeDeckType]);

  const fetchFilteredCards = async () => {
    setIsSearching(true);
    try {
      const q = query(collection(db, "cards"), where("scenario", "==", activeScenario), where("deckType", "==", activeDeckType));
      const snap = await getDocs(q);
      const items = [];
      snap.forEach(d => items.push(d.data()));
      setCardList(items);
    } finally { setIsSearching(false); }
  };

  const startRitual = () => {
    // 關鍵：啟動 Howler 內部的解鎖機制
    Howler.unload(); 
    setIsUnlocked(true);
    initBgm();
  };

  const initBgm = () => {
    if (bgmRef.current) {
      bgmRef.current.stop();
      bgmRef.current.unload();
    }
    bgmRef.current = new Howl({
      src: [activeBgm.src],
      loop: true,
      volume: bgmVolume,
      html5: true, // BGM 通常較大，使用 HTML5 節省記憶體
      onplayerror: function() {
        bgmRef.current.once('unlock', function() { bgmRef.current.play(); });
      }
    });
    bgmRef.current.play();
  };

  useEffect(() => {
    if (isUnlocked) initBgm();
  }, [activeBgm]);

  useEffect(() => {
    if (bgmRef.current) bgmRef.current.volume(bgmVolume);
  }, [bgmVolume]);

  const playVoice = (url) => {
    if (!isUnlocked) return;
    if (voiceRef.current) { voiceRef.current.stop(); voiceRef.current.unload(); }

    setIsVoicePlaying(true);
    
    // 💡 增加 Cache Buster 以防止瀏覽器記住舊的 CORS 失敗
    const finalUrl = `${url}${url.includes('?') ? '&' : '?'}nocache=${Date.now()}`;

    voiceRef.current = new Howl({
      src: [finalUrl],
      html5: true, // 重要：Firebase 導覽音檔必開此項
      format: ['mp3', 'wav', 'm4a', 'aac'],
      onend: () => setIsVoicePlaying(false),
      onstop: () => setIsVoicePlaying(false),
      onloaderror: (id, msg) => { 
        console.error("載入失敗代碼:", msg); 
        setIsVoicePlaying(false);
        // 如果 HTML5 載入失敗，嘗試 Web Audio 模式 (有時能解 CORS)
        if (msg === 4) {
          alert("正在重啟深度傳輸協議...");
          retryVoiceWebAudio(finalUrl);
        }
      }
    });
    voiceRef.current.play();
  };

  // 深度備援播放器
  const retryVoiceWebAudio = (url) => {
    voiceRef.current = new Howl({
      src: [url],
      html5: false,
      onend: () => setIsVoicePlaying(false),
      onstop: () => setIsVoicePlaying(false),
      onloaderror: () => alert("深淵連結徹底中斷。請確認您的網路環境或 Firebase Rules。")
    });
    voiceRef.current.play();
  };

  return (
    <div className={`w-screen h-screen flex flex-col ${theme} overflow-hidden`}>
      {!isUnlocked && (
        <div className="fixed inset-0 z-[100] bg-black bg-opacity-95 flex flex-col items-center justify-center p-6">
          <div className="border border-[var(--text-highlight)] p-10 text-center animate-pulse">
            <h1 className="text-3xl font-bold text-[var(--text-highlight)] mb-6 tracking-[0.5em]">檢索終端啟動</h1>
            <button onClick={startRitual} className="px-12 py-5 bg-[var(--text-highlight)] text-black font-black hover:scale-110 transition-transform cursor-pointer">
              奉獻並連結
            </button>
          </div>
        </div>
      )}

      <header className="flex justify-between items-center p-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)]">
        <div className="text-xl font-bold cursor-pointer text-[var(--text-highlight)]" onClick={() => {
          const p = prompt("密語："); if (p === 'phnglui') setIsAdmin(true);
        }}>
          👁️ 禁忌檔案庫 {isAdmin && " [ADMIN]"}
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-[var(--bg-primary)] px-3 py-1 border border-[var(--border-color)] text-[10px]">
            <span>BGM</span>
            <select className="bg-transparent outline-none" value={activeBgm.id} onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}>
              {bgmOptions.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input type="range" min="0" max="1" step="0.1" value={bgmVolume} onChange={(e) => setBgmVolume(parseFloat(e.target.value))} className="w-12 h-1" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex p-6 gap-6 overflow-hidden">
        <div className="w-56 flex flex-col gap-6 border-r border-[var(--border-color)] pr-4 overflow-y-auto">
          <section>
            <p className="text-[var(--text-highlight)] text-[10px] mb-3 opacity-50 uppercase tracking-widest">Scenario</p>
            <div className="flex flex-col gap-2">
              {scenarios.map(s => (
                <button key={s} onClick={() => setActiveScenario(s)} className={`p-3 text-[11px] text-left border transition ${activeScenario === s ? 'bg-[var(--text-highlight)] text-black border-[var(--text-highlight)] font-bold' : 'border-[var(--border-color)] opacity-60'}`}>
                  {s}
                </button>
              ))}
            </div>
          </section>
          <section>
            <p className="text-[var(--text-highlight)] text-[10px] mb-3 opacity-50 uppercase tracking-widest">Deck</p>
            <div className="flex flex-col gap-2">
              {['核心卡牌', '討論牌組', '調查牌組'].map(d => (
                <button key={d} onClick={() => setActiveDeckType(d)} className={`p-3 text-[11px] text-left border transition ${activeDeckType === d ? 'border-[var(--text-highlight)] text-[var(--text-highlight)]' : 'border-[var(--border-color)] opacity-40'}`}>
                  {d}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <form onSubmit={(e) => { e.preventDefault(); const id = searchId.trim().toUpperCase(); if(id) {
             getDoc(doc(db, "cards", id)).then(ds => { if(ds.exists()) { setCurrentCard(ds.data()); playVoice(ds.data().audioUrl); } else alert("檢索失敗"); });
          }}} className="flex gap-2">
            <input 
              type="text" placeholder="編號輸入..." 
              className="flex-1 p-4 bg-[var(--bg-panel)] border border-[var(--border-color)] text-xl outline-none"
              value={searchId} onChange={(e) => setSearchId(e.target.value)}
            />
            <button type="submit" className="px-8 bg-[var(--text-highlight)] text-black font-bold uppercase">Seek</button>
          </form>

          <div className="flex-1 border border-[var(--border-color)] p-8 flex flex-col items-center justify-center relative bg-[var(--bg-panel)] bg-opacity-20 overflow-y-auto">
            {isSearching ? (
              <div className="animate-pulse">正在讀取...</div>
            ) : currentCard ? (
              <div className="text-center w-full animate-fadeIn">
                <span className="text-[var(--text-highlight)] text-[10px] tracking-widest uppercase opacity-40">{currentCard.scenario} / {currentCard.deckType}</span>
                <h2 className="text-[12rem] font-black leading-none my-8 tracking-tighter shadow-orange-900 drop-shadow-2xl">{currentCard.id}</h2>
                <button 
                  onClick={() => playVoice(currentCard.audioUrl)}
                  className={`w-32 h-32 rounded-full border-2 flex items-center justify-center text-5xl transition-all ${isVoicePlaying ? 'border-[var(--text-highlight)] text-[var(--text-highlight)] animate-pulse' : 'border-[var(--text-primary)] hover:border-[var(--text-highlight)] hover:scale-105'}`}
                >
                  {isVoicePlaying ? '🔊' : '▶'}
                </button>
                <button onClick={() => setCurrentCard(null)} className="block mt-10 text-[10px] opacity-30 hover:underline mx-auto">DISMISS</button>
              </div>
            ) : (
              <div className="w-full h-full">
                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
                  {cardList.map(card => (
                    <button 
                      key={card.id} 
                      onClick={() => { setCurrentCard(card); playVoice(card.audioUrl); }}
                      className="aspect-square border border-[var(--border-color)] bg-[var(--bg-panel)] flex items-center justify-center text-2xl font-bold hover:border-[var(--text-highlight)] transition"
                    >
                      {card.id}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

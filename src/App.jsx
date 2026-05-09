import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebaseConfig'; 
import { collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";

const bgmOptions = [
  { id: 'bgm1', name: '音軌 I：無名之霧', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' }, // 換成極度穩定的測試源
  { id: 'bgm2', name: '音軌 II：深海脈動', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'bgm3', name: '音軌 III：遠古耳語', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
];

export default function App() {
  const [theme, setTheme] = useState('theme-relic');
  const [activeBgm, setActiveBgm] = useState(bgmOptions[0]);
  const [bgmVolume, setBgmVolume] = useState(0.2);
  const [isUnlocked, setIsUnlocked] = useState(false);
  
  const bgmAudio = useRef(new Audio());
  const voiceAudio = useRef(new Audio());

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
    setIsUnlocked(true);
    playBgm();
  };

  const playBgm = () => {
    if (!activeBgm.src) return;
    bgmAudio.current.src = activeBgm.src;
    bgmAudio.current.loop = true;
    bgmAudio.current.volume = bgmVolume;
    bgmAudio.current.play().catch(e => console.log("BGM 啟動受阻:", e));
  };

  useEffect(() => {
    if (isUnlocked) playBgm();
  }, [activeBgm, isUnlocked]);

  useEffect(() => {
    bgmAudio.current.volume = bgmVolume;
  }, [bgmVolume]);

  const playVoice = (url) => {
    if (!isUnlocked) return;
    voiceAudio.current.pause();
    setIsVoicePlaying(true);
    
    // 強制跨域屬性並加上 Cache Buster
    voiceAudio.current.crossOrigin = "anonymous";
    const finalUrl = `${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}`;
    voiceAudio.current.src = finalUrl;
    
    voiceAudio.current.play()
      .then(() => console.log("播放成功"))
      .catch(e => {
        console.error("播放失敗:", e);
        setIsVoicePlaying(false);
        alert("音訊連結失敗。請確認：\n1. Firebase Rules 是否已發佈為 allow read: if true\n2. 是否已執行 gsutil cors 指令");
      });

    voiceAudio.current.onended = () => setIsVoicePlaying(false);
  };

  return (
    <div className={`w-screen h-screen flex flex-col ${theme} overflow-hidden font-sans`}>
      {!isUnlocked && (
        <div className="fixed inset-0 z-[100] bg-black bg-opacity-95 flex flex-col items-center justify-center p-6 text-center">
          <div className="border border-[var(--text-highlight)] p-12">
            <h1 className="text-4xl font-black text-[var(--text-highlight)] mb-8 tracking-[0.5em]">終端機解鎖</h1>
            <button onClick={startRitual} className="px-12 py-5 bg-[var(--text-highlight)] text-black font-black hover:scale-105 active:scale-95 transition-all">
              進入檔案庫
            </button>
          </div>
        </div>
      )}

      <header className="flex justify-between items-center p-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)] z-20">
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
          <div className="flex gap-2">
            <input 
              type="text" placeholder="輸入編號..." 
              className="flex-1 p-4 bg-[var(--bg-panel)] border border-[var(--border-color)] text-xl outline-none"
              value={searchId} onChange={(e) => setSearchId(e.target.value)}
            />
            <button onClick={() => {
              const id = searchId.trim().toUpperCase();
              if(id) {
                getDoc(doc(db, "cards", id)).then(ds => {
                  if(ds.exists()) { setCurrentCard(ds.data()); playVoice(ds.data().audioUrl); }
                  else alert("檢索編號不存在");
                });
              }
            }} className="px-8 bg-[var(--text-highlight)] text-black font-bold uppercase">Seek</button>
          </div>

          <div className="flex-1 border border-[var(--border-color)] p-8 flex flex-col items-center justify-center relative bg-[var(--bg-panel)] bg-opacity-20 overflow-y-auto">
            {isSearching ? (
              <div className="animate-pulse">正在讀取...</div>
            ) : currentCard ? (
              <div className="text-center w-full animate-fadeIn">
                <span className="text-[var(--text-highlight)] text-[10px] tracking-widest uppercase opacity-40">{currentCard.scenario} / {currentCard.deckType}</span>
                <h2 className="text-[10rem] font-black leading-none my-8 tracking-tighter">{currentCard.id}</h2>
                <button 
                  onClick={() => playVoice(currentCard.audioUrl)}
                  className={`w-32 h-32 rounded-full border-2 flex items-center justify-center text-5xl transition-all ${isVoicePlaying ? 'border-[var(--text-highlight)] text-[var(--text-highlight)] animate-pulse' : 'border-[var(--text-primary)]'}`}
                >
                  {isVoicePlaying ? '🔊' : '▶'}
                </button>
                <button onClick={() => { voiceAudio.current.pause(); setCurrentCard(null); }} className="block mt-10 text-[10px] opacity-30 hover:underline mx-auto">DISMISS</button>
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

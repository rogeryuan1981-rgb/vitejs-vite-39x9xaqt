import React, { useState, useEffect, useRef } from 'react';
import { Howl, Howler } from 'howler';
import { db, storage } from './firebaseConfig'; 
import { collection, getDocs, doc, getDoc, query, where, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

const bgmOptions = [
  { id: 'bgm1', name: '音軌 I：無名之霧', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 'bgm2', name: '音軌 II：深海脈動', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'bgm3', name: '音軌 III：遠古耳語', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
];

export default function App() {
  const [theme, setTheme] = useState('theme-relic');
  const [activeBgm, setActiveBgm] = useState(bgmOptions[0]);
  const [bgmVolume, setBgmVolume] = useState(0); // 預設音量設為 0
  const [isUnlocked, setIsUnlocked] = useState(false);
  
  const bgmRef = useRef(null);
  const voiceRef = useRef(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [dbStatus, setDbStatus] = useState('連線中...');
  
  const [scenarios, setScenarios] = useState([]); 
  const [availableDecks, setAvailableDecks] = useState([]); 
  
  const [activeScenario, setActiveScenario] = useState('');
  const [activeDeckType, setActiveDeckType] = useState('');
  
  const [searchId, setSearchId] = useState('');
  const [currentCard, setCurrentCard] = useState(null);
  const [cardList, setCardList] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);

  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentUploadingFile, setCurrentUploadingFile] = useState('');

  // 初始化連線
  useEffect(() => {
    const initApp = async () => {
      try {
        await getDocs(collection(db, "system_check"));
        setDbStatus('連線成功');
        await fetchScenarios();
      } catch (error) {
        setDbStatus('連線失敗');
      }
    };
    initApp();
  }, []);

  const fetchScenarios = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "cards"));
      const scenarioSet = new Set();
      querySnapshot.forEach(doc => {
        const data = doc.data();
        if (data.scenario) scenarioSet.add(data.scenario);
      });
      const sList = Array.from(scenarioSet).sort();
      setScenarios(sList);
      if (sList.length > 0 && !activeScenario) setActiveScenario(sList[0]);
    } catch (e) { console.error(e); }
  };

  // 劇本連動分類
  useEffect(() => {
    if (activeScenario) {
      fetchDecksForScenario(activeScenario);
    }
  }, [activeScenario]);

  const fetchDecksForScenario = async (scenarioName) => {
    try {
      const q = query(collection(db, "cards"), where("scenario", "==", scenarioName));
      const snap = await getDocs(q);
      const deckSet = new Set();
      snap.forEach(d => {
        const data = d.data();
        if (data.deckType) deckSet.add(data.deckType);
      });
      const dList = Array.from(deckSet).sort();
      setAvailableDecks(dList);
      
      if (dList.length > 0) {
        setActiveDeckType(dList[0]);
      } else {
        setActiveDeckType('');
      }
    } catch (e) { console.error(e); }
  };

  // 刷新清單
  useEffect(() => {
    if (activeScenario && activeDeckType) {
      fetchFilteredCards();
    }
  }, [activeScenario, activeDeckType]);

  const fetchFilteredCards = async () => {
    setIsSearching(true);
    try {
      const q = query(
        collection(db, "cards"), 
        where("scenario", "==", activeScenario), 
        where("deckType", "==", activeDeckType)
      );
      const snap = await getDocs(q);
      const items = [];
      snap.forEach(d => items.push(d.data()));
      setCardList(items.sort((a, b) => a.id.localeCompare(b.id)));
    } finally { setIsSearching(false); }
  };

  // BGM 初始化與音量控制修正
  const initBgm = () => {
    if (bgmRef.current) {
      bgmRef.current.stop();
      bgmRef.current.unload();
    }
    bgmRef.current = new Howl({ 
      src: [activeBgm.src], 
      loop: true, 
      volume: bgmVolume, 
      html5: true 
    });
    bgmRef.current.play();
  };

  useEffect(() => {
    if (isUnlocked) initBgm();
  }, [activeBgm, isUnlocked]);

  // 修正拉霸：監聽音量變化並即時更新 Howl 實體
  useEffect(() => {
    if (bgmRef.current) {
      bgmRef.current.volume(bgmVolume);
    }
  }, [bgmVolume]);

  const startRitual = () => {
    setIsUnlocked(true);
    Howler.unload();
    initBgm();
  };

  const playVoice = (url) => {
    if (!isUnlocked || !url) return;
    if (voiceRef.current) voiceRef.current.unload();
    setIsVoicePlaying(true);
    voiceRef.current = new Howl({
      src: [url],
      html5: true, 
      format: ['mp3', 'wav', 'm4a', 'aac'],
      onend: () => setIsVoicePlaying(false),
      onstop: () => setIsVoicePlaying(false),
      onloaderror: () => setIsVoicePlaying(false)
    });
    voiceRef.current.play();
  };

  const handleFolderSelect = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    setUploadStatus('正在初始化');
    let uploadedCount = 0;
    const audioFiles = Array.from(files).filter(f => f.type.startsWith('audio/'));
    const totalFiles = audioFiles.length;

    for (let file of audioFiles) {
      const cardId = file.name.split('.')[0].toUpperCase();
      const pathParts = file.webkitRelativePath.split('/');
      let scen = pathParts.length >= 3 ? pathParts[pathParts.length - 3] : "未分類劇本";
      let deck = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : "未分類牌組";

      setCurrentUploadingFile(cardId);
      setUploadStatus(`同步檔案中`);

      try {
        const storageRef = ref(storage, `audios/${scen}/${deck}/${file.name}`);
        await uploadBytesResumable(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);

        await setDoc(doc(db, "cards", cardId), {
          id: cardId, scenario: scen, deckType: deck, audioUrl: downloadURL, uploadedAt: new Date().toISOString()
        });

        uploadedCount++;
        setUploadProgress(Math.round((uploadedCount / totalFiles) * 100));
      } catch (error) { 
        console.error("上傳失敗:", error);
      }
    }

    setUploadStatus("同步完成");
    setCurrentUploadingFile('');
    await fetchScenarios();
    if (activeScenario) await fetchDecksForScenario(activeScenario);
    setTimeout(() => { setUploadStatus(''); setUploadProgress(0); }, 5000);
  };

  return (
    <div className={`w-screen h-screen flex flex-col theme-relic overflow-hidden font-sans text-[#e0e0e0] bg-[#0a0a0a]`}>
      {!isUnlocked && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6 text-center">
          <button onClick={startRitual} className="px-12 py-5 border-2 border-[#ffb74d] text-[#ffb74d] font-bold hover:bg-[#ffb74d] hover:text-black transition-all tracking-[0.3em]">
            啟動檢索終端
          </button>
        </div>
      )}

      <header className="flex justify-between items-center p-4 border-b border-[#333] bg-[#1a1a1a] z-20">
        <div className="text-xl font-bold text-[#ffb74d] cursor-pointer tracking-tighter" onClick={() => {
          const p = prompt("請輸入密語："); if (p === '0943') setIsAdmin(!isAdmin);
        }}>👁️ 禁忌檔案庫 {isAdmin && <span className="text-[10px] ml-2 text-red-500">[管理模式]</span>}</div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-[#000] px-3 py-1 border border-[#333] text-[10px]">
            <span className="opacity-40 text-[#ffb74d]">BGM</span>
            <select className="bg-transparent outline-none text-[#ffb74d]" value={activeBgm.id} onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}>
              {bgmOptions.map(b => <option key={b.id} value={b.id} className="bg-black">{b.name}</option>)}
            </select>
            {/* 拉霸控制項 */}
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01" 
              value={bgmVolume} 
              onChange={(e) => setBgmVolume(parseFloat(e.target.value))} 
              className="w-24 h-1 accent-[#ffb74d] cursor-pointer" 
            />
          </div>
        </div>
      </header>

      <main className="flex-1 flex p-6 gap-6 overflow-hidden">
        <div className="w-56 flex flex-col gap-6 border-r border-[#333] pr-4 overflow-y-auto">
          <section>
            <p className="text-[#ffb74d] text-[10px] mb-3 opacity-30 uppercase tracking-[0.2em] text-center">劇本清單</p>
            <div className="flex flex-col gap-2">
              {scenarios.map(s => (
                <button key={s} onClick={() => {setActiveScenario(s); setIsAdmin(false);}} className={`p-3 text-[11px] text-left border transition-all ${activeScenario === s ? 'bg-[#ffb74d] text-black border-[#ffb74d] font-bold shadow-[0_0_10px_rgba(255,183,77,0.3)]' : 'border-[#333] opacity-60 hover:opacity-100'}`}>{s}</button>
              ))}
            </div>
          </section>
          
          <section>
            <p className="text-[#ffb74d] text-[10px] mb-3 opacity-30 uppercase tracking-[0.2em] text-center">可選分類</p>
            <div className="flex flex-col gap-2">
              {availableDecks.map(d => (
                <button key={d} onClick={() => {setActiveDeckType(d); setIsAdmin(false);}} className={`p-3 text-[11px] text-left border transition-all ${activeDeckType === d ? 'border-[#ffb74d] text-[#ffb74d] bg-[#ffb74d]/5 font-bold' : 'border-[#333] opacity-40 hover:opacity-100'}`}>{d}</button>
              ))}
              {availableDecks.length === 0 && <p className="text-[10px] text-center opacity-20 italic">查無分類資料</p>}
            </div>
          </section>
        </div>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <div className="flex gap-2">
            <input type="text" placeholder="輸入編號檢索..." className="flex-1 p-4 bg-[#1a1a1a] border border-[#333] text-xl outline-none focus:border-[#ffb74d] transition-colors" value={searchId} onChange={(e) => setSearchId(e.target.value)} />
            <button onClick={() => {
              const id = searchId.trim().toUpperCase();
              if(id) {
                getDoc(doc(db, "cards", id)).then(ds => {
                  if(ds.exists()) { setIsAdmin(false); setCurrentCard(ds.data()); playVoice(ds.data().audioUrl); }
                  else alert("查無編號紀錄");
                });
              }
            }} className="px-8 bg-[#ffb74d] text-black font-bold uppercase hover:bg-[#ffa726]">檢索</button>
          </div>

          <div className="flex-1 border border-[#333] p-8 flex flex-col items-center justify-center relative bg-[#1a1a1a] bg-opacity-40 overflow-y-auto">
            {isAdmin ? (
              <div className="w-full max-w-xl text-center">
                <div className="relative border-2 border-dashed border-[#ffb74d] p-16 bg-black group hover:bg-[#111] transition-all cursor-pointer mb-6">
                  <input type="file" webkitdirectory="true" directory="true" multiple onChange={handleFolderSelect} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                  <div className="flex flex-col items-center gap-4">
                    <span className="text-6xl text-[#ffb74d] animate-pulse">📁</span>
                    <p className="text-xl font-bold tracking-widest">{uploadStatus || "請選擇劇本資料夾"}</p>
                    {currentUploadingFile && <p className="text-xs font-mono text-[#ffb74d]">同步中: {currentUploadingFile}</p>}
                  </div>
                  {uploadProgress > 0 && (
                    <div className="absolute bottom-0 left-0 w-full h-2 bg-[#222]">
                      <div className="h-full bg-[#ffb74d] shadow-[0_0_15px_#ffb74d] transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                      <span className="absolute -top-6 right-0 text-[10px] font-mono text-[#ffb74d]">{uploadProgress}%</span>
                    </div>
                  )}
                </div>
                {/* 回正常模式的按鈕 */}
                <button 
                  onClick={() => setIsAdmin(false)} 
                  className="px-6 py-2 border border-[#333] text-[11px] opacity-40 hover:opacity-100 hover:border-[#ffb74d] hover:text-[#ffb74d] transition-all"
                >
                  關閉管理控制終端
                </button>
              </div>
            ) : currentCard ? (
              <div className="text-center w-full animate-fadeIn">
                <span className="text-[#ffb74d] text-[10px] tracking-[0.4em] uppercase opacity-40">{currentCard.scenario} / {currentCard.deckType}</span>
                <h2 className="text-[10rem] font-black leading-none my-8 tracking-tighter drop-shadow-2xl">{currentCard.id}</h2>
                <button onClick={() => playVoice(currentCard.audioUrl)} className={`w-32 h-32 rounded-full border-2 flex items-center justify-center text-5xl transition-all shadow-lg ${isVoicePlaying ? 'border-[#ffb74d] text-[#ffb74d] animate-pulse shadow-[#ffb74d]/20' : 'border-[#e0e0e0] hover:border-[#ffb74d] hover:text-[#ffb74d]'}`}>
                  {isVoicePlaying ? '🔊' : '▶'}
                </button>
                <button onClick={() => { if(voiceRef.current) voiceRef.current.unload(); setCurrentCard(null); }} className="block mt-10 text-[10px] opacity-30 hover:opacity-100 hover:underline mx-auto tracking-widest">返回列表</button>
              </div>
            ) : (
              <div className="w-full h-full">
                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
                  {cardList.map(card => (
                    <button key={card.id} onClick={() => { setCurrentCard(card); playVoice(card.audioUrl); }} className="aspect-square border border-[#333] bg-[#1a1a1a] flex items-center justify-center text-2xl font-bold hover:border-[#ffb74d] hover:text-[#ffb74d] transition-all hover:scale-105">{card.id}</button>
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

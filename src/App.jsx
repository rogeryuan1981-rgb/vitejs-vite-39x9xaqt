import React, { useState, useEffect } from 'react';
import { Howl } from 'howler';
import { db, storage } from './firebaseConfig'; 
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

const bgmOptions = [
  { id: 'bgm1', name: '音軌 I：無名之霧', src: 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_510b642674.mp3' },
  { id: 'bgm2', name: '音軌 II：深海脈動', src: '' },
  { id: 'bgm3', name: '音軌 III：遠古耳語', src: '' },
  { id: 'bgm4', name: '音軌 IV：溶洞滴水', src: '' },
  { id: 'bgm5', name: '音軌 V：混沌祭祀', src: '' },
];

export default function App() {
  const [theme, setTheme] = useState('theme-relic');
  const [activeBgm, setActiveBgm] = useState(bgmOptions[0]);
  const [bgmVolume, setBgmVolume] = useState(0.2);
  const [bgmSound, setBgmSound] = useState(null);
  
  // 管理員權限與資料庫狀態
  const [isAdmin, setIsAdmin] = useState(false);
  const [dbStatus, setDbStatus] = useState('連線測試中...');
  
  // 上傳與檢索狀態
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchId, setSearchId] = useState('');
  const [currentCard, setCurrentCard] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  // 播放器狀態
  const [voiceSound, setVoiceSound] = useState(null);
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);

  // 測試 Firebase 連線
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocs(collection(db, "system_check"));
        setDbStatus('連線成功 (終端已連線)');
      } catch (error) {
        setDbStatus('連線失敗 (迷失於虛空)');
      }
    };
    testConnection();
  }, []);

  // 背景音樂控制
  useEffect(() => {
    if (bgmSound) bgmSound.stop();
    if (activeBgm.src) {
      const sound = new Howl({ src: [activeBgm.src], loop: true, volume: bgmVolume, html5: true });
      sound.play();
      setBgmSound(sound);
    }
    return () => { if (bgmSound) bgmSound.unload(); };
  }, [activeBgm]);

  useEffect(() => {
    if (bgmSound) bgmSound.volume(bgmVolume);
  }, [bgmVolume]);

  // 隱藏入口
  const handleSecretClick = () => {
    const password = prompt("請輸入古老密語以開啟深淵：");
    if (password === 'phnglui') {
      setIsAdmin(true);
      alert("權限已確認，理智值鎖定。");
    }
  };

  // 核心功能：檢索卡牌
  const handleSearch = async (e) => {
    e.preventDefault();
    const id = searchId.trim().toUpperCase();
    if (!id) return;

    setIsSearching(true);
    setCurrentCard(null);
    if (voiceSound) voiceSound.stop();

    try {
      const docRef = doc(db, "cards", id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setCurrentCard(docSnap.data());
      } else {
        alert("查無此編號，檔案可能已被抹除。");
      }
    } catch (error) {
      console.error("檢索失敗:", error);
    } finally {
      setIsSearching(false);
    }
  };

  // 播放語音導覽
  const playVoice = (url) => {
    if (voiceSound) voiceSound.stop();
    
    const sound = new Howl({
      src: [url],
      html5: true,
      onplay: () => setIsVoicePlaying(true),
      onend: () => setIsVoicePlaying(false),
      onstop: () => setIsVoicePlaying(false)
    });
    
    sound.play();
    setVoiceSound(sound);
  };

  // 處理資料夾批次上傳 (同前次邏輯)
  const handleFolderSelect = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    let validFilesCount = 0;
    let uploadedCount = 0;
    for (let i = 0; i < files.length; i++) if (files[i].type.startsWith('audio/')) validFilesCount++;
    if (validFilesCount === 0) return;

    setUploadStatus(`準備奉獻 ${validFilesCount} 份檔案...`);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('audio/')) continue;
      const cardId = file.name.split('.')[0].toUpperCase();
      const pathParts = file.webkitRelativePath.split('/');
      let scenarioName = pathParts.length >= 3 ? pathParts[pathParts.length - 3] : "未分類劇本";
      let deckType = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : "未分類牌組";

      try {
        const storageRef = ref(storage, `audios/${scenarioName}/${deckType}/${file.name}`);
        await uploadBytesResumable(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        await setDoc(doc(db, "cards", cardId), {
          id: cardId, fileName: file.name, scenario: scenarioName,
          deckType: deckType, audioUrl: downloadURL, uploadedAt: new Date().toISOString()
        });
        uploadedCount++;
        setUploadProgress(Math.round((uploadedCount / validFilesCount) * 100));
      } catch (e) { console.error(e); }
    }
    setUploadStatus(`儀式完成！已編錄 ${uploadedCount} 份檔案。`);
    setTimeout(() => { setUploadStatus(''); setUploadProgress(0); }, 3000);
  };

  return (
    <div className={`w-screen h-screen flex flex-col ${theme}`}>
      <header className="flex justify-between items-center p-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)]">
        <div className="text-xl font-bold cursor-pointer select-none text-[var(--text-highlight)]" onClick={handleSecretClick}>
          👁️ 禁忌檔案庫 {isAdmin && " [管理模式]"}
        </div>
        <div className="flex items-center space-x-6 text-sm">
          <div className="opacity-80">狀態：{dbStatus}</div>
          <div className="flex items-center space-x-2">
            <span>🎵</span>
            <select className="bg-[var(--bg-primary)] border border-[var(--border-color)] p-1 outline-none" value={activeBgm.id} onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}>
              {bgmOptions.map(bgm => <option key={bgm.id} value={bgm.id}>{bgm.name}</option>)}
            </select>
            <input type="range" min="0" max="1" step="0.05" value={bgmVolume} onChange={(e) => setBgmVolume(parseFloat(e.target.value))} className="w-20" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex p-6 gap-6">
        <div className="w-48 flex flex-col gap-4 border-r border-[var(--border-color)] pr-4">
          <button className="p-3 text-left border border-[var(--border-color)] bg-[var(--bg-panel)] hover:border-[var(--text-highlight)] transition">📁 核心卡牌</button>
          <button className="p-3 text-left border border-[var(--border-color)] bg-[var(--bg-panel)] hover:border-[var(--text-highlight)] transition">📁 討論牌組</button>
          <button className="p-3 text-left border border-[var(--border-color)] bg-[var(--bg-panel)] hover:border-[var(--text-highlight)] transition text-[var(--text-highlight)]">📁 調查牌組</button>
        </div>

        <div className="flex-1 flex flex-col gap-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input 
              type="text" placeholder="輸入檢索編號 (例如: 72B)..." 
              className="flex-1 p-3 bg-[var(--bg-panel)] border border-[var(--border-color)] text-[var(--text-primary)] focus:border-[var(--text-highlight)] text-lg outline-none"
              value={searchId} onChange={(e) => setSearchId(e.target.value)}
            />
            <button type="submit" className="px-6 bg-[var(--text-highlight)] text-black font-bold hover:opacity-80 transition">檢索</button>
          </form>
          
          <div className="flex-1 border border-[var(--border-color)] p-6 flex flex-col items-center justify-center relative bg-[var(--bg-panel)] bg-opacity-30">
            {isSearching ? (
              <p className="animate-pulse text-[var(--text-highlight)]">正在從深淵讀取資料...</p>
            ) : currentCard ? (
              <div className="text-center animate-fadeIn w-full max-w-md">
                <div className="mb-2 text-[var(--text-highlight)] text-sm uppercase tracking-widest">{currentCard.scenario} / {currentCard.deckType}</div>
                <h2 className="text-6xl font-bold mb-8 tracking-tighter">{currentCard.id}</h2>
                <button 
                  onClick={() => playVoice(currentCard.audioUrl)}
                  className={`w-24 h-24 rounded-full border-4 flex items-center justify-center text-3xl transition-all ${isVoicePlaying ? 'border-[var(--text-highlight)] animate-ping' : 'border-[var(--text-primary)] hover:scale-110'}`}
                >
                  {isVoicePlaying ? '🔊' : '▶️'}
                </button>
                <p className="mt-6 opacity-60 text-sm">點擊按鈕啟動語音轉譯</p>
              </div>
            ) : isAdmin ? (
              <div className="text-center w-full max-w-lg">
                <h2 className="text-2xl text-[var(--text-highlight)] mb-6 font-bold">管理員控制台</h2>
                <div className="relative p-10 border-2 border-dashed border-[var(--border-color)] hover:border-[var(--text-highlight)] bg-[var(--bg-panel)] transition-all flex flex-col items-center justify-center min-h-[200px]">
                  <input type="file" webkitdirectory="true" directory="true" multiple onChange={handleFolderSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  {uploadStatus ? (
                    <div className="w-full text-center">
                      <p className="mb-4 text-[var(--text-highlight)] font-bold">{uploadStatus}</p>
                      <div className="w-full bg-[var(--bg-primary)] h-2 rounded-full overflow-hidden">
                        <div className="bg-[var(--text-highlight)] h-full transition-all" style={{ width: `${uploadProgress}%` }}></div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <span className="text-5xl mb-4 block">📁</span>
                      <p className="text-xl font-bold">批次上傳資料夾</p>
                      <p className="text-sm opacity-60 mt-2">劇本 / 牌組 / 音檔</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center opacity-40">
                <div className="text-4xl mb-4">🔦</div>
                <p>請輸入卡牌編號以進行聲頻分析</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

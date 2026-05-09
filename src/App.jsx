import React, { useState, useEffect } from 'react';
import { Howl } from 'howler';
import { db, storage } from './firebaseConfig'; 
import { collection, getDocs, doc, setDoc } from "firebase/firestore";
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
  
  // 管理員權限相關
  const [clickCount, setClickCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  // Firebase 連線狀態
  const [dbStatus, setDbStatus] = useState('連線測試中...');
  
  // 上傳進度狀態
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  // 測試 Firebase 連線
  useEffect(() => {
    const testConnection = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "system_check"));
        setDbStatus('連線成功 (終端已連線)');
      } catch (error) {
        console.error("Firebase 連線失敗：", error);
        setDbStatus('連線失敗 (迷失於虛空)');
      }
    };
    testConnection();
  }, []);

  // 處理背景音樂播放與切換
  useEffect(() => {
    if (bgmSound) {
      bgmSound.stop();
    }
    if (activeBgm.src) {
      const sound = new Howl({
        src: [activeBgm.src],
        loop: true,
        volume: bgmVolume,
        html5: true
      });
      sound.play();
      setBgmSound(sound);
    }
    return () => {
      if (bgmSound) bgmSound.unload();
    };
  }, [activeBgm]);

  // 即時調整音量
  useEffect(() => {
    if (bgmSound) {
      bgmSound.volume(bgmVolume);
    }
  }, [bgmVolume]);

  // 隱藏管理員入口邏輯 (連點 5 次)
  const handleSecretClick = () => {
    setClickCount(prev => {
      const newCount = prev + 1;
      if (newCount === 5) {
        const password = prompt("請輸入古老密語以開啟深淵：");
        if (password === 'phnglui') {
          setIsAdmin(true);
          alert("權限已確認，理智值鎖定。");
        } else {
          alert("密語錯誤，凝視深淵者將被吞噬。");
        }
        return 0;
      }
      return newCount;
    });
  };

  // 處理資料夾批次上傳 (支援多層級架構)
  const handleFolderSelect = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let validFilesCount = 0;
    let uploadedCount = 0;

    // 先計算實際的音檔數量
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('audio/')) {
        validFilesCount++;
      }
    }

    if (validFilesCount === 0) {
      alert("未偵測到任何音訊檔案。");
      return;
    }

    setUploadStatus(`準備奉獻 ${validFilesCount} 份檔案...`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = file.name;
      
      if (!file.type.startsWith('audio/')) {
        continue; // 略過非音檔 (如 DS_Store 或隱藏設定檔)
      }

      const cardId = fileName.split('.')[0].toUpperCase();

      // 解析路徑：file.webkitRelativePath 可能是 "阿卡漢音檔/無名之霧/調查牌組/72B.mp3"
      const pathParts = file.webkitRelativePath.split('/');
      let scenarioName = "未分類劇本";
      let deckType = "未分類牌組";

      // 倒數第一層是檔名，倒數第二層是牌組，倒數第三層是劇本
      if (pathParts.length >= 3) {
        deckType = pathParts[pathParts.length - 2];
        scenarioName = pathParts[pathParts.length - 3];
      } else if (pathParts.length === 2) {
        deckType = pathParts[pathParts.length - 2];
      }

      setUploadStatus(`轉移中: [${scenarioName}] ${cardId} (${uploadedCount + 1}/${validFilesCount})`);

      try {
        // 1. 上傳音檔到 Firebase Storage，在雲端也建立對應的資料夾結構
        const storagePath = `audios/${scenarioName}/${deckType}/${fileName}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = await uploadBytesResumable(storageRef, file);
        
        const downloadURL = await getDownloadURL(storageRef);

        // 2. 將包含階層資訊的元數據寫入 Firestore
        await setDoc(doc(db, "cards", cardId), {
          id: cardId,
          fileName: fileName,
          scenario: scenarioName,
          deckType: deckType,
          audioUrl: downloadURL,
          uploadedAt: new Date().toISOString()
        });

        uploadedCount++;
        setUploadProgress(Math.round((uploadedCount / validFilesCount) * 100));

      } catch (error) {
        console.error(`上傳 ${fileName} 失敗:`, error);
        alert(`檔案 ${fileName} 上傳失敗，請檢查網路狀態。`);
      }
    }

    setUploadStatus(`儀式完成！共成功編錄 ${uploadedCount} 份檔案。`);
    setTimeout(() => {
      setUploadStatus('');
      setUploadProgress(0);
    }, 5000);
  };

  return (
    <div className={`w-screen h-screen flex flex-col ${theme}`}>
      {/* 頂部導航列 */}
      <header className="flex justify-between items-center p-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)]">
        <div 
          className="text-xl font-bold cursor-pointer select-none text-[var(--text-highlight)]"
          onClick={handleSecretClick}
        >
          👁️ 禁忌檔案庫 {isAdmin && " [管理模式]"}
        </div>

        <div className="flex items-center space-x-6">
          <div className="text-sm text-[var(--text-highlight)] opacity-80">
            狀態：{dbStatus}
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-sm">🎵</span>
            <select 
              className="bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)] p-1 outline-none text-sm"
              value={activeBgm.id}
              onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}
            >
              {bgmOptions.map(bgm => (
                <option key={bgm.id} value={bgm.id}>{bgm.name}</option>
              ))}
            </select>
            <input 
              type="range" 
              min="0" max="1" step="0.05" 
              value={bgmVolume}
              onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
              className="w-20 cursor-pointer"
            />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-sm">🎨</span>
            <select 
              className="bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)] p-1 outline-none text-sm"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            >
              <option value="theme-relic">深淵遺物</option>
              <option value="theme-insanity">瘋狂視界</option>
              <option value="theme-archive">禁忌調查</option>
            </select>
          </div>
        </div>
      </header>

      {/* 主畫面區塊 */}
      <main className="flex-1 flex p-6 gap-6">
        {/* 左側分類 */}
        <div className="w-48 flex flex-col gap-4 border-r border-[var(--border-color)] pr-4">
          <button className="p-3 text-left border border-[var(--border-color)] bg-[var(--bg-panel)] hover:border-[var(--text-highlight)] transition">📁 核心卡牌</button>
          <button className="p-3 text-left border border-[var(--border-color)] bg-[var(--bg-panel)] hover:border-[var(--text-highlight)] transition">📁 討論牌組</button>
          <button className="p-3 text-left border border-[var(--border-color)] bg-[var(--bg-panel)] hover:border-[var(--text-highlight)] transition">📁 調查牌組</button>
        </div>

        {/* 右側內容與搜尋 */}
        <div className="flex-1 flex flex-col gap-4">
          <input 
            type="text" 
            placeholder="輸入檢索編號 (例如: 72B)..." 
            className="p-3 bg-[var(--bg-panel)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-highlight)] text-lg"
          />
          
          <div className="flex-1 border border-[var(--border-color)] p-6 flex flex-col items-center justify-center text-opacity-50 relative">
            {isAdmin ? (
              <div className="text-center w-full max-w-lg">
                <h2 className="text-2xl text-[var(--text-highlight)] mb-6">管理員控制台</h2>
                
                {/* 批次上傳區塊 */}
                <div className="relative p-10 border-2 border-dashed border-[var(--border-color)] hover:border-[var(--text-highlight)] bg-[var(--bg-panel)] transition-all flex flex-col items-center justify-center min-h-[200px] overflow-hidden group">
                  
                  {/* 隱藏的資料夾選擇輸入框 */}
                  <input 
                    type="file" 
                    webkitdirectory="true" 
                    directory="true" 
                    multiple 
                    onChange={handleFolderSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    title="點擊選擇資料夾"
                  />

                  {uploadStatus ? (
                    <div className="flex flex-col items-center w-full z-0 px-4">
                      <p className="mb-4 text-lg text-[var(--text-highlight)] font-bold">{uploadStatus}</p>
                      <div className="w-full bg-[var(--bg-primary)] h-4 rounded overflow-hidden border border-[var(--border-color)]">
                        <div 
                          className="bg-[var(--text-highlight)] h-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                      <p className="mt-2 text-sm">{uploadProgress}%</p>
                    </div>
                  ) : (
                    <div className="z-0 flex flex-col items-center group-hover:scale-105 transition-transform duration-300">
                      <span className="text-5xl mb-4">📁</span>
                      <p className="text-xl font-bold text-[var(--text-primary)]">點擊此處選擇「根目錄資料夾」</p>
                      <p className="text-md mt-2">支援結構：劇本 / 牌組 / 音檔</p>
                      <p className="text-sm opacity-60 mt-4 text-[var(--text-highlight)]">※ 系統將自動解析路徑並建立 Firebase 索引</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xl">等待檢索指令...</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

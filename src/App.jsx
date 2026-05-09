import React, { useState, useEffect } from 'react';
import { Howl } from 'howler';
import { db } from './firebaseConfig'; 
import { collection, getDocs } from "firebase/firestore";

const bgmOptions = [
  { id: 'bgm1', name: '音軌 I：無名之霧', src: 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_510b642674.mp3' }, // 暫時代用音源
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

  // 測試 Firebase 連線
  useEffect(() => {
    const testConnection = async () => {
      try {
        // 嘗試向資料庫發起一個簡單的讀取請求
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
        html5: true // 適合長音檔
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
        // 設定一組暗號，例如 'phnglui'
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

  return (
    <div className={`w-screen h-screen flex flex-col ${theme}`}>
      {/* 頂部導航列 (Top Bar) */}
      <header className="flex justify-between items-center p-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)]">
        
        {/* 左側：標題與隱藏入口 */}
        <div 
          className="text-xl font-bold cursor-pointer select-none text-[var(--text-highlight)]"
          onClick={handleSecretClick}
        >
          👁️ 禁忌檔案庫 {isAdmin && " [管理模式]"}
        </div>

        {/* 右側：自訂控制區 */}
        <div className="flex items-center space-x-6">
          
          {/* 資料庫狀態 */}
          <div className="text-sm text-[var(--text-highlight)] opacity-80">
            狀態：{dbStatus}
          </div>

          {/* BGM 控制 */}
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

          {/* 風格切換 */}
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
          
          <div className="flex-1 border border-[var(--border-color)] p-6 flex items-center justify-center text-opacity-50">
            {isAdmin ? (
              <div className="text-center">
                <h2 className="text-2xl text-[var(--text-highlight)] mb-4">管理員控制台</h2>
                <button className="p-4 border-2 border-dashed border-[var(--border-color)] hover:border-[var(--text-highlight)] cursor-pointer">
                  拖曳資料夾至此以奉獻新檔案
                </button>
              </div>
            ) : (
              <p>等待檢索指令...</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

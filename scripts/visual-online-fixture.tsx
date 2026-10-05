import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OnlineArena, OnlineOrientationGate, RemotePeerVideo } from '../src/components/OnlineArena';
import { IceBreaker } from '../src/games/ice-breaker';
import { createSeededRandom } from '../src/random';
import '../src/styles.css';

if (!import.meta.env.DEV) throw new Error('Development fixture only.');
const slot = new URLSearchParams(location.search).get('slot') === '2' ? 2 : 1;
function Fixture() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const peerCanvas = document.createElement('canvas');
    peerCanvas.width = 640;
    peerCanvas.height = 480;
    const peerContext = peerCanvas.getContext('2d')!;
    const feed = peerCanvas.captureStream(10);
    setStream(feed);
    let frame = 0;
    const game = new IceBreaker();
    const paint = () => {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#346473';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#a0d9d1';
      context.beginPath();
      context.arc(canvas.width / 2, canvas.height * 0.44, canvas.height * 0.15, 0, Math.PI * 2);
      context.fill();
      game.start(canvas.width, canvas.height, {
        mode: 'online',
        activePlayers: 1,
        localPlayerSlot: slot,
        random: createSeededRandom(42),
      });
      game.draw(context);
      context.fillStyle = 'white';
      context.font = '20px sans-serif';
      context.textAlign = 'center';
      context.fillText(`SEN · P${slot}`, canvas.width / 2, canvas.height * 0.78);
      peerContext.fillStyle = '#785174';
      peerContext.fillRect(0, 0, 640, 480);
      peerContext.fillStyle = '#edbaca';
      peerContext.beginPath();
      peerContext.arc(320, 215, 75, 0, Math.PI * 2);
      peerContext.fill();
      peerContext.fillStyle = 'white';
      peerContext.font = '22px sans-serif';
      peerContext.textAlign = 'center';
      peerContext.fillText('RAKİP · ÖRNEK GÖRÜNTÜ', 320, 380);
      frame = requestAnimationFrame(paint);
    };
    paint();
    return () => {
      cancelAnimationFrame(frame);
      feed.getTracks().forEach((track) => track.stop());
    };
  }, []);
  return (
    <main className="lobby-page online-game-active">
      <OnlineOrientationGate onBack={() => location.assign('/zeygame/')} />
      <OnlineArena
        active
        localName={`Oyuncu ${slot}`}
        remoteName={`Oyuncu ${slot === 1 ? 2 : 1}`}
        localScore={12}
        remoteScore={9}
        gameName="Buz Kırma"
        remaining={14}
        pending={false}
        onBack={() => location.assign('/zeygame/')}
        onFullscreen={() => {}}
        remote={<RemotePeerVideo stream={stream} state="connected" />}
      >
        <section className="game online-session">
          <canvas ref={canvasRef} />
        </section>
      </OnlineArena>
      <span
        style={{ position: 'fixed', bottom: 45, left: 12, zIndex: 90, color: 'white', fontSize: 9 }}
      >
        GÖRSEL TEST · YAPAY GÖRÜNTÜ · GERÇEK KAMERA DEĞİL
      </span>
    </main>
  );
}
createRoot(document.getElementById('app')!).render(<Fixture />);

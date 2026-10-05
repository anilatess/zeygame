import { audio } from './audio';
import { CameraController } from './camera';
import { FaceTracker } from './face-tracker';
import { GameManager } from './game-manager';
import { GameUI } from './game-ui';
import { HandTracker } from './hand-tracker';
import { PlayerTracker, toSinglePlayer, toSoloPlayers } from './player-tracker';
import { PoseTracker } from './pose-tracker';
import type { GameMode, MiniGame, PlayerFace, PlayerPose, PlayersTracking } from './types';

export type GameElements = {
  root: HTMLElement;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
};

/**
 * Framework-independent application controller for one local camera session.
 * React owns the DOM lifetime; this class owns camera/model resources and the
 * high-frequency render/inference loop.
 */
export class GameController {
  private readonly manager: GameManager;
  private readonly camera: CameraController;
  private readonly gameUI: GameUI;
  private readonly handTracker = new HandTracker();
  private readonly playerTracker = new PlayerTracker();
  private readonly poseTracker = new PoseTracker();
  private readonly faceTracker = new FaceTracker();
  private readonly trackers;
  private frame = 0;
  private previous = performance.now();
  private generation = 0;
  private prepared = false;
  private running = false;
  private fps = 0;
  private previousTrackingType: ReturnType<GameManager['getTrackingType']> | null = null;
  private finalNotified = false;
  private previousPublishedScore: number | null = null;

  constructor(
    private readonly elements: GameElements,
    games: MiniGame[],
    private readonly onFinal?: () => void,
    private readonly onScore?: (score: number, final: boolean) => void,
  ) {
    this.manager = new GameManager(games);
    this.camera = new CameraController(elements.video, elements.canvas);
    this.gameUI = new GameUI(elements.root);
    this.trackers = {
      hands: this.handTracker,
      pose: this.poseTracker,
      face: this.faceTracker,
    };
  }

  getManager(): GameManager {
    return this.manager;
  }

  async prepare(
    mode: GameMode,
    selectedIndex?: number,
    localPlayerSlot?: 1 | 2,
    roundSeed?: number,
  ): Promise<boolean> {
    if (this.prepared || this.running) return false;
    this.finalNotified = false;
    this.previousPublishedScore = null;
    if (mode === 'party') this.manager.startParty();
    else if (mode === 'solo-test') this.manager.startSoloTest(this.requireIndex(selectedIndex));
    else if (mode === 'online')
      this.manager.startOnline(this.requireIndex(selectedIndex), localPlayerSlot ?? 1, roundSeed);
    else this.manager.startSingle(this.requireIndex(selectedIndex));
    const generation = ++this.generation;
    audio.unlock();
    try {
      await this.camera.start();
      if (mode === 'online') await this.requiredTracker().load();
      if (generation !== this.generation) {
        this.camera.stop();
        audio.stopAll();
        return false;
      }
      this.prepared = true;
      this.elements.root.classList.toggle('solo-test', this.manager.isSoloTest());
      this.elements.root.classList.toggle('online-session', this.manager.isOnline());
      this.elements.root.classList.toggle(
        'online-player-1',
        this.manager.isOnline() && this.manager.getLocalPlayerSlot() === 1,
      );
      this.elements.root.classList.toggle(
        'online-player-2',
        this.manager.isOnline() && this.manager.getLocalPlayerSlot() === 2,
      );
      return true;
    } catch (error) {
      if (generation === this.generation) {
        audio.stopAll();
        this.manager.reset();
      }
      throw error;
    }
  }

  run(): void {
    if (!this.prepared || this.running) return;
    this.running = true;
    this.manager.enterCalibration();
    this.camera.resize();
    this.previous = performance.now();
    cancelAnimationFrame(this.frame);
    this.render();
    this.elements.root.focus();
  }

  runOnline(
    startDelaySeconds: number,
    roundSeed: number | null = null,
    startAt?: number,
    clockOffsetMs = 0,
  ): boolean {
    if (!this.prepared || this.running || !this.manager.isOnline()) return false;
    this.manager.setOnlineRoundSeed(roundSeed);
    this.running = true;
    this.manager.enterOnlineCalibration(
      startDelaySeconds,
      startAt,
      () => Date.now() + clockOffsetMs,
    );
    this.camera.resize();
    this.previous = performance.now();
    cancelAnimationFrame(this.frame);
    this.render();
    this.elements.root.focus();
    return true;
  }

  stop(): void {
    this.generation++;
    this.prepared = false;
    this.running = false;
    cancelAnimationFrame(this.frame);
    audio.stopAll();
    this.camera.stop();
    this.handTracker.close();
    this.poseTracker.close();
    this.faceTracker.close();
    this.previousTrackingType = null;
    this.previousPublishedScore = null;
    this.manager.reset();
    this.gameUI.reset();
    this.elements.root.classList.remove('solo-test');
    this.elements.root.classList.remove('online-session');
    this.elements.root.classList.remove('online-player-1', 'online-player-2');
    this.modelMessage().hidden = true;
    this.debugPanel().hidden = true;
  }

  replay(): void {
    if (!this.prepared) return;
    audio.stopAll();
    audio.unlock();
    this.manager.reset();
    this.finalNotified = false;
    this.previousPublishedScore = null;
    this.manager.enterCalibration();
    this.gameUI.reset();
    this.elements.root.focus();
    this.previous = performance.now();
  }

  retryModel(): void {
    const tracker = this.requiredTracker();
    if (tracker.state === 'failed') void tracker.retry();
  }

  resize(): void {
    if (this.prepared) {
      // Keep the last landscape geometry while the rotation screen covers play.
      if (this.manager.isOnline() && window.innerHeight > window.innerWidth) return;
      this.camera.resize();
      if (this.elements.canvas.width && this.elements.canvas.height)
        this.manager
          .getCurrentGame()
          .resize?.(this.elements.canvas.width, this.elements.canvas.height);
    }
  }

  getMediaStream(): MediaStream | null {
    return this.camera.getStream();
  }

  setOnlineRemoteScore(playerSlot: 1 | 2, score: number): void {
    this.manager.setOnlineRemoteScore(playerSlot, score);
  }

  private render = (): void => {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min((now - this.previous) / 1000, 0.1);
    this.fps = this.fps ? this.fps * 0.9 + (dt > 0 ? 1 / dt : 0) * 0.1 : dt > 0 ? 1 / dt : 0;
    this.previous = now;
    const rect = this.camera.draw();
    if (!rect) {
      this.gameUI.reset();
      const message = this.cameraMessage();
      message.hidden = false;
      message.textContent = 'Kamera görüntüsü hazırlanıyor…';
      this.frame = requestAnimationFrame(this.render);
      return;
    }
    this.cameraMessage().hidden = true;
    const state = this.manager.getState();
    const type = this.manager.getTrackingType();
    const tracker = this.requiredTracker();
    const needsModel = ['CALIBRATION', 'COUNTDOWN', 'PLAYING'].includes(state);
    if (needsModel && tracker.state === 'idle') void tracker.load();
    const modelReady = tracker.state === 'ready';
    const activeType = needsModel && modelReady ? type : null;
    if (activeType !== this.previousTrackingType) {
      this.clearDetectionsExcept(activeType);
      this.previousTrackingType = activeType;
    }
    const modelMessage = this.modelMessage();
    modelMessage.hidden = !needsModel || modelReady;
    this.query<HTMLElement>('.model-message p').textContent =
      tracker.state === 'failed' ? tracker.errorMessage : 'Takip modeli yükleniyor…';
    const retry = this.query<HTMLButtonElement>('[data-action="retry"]');
    retry.hidden = tracker.state !== 'failed';
    retry.disabled = tracker.state !== 'failed';

    let players =
      activeType === 'hands'
        ? this.playerTracker.classify(this.handTracker.detect(this.elements.video))
        : this.emptyPlayers();
    const poses =
      activeType === 'pose'
        ? this.poseTracker.detect(this.elements.video)
        : [this.emptyPose(), this.emptyPose()];
    players[0].pose = poses[0];
    players[1].pose = poses[1];
    const faces =
      activeType === 'face'
        ? this.faceTracker.detect(this.elements.video)
        : [this.emptyFace(), this.emptyFace()];
    players[0].face = faces[0];
    players[1].face = faces[1];
    if (this.manager.isSoloTest()) players = toSoloPlayers(players);
    if (this.manager.isOnline())
      players = toSinglePlayer(players, this.manager.getLocalPlayerSlot());
    if (
      this.manager.isOnline() &&
      (window.innerHeight > window.innerWidth || document.visibilityState === 'hidden')
    )
      players = this.emptyPlayers();
    if (!this.manager.isSoloTest() && !this.manager.isOnline())
      this.playerTracker.drawRegions(this.elements.canvas);

    this.manager.update(
      dt,
      players,
      this.elements.canvas.width,
      this.elements.canvas.height,
      rect,
      modelReady,
    );
    if (this.manager.isOnline()) {
      const localIndex = this.manager.getLocalPlayerSlot() - 1;
      const localScore = this.manager.getLiveScores()[localIndex];
      if (localScore !== this.previousPublishedScore) {
        this.previousPublishedScore = localScore;
        this.onScore?.(localScore, false);
      }
    }
    if (this.manager.getState() === 'FINAL' && !this.finalNotified) {
      this.finalNotified = true;
      if (this.manager.isOnline()) {
        const localIndex = this.manager.getLocalPlayerSlot() - 1;
        this.onScore?.(this.manager.getLiveScores()[localIndex], true);
      }
      this.onFinal?.();
    }
    this.gameUI.render(
      this.manager,
      players,
      this.requiredTracker().state === 'ready',
      this.manager.getCalibrationReadiness(
        players,
        this.elements.canvas.width,
        this.elements.canvas.height,
        rect,
      ),
    );
    const context = this.elements.canvas.getContext('2d');
    if (context) {
      if (activeType === 'pose') this.poseTracker.draw(context, poses, rect);
      if (activeType === 'face') this.faceTracker.draw(context, faces, rect);
    }
    this.playerTracker.drawLandmarks(this.elements.canvas, players, rect);
    if (context && (!needsModel || modelReady)) this.manager.draw(context);
    this.renderDebug(players, modelReady);
    this.frame = requestAnimationFrame(this.render);
  };

  private requiredTracker() {
    return this.trackers[this.manager.getTrackingType()];
  }

  private clearDetectionsExcept(type: ReturnType<GameManager['getTrackingType']> | null): void {
    if (type !== 'hands') this.handTracker.clearDetections();
    if (type !== 'pose') this.poseTracker.clearDetections();
    if (type !== 'face') this.faceTracker.clearDetections();
  }

  private renderDebug(players: PlayersTracking, modelReady: boolean): void {
    const panel = this.debugPanel();
    panel.hidden = !this.manager.isSoloTest();
    if (panel.hidden) return;
    const labels = {
      hands: 'MediaPipe Hand Landmarker',
      pose: 'MediaPipe Pose Landmarker Lite',
      face: 'MediaPipe Face Landmarker',
    };
    const set = (key: string, value: string) => {
      this.query<HTMLElement>(`[data-debug="${key}"]`).textContent = value;
    };
    const detected = players[0].detected || players[0].pose?.detected || players[0].face.detected;
    set('game', `Oyun: ${this.manager.getGameName()}`);
    set('player', `Player 1: ${detected ? 'detected' : 'not detected'}`);
    set(
      'model',
      `Model: ${labels[this.manager.getTrackingType()]} (${modelReady ? 'ready' : this.requiredTracker().state})`,
    );
    set('fps', `FPS: ${Math.round(this.fps)}`);
    set('score', `Skor: ${this.manager.getLiveScores()[0]}`);
    set('state', `State: ${this.manager.getState()}`);
    set('camera', `Kamera: ${this.camera.isReady() ? 'active' : 'waiting'}`);
  }

  private emptyPose(): PlayerPose {
    return { pose: null, detected: false };
  }

  private emptyFace(): PlayerFace {
    return { face: null, blend: {}, detected: false };
  }

  private emptyPlayers(): PlayersTracking {
    return [
      { hands: [], pose: null, face: this.emptyFace(), detected: false },
      { hands: [], pose: null, face: this.emptyFace(), detected: false },
    ];
  }

  private requireIndex(index: number | undefined): number {
    if (index === undefined) throw new Error('Oyun seçimi gerekli.');
    return index;
  }

  private query<T extends Element>(selector: string): T {
    const node = this.elements.root.querySelector<T>(selector);
    if (!node) throw new Error(`Oyun arayüzü öğesi bulunamadı: ${selector}`);
    return node;
  }

  private cameraMessage(): HTMLElement {
    return this.query('.camera-message');
  }

  private modelMessage(): HTMLElement {
    return this.query('.model-message');
  }

  private debugPanel(): HTMLElement {
    return this.query('.debug-panel');
  }
}

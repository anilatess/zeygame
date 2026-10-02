import type { GameManager } from './game-manager';
import type { PlayersTracking } from './types';

export const gameUiMarkup = `<div class="game-ui">
  <div class="calibration" hidden>
    <div class="calibration-card"><div class="eyebrow">HAZIRLIK</div><h2 tabindex="-1">Yan yana, kameraya!</h2><p data-ui="calibration-instruction">Solda ve sağda birer el gösterin.</p><p class="calibration-status" role="status" aria-live="polite"></p></div>
    <div class="ready-players"><div class="ready-player player-one"><strong>Oyuncu 1 · Sol</strong><span data-ui="ready-one"></span></div><div class="ready-player player-two"><strong>Oyuncu 2 · Sağ</strong><span data-ui="ready-two"></span></div></div>
  </div>
  <div class="play-hud" hidden><div class="hud-player player-one"><span>Oyuncu 1</span><strong data-ui="score-one">0</strong></div><div class="hud-time"><span>Kalan süre</span><strong data-ui="time"></strong></div><div class="hud-player player-two"><span>Oyuncu 2</span><strong data-ui="score-two">0</strong></div></div>
  <div class="countdown-screen" hidden><div class="round-intro"><span class="eyebrow">SIRADAKİ MEYDAN OKUMA</span><h2 data-ui="game-name"></h2><p data-ui="instruction"></p></div><div class="countdown-number" data-ui="countdown"></div><span class="countdown-hint">Hazır ol, hareket sırası sende!</span></div>
  <div class="result-screen" hidden><section class="result-card" aria-labelledby="result-title"><div class="eyebrow" data-ui="result-kicker"></div><h2 id="result-title" tabindex="-1" data-ui="result-title"></h2><p class="winner-label" data-ui="winner" role="status" aria-live="polite"></p><div class="result-scores"><div class="player-one"><span>Oyuncu 1</span><strong data-ui="result-one"></strong><small data-ui="award-one"></small></div><div class="player-two"><span>Oyuncu 2</span><strong data-ui="result-two"></strong><small data-ui="award-two"></small></div></div><p class="next-round" data-ui="next"></p><div class="final-actions" hidden><button data-action="replay">Tekrar Oyna</button><button data-action="choose-another" hidden>Başka Oyun Seç</button><button data-action="home">Ana Menüye Dön</button></div></section></div>
</div>`;

/** Read-only presentation of the real manager and tracker state. */
export class GameUI {
  private previousState = '';
  private nodes = new Map<string, HTMLElement>();
  constructor(private readonly root: HTMLElement) {}
  private node(selector: string): HTMLElement {
    let node = this.nodes.get(selector);
    if (!node) {
      node = this.root.querySelector<HTMLElement>(selector)!;
      this.nodes.set(selector, node);
    }
    return node;
  }
  private text(key: string, value: string): void {
    const node = this.node(`[data-ui="${key}"]`);
    if (node.textContent !== value) node.textContent = value;
  }
  reset(): void {
    this.previousState = '';
    for (const selector of [
      '.calibration',
      '.play-hud',
      '.countdown-screen',
      '.result-screen',
      '.final-actions',
    ])
      this.node(selector).hidden = true;
  }
  render(
    manager: GameManager,
    players: PlayersTracking,
    modelReady: boolean,
    readiness = manager.getCalibrationReadiness(players),
  ): void {
    const state = manager.getState();
    this.node('.calibration').hidden = state !== 'CALIBRATION' || !modelReady;
    this.node('.play-hud').hidden = state !== 'PLAYING' || !modelReady;
    this.node('.countdown-screen').hidden = state !== 'COUNTDOWN' || !modelReady;
    this.node('.result-screen').hidden = state !== 'RESULT' && state !== 'FINAL';
    this.node('.final-actions').hidden = state !== 'FINAL';
    const single = manager.getSession().mode !== 'party';
    const solo = manager.isSoloTest();
    this.node('[data-action="choose-another"]').hidden = state !== 'FINAL' || !single;
    this.node('[data-action="replay"]').textContent = single
      ? 'Aynı Oyunu Tekrar Oyna'
      : 'Tekrar Oyna';
    this.node('[data-action="choose-another"]').textContent = solo
      ? 'Test Listesine Dön'
      : 'Başka Oyun Seç';
    if (state === 'CALIBRATION') {
      const type = manager.getTrackingType();
      const messages = {
        hands: ['✓ El algılandı', '○ Elini göster', 'Solda ve sağda birer el gösterin.'],
        pose: [
          '✓ Gerekli noktalar görünüyor',
          '○ Vücudunu kadraja al',
          'İki tarafta gerekli vücut noktaları görünür olsun.',
        ],
        face: [
          '✓ Yüz algılandı',
          '○ Yüzünü göster',
          'Solda ve sağda birer yüz kameraya dönük olsun.',
        ],
      }[type];
      this.text(
        'calibration-instruction',
        manager.getCurrentGame().calibrationInstruction ?? messages[2],
      );
      this.text('ready-one', messages[readiness[0] ? 0 : 1]);
      this.text('ready-two', messages[readiness[1] ? 0 : 1]);
      const missing =
        type === 'hands'
          ? 'elini göster'
          : type === 'face'
            ? 'yüzünü göster'
            : 'gerekli vücut noktalarını kadraja al';
      const status =
        solo && readiness[0]
          ? ''
          : solo
            ? `Player 1, ${missing}.`
            : readiness[0] && readiness[1]
              ? ''
              : !readiness[0] && !readiness[1]
                ? 'İki taraf da hazır olmalı.'
                : `Oyuncu ${readiness[0] ? 2 : 1}, ${missing}.`;
      if (this.node('.calibration-status').textContent !== status)
        this.node('.calibration-status').textContent = status;
    } else if (state === 'COUNTDOWN') {
      this.text('game-name', manager.getGameName());
      this.text('instruction', manager.getCurrentGame().description.split(/(?<=\.)\s/)[0]);
      this.text('countdown', String(manager.getCountdown()));
    } else if (state === 'PLAYING') {
      const scores = manager.getLiveScores();
      this.text('score-one', String(scores[0]));
      this.text('score-two', String(scores[1]));
      this.text('time', `${manager.getRemainingTime()} sn`);
    } else if (state === 'RESULT' || state === 'FINAL') {
      const final = state === 'FINAL';
      const [one, two] = final && !single ? manager.getTotals() : manager.getScores();
      const tied = one === two;
      this.text(
        'result-kicker',
        single ? 'OYUN TAMAMLANDI' : final ? 'PARTİ TAMAMLANDI · TOPLAM PUAN' : 'TUR TAMAMLANDI',
      );
      this.text('result-title', final && !single ? 'İşte partinin sonucu!' : manager.getGameName());
      this.text(
        'winner',
        solo
          ? `Player 1 test skoru: ${one}`
          : tied
            ? '＝ Berabere! Alkışlar ikinize.'
            : `★ Oyuncu ${one > two ? 1 : 2} ${single ? 'oyunu' : final ? 'partiyi' : 'turu'} kazandı!`,
      );
      this.text('result-one', String(one));
      this.text('result-two', String(two));
      this.text(
        'award-one',
        solo ? 'Test tamamlandı' : tied ? 'Eşit puan' : one > two ? '★ Kazanan' : 'İyi mücadele!',
      );
      this.text(
        'award-two',
        solo ? 'Pasif' : tied ? 'Eşit puan' : two > one ? '★ Kazanan' : 'İyi mücadele!',
      );
      this.text(
        'next',
        final
          ? 'Bir parti daha?'
          : manager.hasNextGame()
            ? `Sonraki oyun: ${manager.getResultCountdown()}`
            : 'Genel sonuç birazdan…',
      );
      this.node('[data-ui="next"]').hidden = single;
      if (final && this.previousState !== 'FINAL') this.node('#result-title').focus();
    }
    this.previousState = state;
  }
}

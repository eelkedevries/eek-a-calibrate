// Details → Device (design §2.17, §3.1, §3.2; spec §17.2.1, §17.4.3, §17.4.6): the live readings,
// one mono line each (distance, estimated unless measured; face size; eye size; head angles;
// phone tilt; light; glare; frame rate), "Measure screen and distance", the advised distances,
// the capability list with the face model's size, the device check's engine timings and the run
// set with its reasons, and "Open diagnostics". Readings come from the running camera's frames;
// without a camera they show a dash. Nothing here is stored.
import manifestUrl from '../../../assets-manifest.json?url';
import { PROBE } from '../../core/constants.ts';
import { ESTIMATOR_NAMES } from '../../core/calibration/select.ts';
import { DistanceTracker, focalFromAssumedFov } from '../../core/geometry/distance.ts';
import { tiltFromGravity } from '../../core/position/tilt.ts';
import { ENGINE_IDS } from '../../core/types.ts';
import type { FrameResult } from '../../core/types.ts';
import { loadManifest } from '../../platform/assets.ts';
import { detectCapabilities, detectDeviceClass, type CapabilityReport } from '../../platform/capabilities.ts';
import { activeMotion } from '../../platform/motion.ts';
import { h } from '../dom.ts';
import { setupRecord } from '../screens/camera.ts';
import { activeCapture } from '../session.ts';
import { registerDetailsTab, rememberDetailsReturn, type DetailsPage, type PageContext } from '../shell/detailsSheet.ts';
import { getState } from '../state.ts';
import { t } from '../strings.en-GB.ts';
import { actionRow, linkButton, note, num, para, reading, sheetPage, stateBadge } from './page.ts';
import { megabytes } from './settings.ts';

const CAPABILITIES: readonly (keyof CapabilityReport)[] = ['secureContext', 'getUserMedia', 'videoFrameCallback', 'wasmSimd', 'webgl2', 'offscreenCanvas', 'moduleWorker', 'fullscreen'];
/** Frames counted in the frame rate shown (design §3.1: a 2 s window). */
const RATE_WINDOW_MS = 2000;

/** What the readings page keeps between its updates. */
class Readings {
  latest: FrameResult | null = null;
  times: number[] = [];
  tracker: DistanceTracker | null = null;
  trackerFocal = 0;
  tilt: { tiltDeg: number; rollDeg: number } | null = null;

  onResult(r: FrameResult): void {
    this.latest = r;
    const now = r.meta.tCaptureMs;
    this.times.push(now);
    while (this.times.length > 0 && (this.times[0] as number) < now - RATE_WINDOW_MS) this.times.shift();
    const f = r.face;
    const focal = this.focalPx(r);
    if (!this.tracker || this.trackerFocal !== focal) {
      this.tracker = new DistanceTracker({ focalPx: focal, irisMm: getState().geometry?.distance.irisMm ?? 11.7 });
      this.trackerFocal = focal;
    }
    try {
      this.tracker.push(now, f ? f.eyes.irisDiamPx : Number.NaN, Boolean(f?.eyes.open));
    } catch {
      this.tracker.reset();
    }
  }

  focalPx(r: FrameResult): number {
    const d = getState().geometry?.distance;
    return d && d.focalSource === 'blind-spot' && d.focalPx > 0 ? d.focalPx : focalFromAssumedFov(r.meta.videoW, r.meta.videoH);
  }

  measured(): boolean {
    return getState().geometry?.distance.focalSource === 'blind-spot';
  }

  rateHz(): number {
    const n = this.times.length;
    if (n < 2) return Number.NaN;
    const span = (this.times[n - 1] as number) - (this.times[0] as number);
    return span > 0 ? ((n - 1) * 1000) / span : Number.NaN;
  }
}

function readingsPage(): DetailsPage {
  return {
    id: 'readings',
    build: (ctx: PageContext) => {
      const state = new Readings();
      const value = (key: string) => h('span', { 'data-reading': key }, t('details.none'));
      const rows: Record<string, HTMLElement> = {};
      const keys = ['distance', 'face', 'eye', 'head', 'tilt', 'light', 'glare', 'rate'] as const;
      for (const key of keys) rows[key] = value(key);
      const status = para(t('details.device.readings.off'));
      const mobile = detectDeviceClass().mobile;
      // The page is cut to fit with the longest text each line can show, so that live values never
      // make it taller than measured; the first update replaces them before the page is painted.
      const longest = (...texts: string[]) => texts.reduce((a, b) => (b.length > a.length ? b : a), '');
      status.textContent = longest(t('details.device.readings.off'), t('details.device.readings.on'), t('details.device.readings.noFace'));
      rows.distance!.textContent = longest(t('details.device.distance.estimated', { cm: '188' }), t('details.device.distance.measured', { cm: '188' }));
      rows.face!.textContent = t('details.device.face.value', { pct: '100' });
      rows.eye!.textContent = t('details.device.eye.value', { px: '88.8' });
      rows.head!.textContent = t('details.device.head.value', { yaw: '-88', pitch: '-88', roll: '-188' });
      rows.tilt!.textContent = longest(t('details.device.tilt.none'), t('details.device.tilt.value', { tilt: '188', roll: '-188' }));
      rows.light!.textContent = t('details.device.light.value', { luma: '255', backlight: '88.88' });
      rows.glare!.textContent = t('details.device.glare.value', { pct: '100.0' });
      rows.rate!.textContent = t('details.device.rate.value', { hz: '188.8' });
      ctx.whileShown(() => {
        const capture = activeCapture();
        const offs: (() => void)[] = [];
        if (capture) offs.push(capture.onResult((r) => state.onResult(r)));
        if (mobile && typeof window.DeviceMotionEvent === 'function') {
          const onMotion = (e: DeviceMotionEvent) => {
            const g = e.accelerationIncludingGravity;
            if (!g || g.x === null || g.y === null || g.z === null) return;
            const tilt = tiltFromGravity([g.x, g.y, g.z], screen.orientation?.angle ?? 0);
            state.tilt = Number.isFinite(tilt.tiltDeg) ? tilt : null;
          };
          window.addEventListener('devicemotion', onMotion);
          offs.push(() => window.removeEventListener('devicemotion', onMotion));
        }
        return () => {
          for (const off of offs) off();
        };
      });
      ctx.every(250, () => {
        const running = activeCapture() !== null;
        status.textContent = running ? (state.latest?.face ? t('details.device.readings.on') : t('details.device.readings.noFace')) : t('details.device.readings.off');
        const f = state.latest?.face ?? null;
        const d = state.tracker?.distanceMm ?? null;
        rows.distance!.textContent = d !== null && running ? t(state.measured() ? 'details.device.distance.measured' : 'details.device.distance.estimated', { cm: (d / 10).toFixed(0) }) : t('details.none');
        rows.face!.textContent = f ? t('details.device.face.value', { pct: (100 * f.quality.faceWidthFrac).toFixed(0) }) : t('details.none');
        rows.eye!.textContent = f ? t('details.device.eye.value', { px: num(f.eyes.irisDiamPx, 1) }) : t('details.none');
        rows.head!.textContent = f ? t('details.device.head.value', { yaw: num(f.pose.yawDeg, 0), pitch: num(f.pose.pitchDeg, 0), roll: num(f.pose.rollDeg, 0) }) : t('details.none');
        // The game's motion source (started by Play, with the iOS permission and the orientation
        // fallback) when it runs; this page's own listener otherwise.
        const game = activeMotion()?.latest();
        const tilt = game && Number.isFinite(game.tiltDeg) ? game : state.tilt;
        rows.tilt!.textContent = !mobile ? t('details.device.tilt.none') : tilt ? t('details.device.tilt.value', { tilt: tilt.tiltDeg.toFixed(0), roll: tilt.rollDeg.toFixed(0) }) : t('details.none');
        rows.light!.textContent = f ? t('details.device.light.value', { luma: num(f.quality.lumaMean, 0), backlight: num(f.quality.backlight, 2) }) : t('details.none');
        rows.glare!.textContent = f ? t('details.device.glare.value', { pct: num(100 * f.quality.glare, 1) }) : t('details.none');
        const hz = state.rateHz();
        rows.rate!.textContent = running && Number.isFinite(hz) ? t('details.device.rate.value', { hz: hz.toFixed(1) }) : t('details.none');
      });
      return sheetPage(
        t('details.device.readings.title'),
        { cls: 'readings' },
        status,
        ...keys.map((key) => reading(t(`details.device.${key}`), rows[key]!)),
        note(t('details.device.readings.note')),
      );
    },
  };
}

function measurePage(): DetailsPage {
  return {
    id: 'measure',
    build: () => {
      const g = getState().geometry;
      const scale = g?.screen.pxPerMmSource ?? 'assumed';
      const measured = g?.distance.focalSource === 'blind-spot';
      return sheetPage(
        t('details.device.measure.title'),
        {},
        para(t('details.device.measure.body')),
        reading(t('details.device.measure.screen'), t(`details.device.measure.screen.${scale}`)),
        reading(t('details.device.measure.distance'), measured && g?.distance.blindSpotMm ? t('details.device.measure.distance.measured', { cm: (g.distance.blindSpotMm / 10).toFixed(0) }) : t('details.device.measure.distance.assumed')),
        actionRow(
          linkButton(t('details.measure'), {
            onClick: () => {
              rememberDetailsReturn();
              location.hash = '#/screen?from=details';
            },
          }),
        ),
      );
    },
  };
}

function advisedPage(): DetailsPage {
  return {
    id: 'advised',
    build: () =>
      sheetPage(
        t('details.device.advised.title'),
        {},
        reading(t('details.advised.portrait'), t('details.advised.portrait.value')),
        reading(t('details.advised.landscape'), t('details.advised.landscape.value')),
        reading(t('details.advised.webcam'), t('details.advised.webcam.value')),
        note(t('details.advised.note')),
      ),
  };
}

let faceModelBytes: number | null = null;
let manifestLoad: Promise<void> | null = null;

function capabilitiesPage(): DetailsPage {
  return {
    id: 'capabilities',
    build: (ctx: PageContext) => {
      if (faceModelBytes === null) {
        manifestLoad ??= loadManifest(manifestUrl)
          .then((m) => {
            faceModelBytes = m.entries.get('face-landmarker')?.bytes ?? null;
            if (faceModelBytes !== null) ctx.refresh();
          })
          .catch(() => undefined);
      }
      const report = detectCapabilities();
      return sheetPage(
        t('details.device.caps.title'),
        {},
        ...CAPABILITIES.map((k) =>
          reading(t(`details.device.cap.${k}`), h('span', { class: 'verdict' }, stateBadge(report[k] ? 'good' : 'lost'), h('span', null, t(report[k] ? 'details.yes' : 'details.no')))),
        ),
        reading(t('details.device.caps.model'), faceModelBytes !== null ? megabytes(faceModelBytes) : t('details.none')),
      );
    },
  };
}

function timingsPage(): DetailsPage {
  return {
    id: 'timings',
    build: () => {
      const setup = setupRecord();
      const probe = setup.probe;
      const decision = setup.runSet;
      if (!probe) return sheetPage(t('details.device.timings.title'), {}, para(t('details.device.timings.none')));
      const ms = (v: number) => (Number.isFinite(v) ? t('details.results.unit.ms', { value: v.toFixed(1) }) : t('details.none'));
      const dropped = new Map((decision?.dropped ?? []).map((d) => [d.engine, d]));
      return sheetPage(
        t('details.device.timings.title'),
        {},
        note(t('details.device.timings.intro', { frames: probe.frames })),
        reading(t('details.device.timings.landmarker'), ms(probe.landmarkerP50Ms)),
        ...ENGINE_IDS.filter((id) => probe.engines[id]).map((id) => {
          const d = dropped.get(id);
          const kept = decision?.runSet.includes(id) ?? false;
          const why = d ? t(`details.device.timings.dropped.${d.reason}`, { budget: PROBE.budgetMs[id as keyof typeof PROBE.budgetMs] ?? PROBE.totalMs, total: PROBE.totalMs }) : t(kept ? 'details.device.timings.kept' : 'details.device.timings.notRun');
          return reading(ESTIMATOR_NAMES[id], [h('span', { class: 'kv__line' }, ms(probe.engines[id]!.p50Ms)), h('span', { class: 'kv__line kv__line--second' }, why)]);
        }),
        decision ? reading(t('details.device.timings.total'), ms(decision.totalP50Ms)) : null,
        decision && !decision.applied ? note(t('details.device.timings.manual')) : null,
        note(t('details.device.timings.heuristic')),
      );
    },
  };
}

function diagnosticsPage(): DetailsPage {
  return {
    id: 'diagnostics',
    build: () =>
      sheetPage(
        t('details.device.lab.title'),
        {},
        para(t('details.device.lab.body')),
        actionRow(
          linkButton(t('details.device.lab.open'), {
            onClick: () => {
              rememberDetailsReturn();
              location.hash = '#/lab?from=details';
            },
          }),
        ),
      ),
  };
}

registerDetailsTab('device', () => [readingsPage(), measurePage(), advisedPage(), capabilitiesPage(), timingsPage(), diagnosticsPage()]);

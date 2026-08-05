// sensors.js — DeviceOrientation tilt input with iOS permission handling,
// neutral-pose calibration, deadzone, clamping, and a low-pass filter.
// Falls back gracefully: if no sensor / permission denied, tilt stays at 0
// and the game uses the pointer-drag fallback in main.js.

export class TiltInput {
  constructor({ deadzoneDeg = 6, rangeDeg = 24, smoothing = 0.18 } = {}) {
    this.deadzone = deadzoneDeg;
    this.range = rangeDeg;
    this.smoothing = smoothing; // 0..1, higher = snappier

    this.available = false; // did we ever receive an orientation event?
    this.enabled = false;   // permission granted + listening

    // neutral pose (whatever angle the child is holding the tablet at)
    this.neutralBeta = null;
    this.neutralGamma = null;

    // smoothed, normalized output in [-1, 1] on each axis
    this.x = 0; // gamma / left-right
    this.y = 0; // beta / front-back

    this._rawBeta = 0;
    this._rawGamma = 0;
    this._onOrient = this._onOrient.bind(this);
  }

  static isSupported() {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  // Must be called from inside a user-gesture handler (a tap) on iOS 13+.
  async requestAndStart() {
    if (!TiltInput.isSupported()) return false;
    try {
      const D = window.DeviceOrientationEvent;
      if (D && typeof D.requestPermission === 'function') {
        const res = await D.requestPermission();
        if (res !== 'granted') return false;
      }
    } catch (_) {
      // Some browsers throw if not from a gesture; treat as unavailable.
      return false;
    }
    window.addEventListener('deviceorientation', this._onOrient, { passive: true });
    this.enabled = true;
    return true;
  }

  stop() {
    window.removeEventListener('deviceorientation', this._onOrient);
    this.enabled = false;
  }

  // Capture the current pose as "flat / neutral". Call on round start and
  // when the child presses Re-center.
  recenter() {
    this.neutralBeta = this._rawBeta;
    this.neutralGamma = this._rawGamma;
    this.x = 0;
    this.y = 0;
  }

  _onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    this.available = true;
    this._rawBeta = e.beta;   // front-back, -180..180
    this._rawGamma = e.gamma; // left-right, -90..90
    if (this.neutralBeta == null) this.recenter();
  }

  // Convert a raw angle delta into a normalized, deadzoned, clamped value.
  _axis(raw, neutral) {
    let d = raw - neutral;
    const s = Math.sign(d);
    const mag = Math.abs(d);
    if (mag < this.deadzone) return 0;
    const scaled = (mag - this.deadzone) / (this.range - this.deadzone);
    return s * Math.max(0, Math.min(1, scaled));
  }

  // Call once per frame. Returns { x, y } smoothed velocity-style input.
  update() {
    if (this.enabled && this.available && this.neutralGamma != null) {
      const tx = this._axis(this._rawGamma, this.neutralGamma);
      const ty = this._axis(this._rawBeta, this.neutralBeta);
      this.x += (tx - this.x) * this.smoothing;
      this.y += (ty - this.y) * this.smoothing;
    }
    return { x: this.x, y: this.y };
  }
}

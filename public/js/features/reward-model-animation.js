// The extracted clips use numeric keyframes and this one breathing expression.
// Keep Molang data as data: never compile or evaluate source strings.
export function animationNumber(value, time) {
  if (typeof value === 'number') return value;
  const match = String(value)
    .trim()
    .match(/^([01])\s*\+\s*math\.sin\(q\.anim_time \* 90\)\s*\*\s*(0\.\d+)$/);
  if (!match) throw new Error(`Unsupported animation expression: ${value}`);
  return Number(match[1]) + Math.sin((time * Math.PI) / 2) * Number(match[2]);
}

const frameCache = new WeakMap();

export function sampleChannel(channel, time, fallback) {
  if (!channel) return [...fallback];
  const vector = (value, phase = 'post') => {
    while (!Array.isArray(value)) value = value.vector || value[phase] || value.post || value.pre;
    return value.map((n) => animationNumber(n, time));
  };
  if (Array.isArray(channel) || channel.vector) return vector(channel);
  let frames = frameCache.get(channel);
  if (!frames) {
    frames = Object.entries(channel).sort(([a], [b]) => Number(a) - Number(b));
    frameCache.set(channel, frames);
  }
  if (time < Number(frames[0][0])) return vector(frames[0][1], 'pre');
  const exact = frames.find(([at]) => Number(at) === time);
  if (exact) return vector(exact[1]);
  for (let i = 1; i < frames.length; i++) {
    if (time <= Number(frames[i][0])) {
      const [previousTime, previous] = frames[i - 1];
      const [nextTime, next] = frames[i];
      let mix = (time - Number(previousTime)) / (Number(nextTime) - Number(previousTime));
      const a = vector(previous);
      const b = vector(next, 'pre');
      const mode = previous.lerp_mode || next.lerp_mode;
      if (mode === 'step') return a;
      if (mode === 'catmullrom') {
        const before = vector(frames[Math.max(0, i - 2)][1]);
        const after = vector(frames[Math.min(frames.length - 1, i + 1)][1], 'pre');
        return a.map(
          (n, axis) =>
            0.5 *
            (2 * n +
              (-before[axis] + b[axis]) * mix +
              (2 * before[axis] - 5 * n + 4 * b[axis] - after[axis]) * mix ** 2 +
              (-before[axis] + 3 * n - 3 * b[axis] + after[axis]) * mix ** 3)
        );
      }
      if (next.easing === 'step') {
        const steps = next.easingArgs?.[0] || 1;
        mix = Math.floor(mix * steps) / steps;
      } else if (next.easing === 'easeOutBack') {
        mix = 1 + 2.70158 * (mix - 1) ** 3 + 1.70158 * (mix - 1) ** 2;
      }
      return a.map((value, axis) => value + (b[axis] - value) * mix);
    }
  }
  return vector(frames.at(-1)[1]);
}

export function companionState(asleep, elapsed, hovered = false, sleepDuration = 2) {
  if (asleep) return elapsed < sleepDuration ? 'sleep' : 'sleepy';
  return hovered ? 'run' : 'idle';
}

export function companionAnimation(animations, clips, asleep, elapsed, hovered, reduced = false) {
  const sleepDuration = animations[clips.sleep].animation_length || 2;
  const state = companionState(asleep, elapsed, hovered, sleepDuration);
  const name = reduced ? (asleep ? clips.sleepy : clips.idle) : clips[state];
  const clip = animations[name];
  // Sleeping loops begin after the actual transition, which varies per model.
  const localTime = state === 'sleepy' ? Math.max(0, elapsed - sleepDuration) : elapsed;
  const loops = state === 'sleepy' || clip.loop === true;
  const time = reduced
    ? 0
    : loops
      ? localTime % (clip.animation_length || 4)
      : Math.min(localTime, clip.animation_length || localTime);
  return { clip, time, state };
}

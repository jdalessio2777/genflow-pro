export const haptics = {
  light: () => {
    try {
      if ('vibrate' in navigator) navigator.vibrate(10)
    } catch(e) {}
  },
  medium: () => {
    try {
      if ('vibrate' in navigator) navigator.vibrate(25)
    } catch(e) {}
  },
  success: () => {
    try {
      if ('vibrate' in navigator)
        navigator.vibrate([10, 50, 10])
    } catch(e) {}
  },
  error: () => {
    try {
      if ('vibrate' in navigator)
        navigator.vibrate([30, 10, 30])
    } catch(e) {}
  }
}
// Note: navigator.vibrate() is blocked on iOS Safari.
// These are silent no-ops on iPhone. Works on Android.

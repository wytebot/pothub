/** Pure lock routing policy so native and browser fallback behavior is testable. */
export function chooseVerificationMode({ native = false, mode = '', available = false, hasFallback = false } = {}) {
  if (native) {
    if (mode === 'pin' || !available) return hasFallback ? 'pin' : 'recovery-required';
    return 'native-biometric';
  }
  if (!available) return hasFallback ? 'pin' : 'recovery-required';
  return 'webauthn';
}

export function nativeEnableMode({ biometricPromptSucceeded = false } = {}) {
  return biometricPromptSucceeded ? 'native' : 'pin';
}

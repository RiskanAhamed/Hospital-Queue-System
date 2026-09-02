import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../utils/api';

export default function LoginScreen() {
  const { login } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [hospitalCode, setHospitalCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // For forgot password modal
  const [isForgot, setIsForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // For reset password modal
  const [isReset, setIsReset] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const handleDemoLogin = () => {
    setEmail('david.m@gmail.com');
    setPassword('patient123');
    setIsRegister(false);
    setIsForgot(false);
    setIsReset(false);
  };

  const handleLoginSubmit = async () => {
    if (!email || !password) {
      setErrorMessage('Please fill in all fields.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429) {
          throw new Error(`🚫 LOCKED OUT: ${text}`);
        }
        throw new Error(text || 'Invalid email or password.');
      }

      const data = await res.json();
      setSuccessMessage('Login successful! Redirecting...');
      setTimeout(async () => {
        await login(data);
      }, 500);
    } catch (err: any) {
      console.error('FULL LOGIN ERROR OBJECT:', err);
      setErrorMessage(err.message || 'Connection error.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async () => {
    if (!name || !email || !password || !hospitalCode) {
      setErrorMessage('Please fill in all fields.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role: 'PATIENT',
          hospitalCode: hospitalCode.trim().toUpperCase(),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Registration failed.');
      }

      const data = await res.json();
      setSuccessMessage('Registration successful! Redirecting...');
      setTimeout(async () => {
        await login(data);
      }, 500);
    } catch (err: any) {
      console.error('FULL REGISTRATION ERROR OBJECT:', err);
      setErrorMessage(err.message || 'Connection error.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail) {
      setErrorMessage('Please enter your email.');
      return;
    }
    setForgotLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuccessMessage(data.message || 'If an account exists, a reset token was logged in server console. Please enter the token below.');
        setResetToken('');
        setIsForgot(false);
        setIsReset(true);
      } else {
        const text = await res.text();
        throw new Error(text || 'Forgot password request failed.');
      }
    } catch (err: any) {
      console.error('FULL FORGOT PASSWORD ERROR OBJECT:', err);
      setErrorMessage(err.message || 'Connection error.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetToken || !newPassword) {
      setErrorMessage('Please fill in all fields.');
      return;
    }
    setResetLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken.trim(), password: newPassword }),
      });
      if (res.ok) {
        setSuccessMessage('Password reset successfully! Please sign in.');
        setIsReset(false);
        setPassword('');
      } else {
        const text = await res.text();
        throw new Error(text || 'Password reset failed.');
      }
    } catch (err: any) {
      console.error('FULL RESET PASSWORD ERROR OBJECT:', err);
      setErrorMessage(err.message || 'Connection error.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>
            {isForgot
              ? 'Reset Password 🔑'
              : isReset
              ? 'Enter New Password 🔐'
              : isRegister
              ? 'Patient Registration 🏥'
              : 'Patient Sign In 🏥'}
          </Text>

          {errorMessage && (
            <View style={styles.errorAlert}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {successMessage && (
            <View style={styles.successAlert}>
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          )}

          {isForgot ? (
            // Forgot Password Screen
            <View style={styles.form}>
              <Text style={styles.subtext}>
                Enter your email address to print a reset token in the Spring Boot server console.
              </Text>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="patient@gmail.com"
                  placeholderTextColor="#64748B"
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={handleForgotPassword}
                disabled={forgotLoading}
              >
                {forgotLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Send Reset Request</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => {
                  setIsForgot(false);
                  setErrorMessage(null);
                }}
              >
                <Text style={styles.linkText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          ) : isReset ? (
            // Reset Password Screen
            <View style={styles.form}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Reset Token</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter reset token from console"
                  placeholderTextColor="#64748B"
                  value={resetToken}
                  onChangeText={setResetToken}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>New Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Min 6 characters"
                  placeholderTextColor="#64748B"
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                  autoCapitalize="none"
                />
              </View>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={handleResetPassword}
                disabled={resetLoading}
              >
                {resetLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Update Password</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => {
                  setIsReset(false);
                  setErrorMessage(null);
                }}
              >
                <Text style={styles.linkText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          ) : !isRegister ? (
            // Login Form
            <View style={styles.form}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="david.m@gmail.com"
                  placeholderTextColor="#64748B"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter password"
                  placeholderTextColor="#64748B"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                />
              </View>

              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={handleLoginSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Sign In</Text>
                )}
              </TouchableOpacity>

              <View style={styles.linksContainer}>
                <TouchableOpacity onPress={() => setIsForgot(true)}>
                  <Text style={styles.linkText}>Forgot password?</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsRegister(true)}>
                  <Text style={styles.linkText}>Register here</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            // Register Form
            <View style={styles.form}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. David Miller"
                  placeholderTextColor="#64748B"
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="david.m@gmail.com"
                  placeholderTextColor="#64748B"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Create password"
                  placeholderTextColor="#64748B"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Hospital Code</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. HOSP001 or HOSP002"
                  placeholderTextColor="#64748B"
                  value={hospitalCode}
                  onChangeText={setHospitalCode}
                  autoCapitalize="characters"
                />
              </View>

              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={handleRegisterSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Register Patient Account</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => setIsRegister(false)}
              >
                <Text style={styles.linkText}>Already registered? Sign in</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Quick Demo Option */}
          <View style={styles.demoBlock}>
            <Text style={styles.demoHeading}>▶ Demo Patient Login:</Text>
            <TouchableOpacity style={styles.demoCard} onPress={handleDemoLogin}>
              <Text style={styles.demoText}>david.m@gmail.com / patient123 (HOSP001)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'rgba(26, 36, 56, 0.85)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 20,
  },
  subtext: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 16,
  },
  errorAlert: {
    padding: 10,
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    borderColor: 'rgba(248, 113, 113, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#F87171',
    fontSize: 13,
    textAlign: 'center',
  },
  successAlert: {
    padding: 10,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderColor: 'rgba(52, 211, 153, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 16,
  },
  successText: {
    color: '#34D399',
    fontSize: 13,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94A3B8',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 14,
  },
  btnPrimary: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    backgroundColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: {
    color: '#090D16',
    fontWeight: '700',
    fontSize: 15,
  },
  linksContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  linkButton: {
    alignSelf: 'center',
    marginTop: 16,
  },
  linkText: {
    color: '#38BDF8',
    fontWeight: '600',
    fontSize: 13,
  },
  demoBlock: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  demoHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
    marginBottom: 8,
  },
  demoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  demoText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
  },
});

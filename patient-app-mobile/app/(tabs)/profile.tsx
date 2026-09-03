import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { disconnectWebSocket } from '../../utils/websocket';
import { authFetch, getErrorMessage } from '../../utils/api';

import { useLanguage } from '../../context/LanguageContext';

export default function ProfileScreen() {
  const { user, hospitalName, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [savingLang, setSavingLang] = useState(false);

  // Change Password state
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  const handlePasswordChange = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwdError('Please fill in all password fields.');
      return;
    }
    if (newPassword.length < 6) {
      setPwdError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('New password and confirm password do not match.');
      return;
    }

    setChangingPassword(true);
    setPwdError(null);
    try {
      const res = await authFetch('/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (res.ok) {
        Alert.alert('Success 🎉', 'Your password has been changed successfully.');
        setPasswordModalVisible(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const errorMsg = await getErrorMessage(res, 'Failed to change password. Please check your current password.');
        setPwdError(errorMsg);
      }
    } catch (e: any) {
      setPwdError(e.message || 'Connection error. Please try again.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLanguageChange = async (lang: 'ta' | 'en') => {
    setSavingLang(true);
    try {
      await setLanguage(lang);
      Alert.alert(
        t.langUpdated,
        lang === 'ta'
          ? 'ஆப் மற்றும் அறிவிப்புகள் இனி தமிழில் வரும். (App set to Tamil)'
          : 'App and notifications are now set to English.'
      );
    } catch (e) {
      console.log('Error updating language preference:', e);
    } finally {
      setSavingLang(false);
    }
  };

  const handleLogout = async () => {
    disconnectWebSocket();
    await logout();
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.myProfile}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Card */}
        <View style={styles.profileHero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(user?.name || '')}</Text>
          </View>
          <Text style={styles.name}>{user?.name || 'Patient Name'}</Text>
          <Text style={styles.email}>{user?.email || 'patient@example.com'}</Text>
        </View>

        {/* Profile Details List */}
        <View style={styles.detailsGroup}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t.registeredHospital}</Text>
            <Text style={styles.detailValue} numberOfLines={1}>
              {hospitalName || 'My Hospital'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t.accountRole}</Text>
            <Text style={[styles.detailValue, styles.roleValue]}>{t.patientRole}</Text>
          </View>

          {/* Notification Language Preference */}
          <View style={[styles.detailRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
            <Text style={styles.detailLabel}>{t.notificationLanguage}</Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  backgroundColor: language === 'ta' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                  borderColor: language === 'ta' ? '#38BDF8' : 'rgba(255, 255, 255, 0.1)',
                  borderWidth: 1,
                  alignItems: 'center',
                }}
                onPress={() => handleLanguageChange('ta')}
                disabled={savingLang}
              >
                <Text style={{ color: language === 'ta' ? '#38BDF8' : '#94A3B8', fontWeight: '700', fontSize: 13 }}>
                  🇮🇳 தமிழ் (Tamil)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  backgroundColor: language === 'en' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                  borderColor: language === 'en' ? '#38BDF8' : 'rgba(255, 255, 255, 0.1)',
                  borderWidth: 1,
                  alignItems: 'center',
                }}
                onPress={() => handleLanguageChange('en')}
                disabled={savingLang}
              >
                <Text style={{ color: language === 'en' ? '#38BDF8' : '#94A3B8', fontWeight: '700', fontSize: 13 }}>
                  🇬🇧 English
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Change Password Row */}
          <TouchableOpacity
            style={[styles.detailRow, { borderBottomWidth: 0, paddingVertical: 14 }]}
            onPress={() => {
              setPwdError(null);
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
              setPasswordModalVisible(true);
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="key-outline" size={18} color="#38BDF8" />
              <Text style={[styles.detailLabel, { color: '#F8FAFC', fontWeight: '600' }]}>
                {t.changePassword}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.btnSignOut} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#F87171" style={{ marginRight: 8 }} />
          <Text style={styles.btnSignOutText}>{t.signOut}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Change Password Modal */}
      <Modal
        visible={passwordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="lock-closed" size={20} color="#38BDF8" />
                <Text style={styles.modalTitle}>Change Password</Text>
              </View>
              <TouchableOpacity onPress={() => setPasswordModalVisible(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {pwdError && (
              <View style={styles.errorAlert}>
                <Text style={styles.errorText}>{pwdError}</Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Current Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[styles.modalInput, { paddingRight: 44 }]}
                  placeholder="Enter current password"
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showCurrentPwd}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowCurrentPwd((prev) => !prev)}
                >
                  <Ionicons
                    name={showCurrentPwd ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#94A3B8"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>New Password (min. 6 characters)</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[styles.modalInput, { paddingRight: 44 }]}
                  placeholder="Enter new password"
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showNewPwd}
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowNewPwd((prev) => !prev)}
                >
                  <Ionicons
                    name={showNewPwd ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#94A3B8"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Confirm New Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[styles.modalInput, { paddingRight: 44 }]}
                  placeholder="Re-enter new password"
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showConfirmPwd}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowConfirmPwd((prev) => !prev)}
                >
                  <Ionicons
                    name={showConfirmPwd ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#94A3B8"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={styles.btnSubmitPassword}
              onPress={handlePasswordChange}
              disabled={changingPassword}
            >
              {changingPassword ? (
                <ActivityIndicator color="#090D16" />
              ) : (
                <Text style={styles.btnSubmitPasswordText}>Update Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
    alignItems: 'center',
  },
  profileHero: {
    alignItems: 'center',
    marginVertical: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1E293B',
    borderColor: '#38BDF8',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  avatarText: {
    color: '#38BDF8',
    fontWeight: '800',
    fontSize: 24,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
  },
  email: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
  detailsGroup: {
    width: '100%',
    backgroundColor: 'rgba(26, 36, 56, 0.5)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  detailLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#38BDF8',
    maxWidth: '60%',
  },
  roleValue: {
    color: '#34D399',
  },
  btnSignOut: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
    borderColor: 'rgba(248, 113, 113, 0.25)',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 10,
  },
  btnSignOutText: {
    color: '#F87171',
    fontWeight: '700',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0F172A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  errorAlert: {
    padding: 10,
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    borderColor: 'rgba(248, 113, 113, 0.3)',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 14,
  },
  errorText: {
    color: '#F87171',
    fontSize: 13,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 14,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
    marginBottom: 6,
  },
  modalInput: {
    width: '100%',
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 12,
    color: '#fff',
    fontSize: 14,
  },
  btnSubmitPassword: {
    width: '100%',
    height: 46,
    borderRadius: 10,
    backgroundColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  btnSubmitPasswordText: {
    color: '#090D16',
    fontWeight: '700',
    fontSize: 14,
  },
  passwordContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
});

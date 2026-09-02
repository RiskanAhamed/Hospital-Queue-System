import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { disconnectWebSocket } from '../../utils/websocket';
import { authFetch } from '../../utils/api';

export default function ProfileScreen() {
  const { user, hospitalName, logout } = useAuth();
  const [selectedLanguage, setSelectedLanguage] = useState<'ta' | 'en'>('ta');
  const [savingLang, setSavingLang] = useState(false);

  const handleLanguageChange = async (lang: 'ta' | 'en') => {
    setSelectedLanguage(lang);
    setSavingLang(true);
    try {
      const res = await authFetch('/auth/profile/language', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang }),
      });
      if (res.ok) {
        Alert.alert(
          'Language Updated',
          lang === 'ta'
            ? 'அறிவிப்புகள் இனி தமிழில் வரும். (Notifications set to Tamil)'
            : 'Notifications will now be delivered in English.'
        );
      }
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
        <Text style={styles.headerTitle}>My Profile</Text>
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
            <Text style={styles.detailLabel}>Registered Hospital</Text>
            <Text style={styles.detailValue} numberOfLines={1}>
              {hospitalName || 'My Hospital'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Account Role</Text>
            <Text style={[styles.detailValue, styles.roleValue]}>Patient</Text>
          </View>

          {/* Notification Language Preference */}
          <View style={[styles.detailRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
            <Text style={styles.detailLabel}>Notification Language (அறிவிப்பு மொழி)</Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  backgroundColor: selectedLanguage === 'ta' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                  borderColor: selectedLanguage === 'ta' ? '#38BDF8' : 'rgba(255, 255, 255, 0.1)',
                  borderWidth: 1,
                  alignItems: 'center',
                }}
                onPress={() => handleLanguageChange('ta')}
                disabled={savingLang}
              >
                <Text style={{ color: selectedLanguage === 'ta' ? '#38BDF8' : '#94A3B8', fontWeight: '700', fontSize: 13 }}>
                  🇮🇳 தமிழ் (Tamil)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  backgroundColor: selectedLanguage === 'en' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                  borderColor: selectedLanguage === 'en' ? '#38BDF8' : 'rgba(255, 255, 255, 0.1)',
                  borderWidth: 1,
                  alignItems: 'center',
                }}
                onPress={() => handleLanguageChange('en')}
                disabled={savingLang}
              >
                <Text style={{ color: selectedLanguage === 'en' ? '#38BDF8' : '#94A3B8', fontWeight: '700', fontSize: 13 }}>
                  🇬🇧 English
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.btnSignOut} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#F87171" style={{ marginRight: 8 }} />
          <Text style={styles.btnSignOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
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
});

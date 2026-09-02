import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { authFetch } from '../../utils/api';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';

interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  departmentName: string;
  appointmentDate: string;
  timeSlot: string;
  queueNumber: string;
  status: 'BOOKED' | 'CHECKED_IN' | 'WAITING' | 'CALLED' | 'IN_CONSULTATION' | 'COMPLETED' | 'CANCELLED';
  rating?: number;
  feedbackComment?: string;
  ratedAt?: string;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  BOOKED: { bg: 'rgba(56,189,248,0.12)', color: '#38BDF8' },
  CHECKED_IN: { bg: 'rgba(56,189,248,0.12)', color: '#38BDF8' },
  WAITING: { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24' },
  CALLED: { bg: 'rgba(168,85,247,0.15)', color: '#C084FC' },
  IN_CONSULTATION: { bg: 'rgba(52,211,153,0.15)', color: '#34D399' },
  COMPLETED: { bg: 'rgba(52,211,153,0.12)', color: '#34D399' },
  CANCELLED: { bg: 'rgba(248,113,113,0.12)', color: '#F87171' },
};

export default function AppointmentsScreen() {
  const { hospitalId, user } = useAuth();
  const router = useRouter();
  const isFocused = useIsFocused();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Rating Modal state
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [selectedApptForRating, setSelectedApptForRating] = useState<Appointment | null>(null);
  const [ratingScore, setRatingScore] = useState(5);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const fetchAppointments = useCallback(async () => {
    if (!hospitalId || !user?.userId) return;

    try {
      const res = await authFetch(`/hospitals/${hospitalId}/appointments?patientId=${user.userId}`);
      if (res.ok) {
        const data: Appointment[] = await res.json();
        // Sort newest first
        const sorted = (data || []).sort((a, b) => {
          const da = a.appointmentDate || '';
          const db = b.appointmentDate || '';
          return db.localeCompare(da) || (b.timeSlot || '').localeCompare(a.timeSlot || '');
        });
        setAppointments(sorted);
      } else {
        console.error('Failed to fetch appointments, status:', res.status);
      }
    } catch (e) {
      console.error('Error fetching appointments:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hospitalId, user?.userId]);

  useEffect(() => {
    if (isFocused) {
      fetchAppointments();
    }
  }, [isFocused]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAppointments();
  };

  const formatSlotTime = (slot: string) => {
    try {
      const [hh, mm] = slot.split(':');
      const h = parseInt(hh, 10);
      const period = h < 12 ? 'AM' : 'PM';
      const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${String(dh).padStart(2, '0')}:${mm} ${period}`;
    } catch (e) {
      return slot;
    }
  };

  const handleCancelAppointment = (id: string) => {
    Alert.alert(
      'Cancel Appointment',
      'Are you sure you want to cancel this appointment?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await authFetch(`/hospitals/${hospitalId}/appointments/${id}/cancel`, {
                method: 'POST',
              });
              if (res.ok) {
                Alert.alert('Success', 'Appointment cancelled.');
                fetchAppointments();
              } else {
                const text = await res.text();
                Alert.alert('Failed', text || 'Could not cancel.');
              }
            } catch (e) {
              Alert.alert('Error', 'Connection error.');
            }
          },
        },
      ]
    );
  };

  const openRatingModal = (appt: Appointment) => {
    setSelectedApptForRating(appt);
    setRatingScore(appt.rating || 5);
    setFeedbackText(appt.feedbackComment || '');
    setRatingModalVisible(true);
  };

  const submitRating = async () => {
    if (!hospitalId || !selectedApptForRating) return;

    setSubmittingRating(true);
    try {
      const res = await authFetch(`/hospitals/${hospitalId}/appointments/${selectedApptForRating.id}/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: ratingScore,
          feedbackComment: feedbackText.trim() || undefined,
        }),
      });

      if (res.ok) {
        Alert.alert('Thank you!', 'Your feedback and star rating have been submitted successfully.');
        setRatingModalVisible(false);
        fetchAppointments();
      } else {
        const errText = await res.text();
        Alert.alert('Error', errText || 'Failed to submit rating.');
      }
    } catch (e) {
      Alert.alert('Error', 'Network connection error.');
    } finally {
      setSubmittingRating(false);
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#38BDF8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Appointments</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <Ionicons name="refresh" size={20} color="#38BDF8" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {appointments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={60} color="#64748B" style={{ marginBottom: 12 }} />
            <Text style={styles.emptyTitle}>No appointments yet</Text>
            <Text style={styles.emptySubtitle}>
              Book your first appointment from the Home tab.
            </Text>
          </View>
        ) : (
          appointments.map((item) => {
            const sc = STATUS_COLORS[item.status] || { bg: 'rgba(255,255,255,0.06)', color: '#94A3B8' };
            const canAction = item.status !== 'CANCELLED' && item.status !== 'COMPLETED';

            return (
              <View key={item.id} style={styles.apptCard}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.doctorName}>{item.doctorName}</Text>
                    <Text style={styles.departmentName}>{item.departmentName}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: sc.color }]}>
                      {item.status}
                    </Text>
                  </View>
                </View>

                {/* Details line */}
                <View style={styles.detailsRow}>
                  <View style={styles.detailItem}>
                    <Ionicons name="calendar-outline" size={14} color="#94A3B8" style={{ marginRight: 4 }} />
                    <Text style={styles.detailText}>{item.appointmentDate}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Ionicons name="time-outline" size={14} color="#94A3B8" style={{ marginRight: 4 }} />
                    <Text style={styles.detailText}>{formatSlotTime(item.timeSlot)}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Ionicons name="bookmark-outline" size={14} color="#94A3B8" style={{ marginRight: 4 }} />
                    <Text style={styles.detailText}>Token {item.queueNumber || '--'}</Text>
                  </View>
                </View>

                {/* Rating section for completed appointments */}
                {item.status === 'COMPLETED' && (
                  <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                    {item.rating ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name="star" size={16} color="#FBBF24" style={{ marginRight: 4 }} />
                          <Text style={{ color: '#FBBF24', fontSize: 13, fontWeight: '700' }}>
                            You Rated: {item.rating}/5
                          </Text>
                          {item.feedbackComment && (
                            <Text style={{ color: '#94A3B8', fontSize: 12, marginLeft: 8, fontStyle: 'italic' }}>
                              "{item.feedbackComment}"
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity onPress={() => openRatingModal(item)}>
                          <Text style={{ color: '#38BDF8', fontSize: 12, fontWeight: '600' }}>Edit</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'rgba(251,191,36,0.12)',
                          borderColor: 'rgba(251,191,36,0.3)',
                          borderWidth: 1,
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          gap: 6,
                        }}
                        onPress={() => openRatingModal(item)}
                      >
                        <Ionicons name="star" size={15} color="#FBBF24" />
                        <Text style={{ color: '#FBBF24', fontSize: 13, fontWeight: '700' }}>
                          Rate Doctor & Consultation
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Actions row */}
                {canAction && (
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.btnReschedule}
                      onPress={() =>
                        router.push({
                          pathname: '/reschedule',
                          params: {
                            apptId: item.id,
                            doctorId: item.doctorId,
                            doctorName: item.doctorName,
                            specialty: item.departmentName,
                          },
                        })
                      }
                    >
                      <Ionicons name="create-outline" size={14} color="#38BDF8" style={{ marginRight: 4 }} />
                      <Text style={styles.btnRescheduleText}>Reschedule</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnCancel}
                      onPress={() => handleCancelAppointment(item.id)}
                    >
                      <Ionicons name="close-circle-outline" size={14} color="#F87171" style={{ marginRight: 4 }} />
                      <Text style={styles.btnCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* 5-Star Doctor Rating Modal */}
      <Modal
        visible={ratingModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRatingModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 360, backgroundColor: '#0F172A', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#F8FAFC', marginBottom: 4, textAlign: 'center' }}>
              Rate Doctor
            </Text>
            <Text style={{ fontSize: 13, color: '#94A3B8', marginBottom: 16, textAlign: 'center' }}>
              {selectedApptForRating?.doctorName} • {selectedApptForRating?.departmentName}
            </Text>

            {/* Stars selector */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setRatingScore(star)}>
                  <Ionicons
                    name={star <= ratingScore ? 'star' : 'star-outline'}
                    size={34}
                    color={star <= ratingScore ? '#FBBF24' : '#64748B'}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Feedback text input */}
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#94A3B8', marginBottom: 6 }}>
              Comments & Review (Optional)
            </Text>
            <TextInput
              style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                borderRadius: 8,
                padding: 10,
                color: '#F8FAFC',
                fontSize: 13,
                height: 70,
                textAlignVertical: 'top',
                marginBottom: 20,
              }}
              placeholder="Share details of your consultation experience..."
              placeholderTextColor="#64748B"
              multiline
              numberOfLines={3}
              value={feedbackText}
              onChangeText={setFeedbackText}
            />

            {/* Buttons */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
                onPress={() => setRatingModalVisible(false)}
                disabled={submittingRating}
              >
                <Text style={{ color: '#94A3B8', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#38BDF8', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
                onPress={submitRating}
                disabled={submittingRating}
              >
                {submittingRating ? (
                  <ActivityIndicator size="small" color="#090D16" />
                ) : (
                  <Text style={{ color: '#090D16', fontWeight: '700' }}>Submit Rating</Text>
                )}
              </TouchableOpacity>
            </View>
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
  loadingContainer: {
    flex: 1,
    backgroundColor: '#090D16',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  refreshBtn: {
    padding: 4,
  },
  scrollContent: {
    padding: 16,
  },
  emptyContainer: {
    paddingVertical: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
  apptCard: {
    backgroundColor: 'rgba(26, 36, 56, 0.75)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  doctorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  departmentName: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    paddingTop: 12,
  },
  btnReschedule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderColor: 'rgba(56, 189, 248, 0.25)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnRescheduleText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  btnCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
    borderColor: 'rgba(248, 113, 113, 0.25)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnCancelText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '600',
  },
});
